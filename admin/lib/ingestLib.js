/**
 * Server-side only — ingest logic shared by the /api/ingest route.
 * Handles URL extraction, PDF extraction, chunking, and auto-tagging.
 */

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

const OPENAI_BASE    = 'https://api.openai.com/v1';
const CHAT_MODEL     = 'gpt-4o-mini';
const CHUNK_WORDS    = 500;
const OVERLAP_WORDS  = 50;
const MIN_CHUNK_WORDS = 40;

// ─── Text extraction ──────────────────────────────────────────────────────────

export async function extractFromUrl(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DementiaGuideAI-Admin/1.0)' },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
  const html = await resp.text();
  const dom  = new JSDOM(html, { url });
  const reader  = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article) throw new Error('Could not parse page — it may be a JavaScript-heavy SPA. Try a different URL.');
  return { text: article.textContent, title: article.title };
}

export async function extractFromPdf(arrayBuffer, filename) {
  // Use dynamic require to bypass Next.js bundler (pdf-parse is CJS)
  const pdfParse = (await import('pdf-parse')).default;
  const buffer   = Buffer.from(arrayBuffer);
  const data     = await pdfParse(buffer);
  const title    = (filename || 'document')
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_]/g, ' ');
  return { text: data.text, title };
}

// ─── Chunking ─────────────────────────────────────────────────────────────────

export function chunkText(text, sourceTitle, { category, sourceUrl, sourceOrg, prefix }) {
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();

  const paragraphs = clean
    .split(/\n{2,}/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(p => p.length > 0);

  const chunks  = [];
  let current   = [];
  let wordCount = 0;

  for (const para of paragraphs) {
    const words = para.split(' ');
    if (wordCount + words.length > CHUNK_WORDS && wordCount > 0) {
      const t = current.join(' ').trim();
      if (t.split(' ').length >= MIN_CHUNK_WORDS) {
        chunks.push(t);
      } else if (chunks.length > 0) {
        chunks[chunks.length - 1] += ' ' + t;
      }
      const overlap = current.join(' ').split(' ').slice(-OVERLAP_WORDS);
      current   = [overlap.join(' '), para];
      wordCount = overlap.length + words.length;
    } else {
      current.push(para);
      wordCount += words.length;
    }
  }

  if (current.length > 0) {
    const t = current.join(' ').trim();
    if (t.split(' ').length >= MIN_CHUNK_WORDS) {
      chunks.push(t);
    } else if (chunks.length > 0) {
      chunks[chunks.length - 1] += ' ' + t;
    } else {
      chunks.push(t);
    }
  }

  const idBase = (prefix || sourceTitle)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 30);

  return chunks.map((content, idx) => ({
    id:         `${idBase}_${String(idx + 1).padStart(3, '0')}`,
    category,
    title:      chunks.length === 1 ? sourceTitle : `${sourceTitle} (Part ${idx + 1})`,
    content,
    tags:       [],
    source_url: sourceUrl || null,
    source_org: sourceOrg || null,
    embedding:  null,
  }));
}

// ─── Auto-tagging ─────────────────────────────────────────────────────────────

export async function autoTagChunks(chunks) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return; // silently skip if key not configured

  for (const chunk of chunks) {
    try {
      const resp = await fetch(`${OPENAI_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model:       CHAT_MODEL,
          max_tokens:  60,
          temperature: 0,
          messages: [
            {
              role:    'system',
              content:
                'You are a specialist tagger for a dementia care knowledge base. ' +
                'Given a chunk of text, produce ONLY a JSON array of 5 to 8 lowercase tags ' +
                'that are SPECIFIC to the exact content — not generic dementia labels. ' +
                'Rules: (1) Include the specific disease type if mentioned. ' +
                '(2) Include specific symptoms or behaviours. ' +
                '(3) Include specific interventions or strategies. ' +
                '(4) Include specific medications if named. ' +
                '(5) Include the target audience if clear. ' +
                '(6) Use 1-3 words per tag, all lowercase. ' +
                '(7) Return ONLY the JSON array — no markdown, no explanation. ' +
                'Bad: ["dementia","memory","caregiving","brain"]. ' +
                'Good: ["alzheimer\'s disease","amyloid plaques","early diagnosis","MCI","risk factors","family carer"]',
            },
            {
              role:    'user',
              content: `Title: ${chunk.title}\n\nContent: ${chunk.content.slice(0, 800)}`,
            },
          ],
        }),
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      const raw  = data.choices[0].message.content.trim();
      chunk.tags = JSON.parse(raw);
    } catch {
      // leave tags as [] if anything fails
    }
  }
}
