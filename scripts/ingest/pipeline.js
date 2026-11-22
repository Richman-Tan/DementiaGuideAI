// Shared content-processing pipeline: pulled out of ingest.mjs so the admin
// intake endpoint (apps/api/api/admin/ingest.js) can run the exact same
// PDF/URL extraction, chunking, tagging, titling and embedding as the CLI
// script, instead of re-implementing it. No Supabase I/O here — that stays
// CLI-specific in ingest.mjs (its own .env loading, its own retry/backoff),
// and the endpoint does its own writes via apps/api's supabaseAdmin.js.
//
// Pure CJS, like chunking.js and registry.js — required via createRequire
// from ingest.mjs (an .mjs file) and via a deep relative import from
// apps/api's ESM handler (see that file's comment on why not the
// '@dementiaguide/core' package specifier).
const { chunkDocument, stripPdfBoilerplate } = require('./chunking.js');

const TAG_MODEL = 'gpt-4o-mini';

// ─── Retry helper: exponential backoff on 429/5xx ─────────────────────────────
async function withRetry(label, fn, tries = 4, baseMs = 1500) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const retryable = /429|5\d\d|ECONNRESET|ETIMEDOUT|fetch failed/i.test(String(e.message));
      if (!retryable || attempt >= tries) throw e;
      const wait = baseMs * 2 ** (attempt - 1);
      console.warn(
        `  ${label}: attempt ${attempt} failed (${String(e.message).slice(0, 120)}) — retrying in ${wait}ms`
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// ─── Loader halves (I/O in, plain text out — chunking is separate) ───────────

async function pdfBufferToText(buffer) {
  const { PDFParse } = require('pdf-parse'); // v2 API
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  // Strip running headers/footers/logos detected across pages (also removes
  // pdf-parse's "-- N of M --" separators). See chunking.stripPdfBoilerplate.
  return stripPdfBoilerplate(result.text);
}

async function fetchUrlToArticle(url) {
  const { JSDOM } = require('jsdom');
  const { Readability } = require('@mozilla/readability');
  const resp = await withRetry('fetch', () =>
    fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DementiaGuideAI-Ingest/2.0)' },
    })
  );
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
  const dom = new JSDOM(await resp.text(), { url });
  const article = new Readability(dom.window.document).parse();
  if (!article) throw new Error('Readability could not parse the page');
  return { text: article.textContent, title: article.title || null };
}

/** Thin wrapper over chunkDocument — kept here so callers only need one module. */
function textToChunks(text, { idBase, sourceTitle }) {
  return chunkDocument(text, { idBase, sourceTitle });
}

// ─── OpenAI-backed tagging/titling/embedding ──────────────────────────────────
// Bound to one API key per call site: ingest.mjs reads it from its own
// .env-or-process.env resolution, the admin endpoint from process.env
// directly (Vercel sets it on the function). Same models, same prompts.
function makeOpenAIClient(apiKey, { baseUrl = 'https://api.openai.com/v1', embeddingModel } = {}) {
  if (!embeddingModel) throw new Error('makeOpenAIClient requires an embeddingModel');

  async function openaiJson(endpoint, body) {
    const r = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`OpenAI ${endpoint} ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }

  async function autoTag(chunk) {
    const data = await withRetry(`tag ${chunk.id}`, () =>
      openaiJson('/chat/completions', {
        model: TAG_MODEL,
        max_tokens: 60,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'You are a specialist tagger for a dementia care knowledge base used by caregivers and clinicians. ' +
              'Given a chunk of text, produce ONLY a JSON array of 5 to 8 lowercase tags that are SPECIFIC to the exact content — ' +
              'specific conditions, symptoms, techniques, medications, risk factors, or situations; not generic labels like "dementia" or "caregiving". ' +
              '1-3 words per tag. No explanation, no markdown — only the JSON array.',
          },
          {
            role: 'user',
            content: `Title: ${chunk.title}\n\nContent: ${chunk.content.slice(0, 800)}`,
          },
        ],
      })
    );
    try {
      const tags = JSON.parse(data.choices[0].message.content.trim());
      return Array.isArray(tags) ? tags.map(String) : [];
    } catch {
      return [];
    }
  }

  // `avoid`, when set, is a single colliding title from another chunk in the
  // same document — sibling chunks tend to simplify to the same generic
  // phrase independently, which reads as a duplicate/glitch when two
  // citations in one answer show the identical title.
  async function simplifyTitle(chunk, { avoid } = {}) {
    const avoidClause = avoid
      ? ` Another chunk from the same source already uses the title "${avoid}" — make this one clearly distinct while still reflecting THIS excerpt.`
      : '';
    const data = await withRetry(`simplify-title ${chunk.id}`, () =>
      openaiJson('/chat/completions', {
        model: TAG_MODEL,
        max_tokens: 30,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'You write short reference titles for a dementia care app used by family caregivers, many with no ' +
              'clinical or technical background. Given a technical source title and an excerpt, rewrite the title as ' +
              'a plain-language phrase a worried family member would understand at a glance: at most 6 words, no ' +
              'document names, module/section/part numbers, or clinical jargon. Output ONLY the plain title text — ' +
              'no quotes, no explanation.',
          },
          {
            role: 'user',
            content: `Technical title: ${chunk.title}\n\nExcerpt: ${chunk.content.slice(0, 500)}${avoidClause}`,
          },
        ],
      })
    );
    return data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
  }

  // Retries once (flagging the collision) if the simplified title collides
  // with one already assigned among `usedTitles` — then records whichever
  // title wins so later calls in the same batch see it too.
  async function simplifyTitleUnique(chunk, usedTitles) {
    let title = await simplifyTitle(chunk);
    if (usedTitles.has(title)) title = await simplifyTitle(chunk, { avoid: title });
    usedTitles.add(title);
    return title;
  }

  async function embedBatch(texts) {
    const data = await withRetry('embed', () =>
      openaiJson('/embeddings', { model: embeddingModel, input: texts })
    );
    return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }

  return { autoTag, simplifyTitle, simplifyTitleUnique, embedBatch };
}

module.exports = {
  withRetry,
  pdfBufferToText,
  fetchUrlToArticle,
  textToChunks,
  makeOpenAIClient,
};
