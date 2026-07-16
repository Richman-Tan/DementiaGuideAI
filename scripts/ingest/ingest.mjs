#!/usr/bin/env node
// Registry-driven, idempotent knowledge-base ingestion.
//
//   node scripts/ingest/ingest.mjs --doc curated               # one source
//   node scripts/ingest/ingest.mjs --doc curated --dry-run     # plan only
//   node scripts/ingest/ingest.mjs --doc isupport-who-v2026 --prune
//
// Pipeline per registry entry: load → (chunk if raw text) → diff against the
// DB by content_hash → auto-tag + embed only NEW/CHANGED chunks → upsert with
// full provenance → optionally --prune rows whose ids the source no longer
// produces. Unchanged chunks are never re-embedded (fixes the silent-stale-
// chunk bug in the retired migrate-to-supabase.mjs, audit F-10).
//
// Requires: .env with SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL),
// SUPABASE_SERVICE_ROLE_KEY (writes bypass RLS — scripts only, never the app)
// and OPENAI_API_KEY. Migration A (provenance columns) must have been run.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getEntry, REGISTRY } = require('./registry.js');
const { chunkDocument, contentHash, normalise } = require('./chunking.js');
const { EMBEDDING_MODEL, CATEGORIES } = require('../../src/lib/rag/ragConfig.js');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const OPENAI_BASE = 'https://api.openai.com/v1';
const TAG_MODEL = 'gpt-4o-mini';
const EMBED_BATCH = 20;

// ─── Env ──────────────────────────────────────────────────────────────────────
function loadDotEnv(p) {
  const out = {};
  if (!existsSync(p)) return out;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = { ...loadDotEnv(resolve(ROOT, '.env')), ...process.env };
const SUPABASE_URL = env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = env.OPENAI_API_KEY;

// ─── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argVal = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const DOC = argVal('--doc');
const DRY_RUN = args.includes('--dry-run');
const PRUNE = args.includes('--prune');

if (!DOC) {
  console.error('Usage: node scripts/ingest/ingest.mjs --doc <document_id> [--dry-run] [--prune]');
  console.error(`Registered documents: ${REGISTRY.map(e => `${e.document_id}${e.enabled ? '' : ' (disabled)'}`).join(', ')}`);
  process.exit(1);
}
const entry = getEntry(DOC);
if (!entry) {
  console.error(`Unknown document_id '${DOC}'. Add it to scripts/ingest/registry.js first — unregistered content is not ingested.`);
  process.exit(1);
}
if (!entry.enabled) {
  console.error(`'${DOC}' is disabled in the registry (licence gate). Confirm licence/provenance, set enabled: true, then re-run.`);
  process.exit(1);
}
if (!SUPABASE_URL || (!DRY_RUN && !SERVICE_KEY) || !OPENAI_API_KEY) {
  console.error('Missing env: need SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY (unless --dry-run), OPENAI_API_KEY.');
  process.exit(1);
}

// ─── Retry helper: exponential backoff on 429/5xx ─────────────────────────────
async function withRetry(label, fn, tries = 4, baseMs = 1500) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const retryable = /429|5\d\d|ECONNRESET|ETIMEDOUT|fetch failed/i.test(String(e.message));
      if (!retryable || attempt >= tries) throw e;
      const wait = baseMs * 2 ** (attempt - 1);
      console.warn(`  ${label}: attempt ${attempt} failed (${String(e.message).slice(0, 120)}) — retrying in ${wait}ms`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

async function openaiJson(endpoint, body) {
  const r = await fetch(`${OPENAI_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`OpenAI ${endpoint} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// Reads may fall back to the anon key (RLS allows SELECT) so --dry-run can
// show a real diff without the service-role key; writes always need it.
const ANON_KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const sbHeaders = (extra = {}, { write = true } = {}) => {
  const key = write ? SERVICE_KEY : (SERVICE_KEY || ANON_KEY);
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra };
};

// ─── Loaders ──────────────────────────────────────────────────────────────────
// Each returns [{ id, category, title, content, tags?, source_url?, contentHash }].

function loadCuratedJs(entry) {
  // knowledgeBase.js is an ES module data file; extract the array literal.
  const src = readFileSync(resolve(ROOT, entry.local_path), 'utf8')
    .replace(/^export const KNOWLEDGE_BASE/m, 'const KNOWLEDGE_BASE');
  // eslint-disable-next-line no-new-func
  const kb = new Function(`${src}\nreturn KNOWLEDGE_BASE;`)();
  return kb.map(c => ({
    id: c.id, // hand-authored ids preserved (eval labels reference them)
    category: c.category,
    title: c.title,
    content: normalise(c.content),
    tags: c.tags ?? [],
    source_url: c.source_url ?? null,
    source_org: c.source_org ?? entry.source_org,
    contentHash: contentHash(c.title, c.content),
  }));
}

async function loadPdf(entry) {
  const { PDFParse } = require('pdf-parse'); // v2 API
  const path = resolve(ROOT, entry.local_path);
  if (!existsSync(path)) throw new Error(`Source file missing: ${entry.local_path} (see content/sources/MANIFEST.md)`);
  const parser = new PDFParse({ data: readFileSync(path) });
  const result = await parser.getText();
  // pdf-parse v2 inserts "-- N of M --" page separators; they are layout, not content.
  const text = result.text.replace(/^-- \d+ of \d+ --$/gm, '');
  const idBase = entry.document_id.replace(/[^a-z0-9]+/gi, '_').slice(0, 30);
  return chunkDocument(text, { idBase, sourceTitle: entry.title }).map(c => ({
    ...c,
    category: entry.category,
    tags: [],
    source_url: entry.source_url,
    source_org: entry.source_org,
  }));
}

function loadText(entry) {
  const path = resolve(ROOT, entry.local_path);
  if (!existsSync(path)) throw new Error(`Source file missing: ${entry.local_path}`);
  const idBase = entry.document_id.replace(/[^a-z0-9]+/gi, '_').slice(0, 30);
  return chunkDocument(readFileSync(path, 'utf8'), { idBase, sourceTitle: entry.title }).map(c => ({
    ...c,
    category: entry.category,
    tags: [],
    source_url: entry.source_url,
    source_org: entry.source_org,
  }));
}

async function loadUrl(entry) {
  const { JSDOM } = require('jsdom');
  const { Readability } = require('@mozilla/readability');
  const resp = await withRetry('fetch', () => fetch(entry.source_url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DementiaGuideAI-Ingest/2.0)' },
  }));
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${entry.source_url}`);
  const dom = new JSDOM(await resp.text(), { url: entry.source_url });
  const article = new Readability(dom.window.document).parse();
  if (!article) throw new Error('Readability could not parse the page');
  const idBase = entry.document_id.replace(/[^a-z0-9]+/gi, '_').slice(0, 30);
  return chunkDocument(article.textContent, { idBase, sourceTitle: article.title || entry.title }).map(c => ({
    ...c,
    category: entry.category,
    tags: [],
    source_url: entry.source_url,
    source_org: entry.source_org,
  }));
}

const LOADERS = { 'curated-js': loadCuratedJs, pdf: loadPdf, text: loadText, url: loadUrl };

// ─── Tagging & embedding (new/changed chunks only) ────────────────────────────
async function autoTag(chunk) {
  const data = await withRetry(`tag ${chunk.id}`, () => openaiJson('/chat/completions', {
    model: TAG_MODEL,
    max_tokens: 60,
    temperature: 0,
    messages: [
      { role: 'system', content:
        'You are a specialist tagger for a dementia care knowledge base used by caregivers and clinicians. ' +
        'Given a chunk of text, produce ONLY a JSON array of 5 to 8 lowercase tags that are SPECIFIC to the exact content — ' +
        'specific conditions, symptoms, techniques, medications, risk factors, or situations; not generic labels like "dementia" or "caregiving". ' +
        '1-3 words per tag. No explanation, no markdown — only the JSON array.' },
      { role: 'user', content: `Title: ${chunk.title}\n\nContent: ${chunk.content.slice(0, 800)}` },
    ],
  }));
  try {
    const tags = JSON.parse(data.choices[0].message.content.trim());
    return Array.isArray(tags) ? tags.map(String) : [];
  } catch { return []; }
}

async function embedBatch(texts) {
  const data = await withRetry('embed', () => openaiJson('/embeddings', { model: EMBEDDING_MODEL, input: texts }));
  return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
}

// ─── DB diff & upsert ─────────────────────────────────────────────────────────
async function fetchExisting(documentId) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/knowledge_chunks?document_id=eq.${encodeURIComponent(documentId)}&select=id,content_hash`,
    { headers: sbHeaders({}, { write: false }) },
  );
  if (!r.ok) {
    const body = await r.text();
    if (/content_hash|document_id/.test(body) && /column/.test(body)) {
      throw new Error('Provenance columns missing — run scripts/migrations/2026-07-17_a_provenance_columns.sql first.');
    }
    throw new Error(`Existing-rows fetch failed (${r.status}): ${body.slice(0, 200)}`);
  }
  return r.json();
}

async function upsert(rows) {
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const r = await withRetry('upsert', () => fetch(`${SUPABASE_URL}/rest/v1/knowledge_chunks`, {
      method: 'POST',
      headers: sbHeaders({ Prefer: 'resolution=merge-duplicates' }),
      body: JSON.stringify(batch),
    }));
    if (!r.ok) throw new Error(`Upsert failed (${r.status}): ${(await r.text()).slice(0, 300)}`);
  }
}

// `search_vector` powers the keyword half of hybrid retrieval. Production
// reports is_generated = NEVER (unlike the committed supabase-setup.sql, which
// declares it GENERATED ALWAYS), so it must be maintained by a trigger. If that
// trigger is ever missing, inserts silently land with a NULL search_vector and
// the chunk becomes invisible to keyword search while still looking fine in the
// table — exactly the kind of silent corruption that is worth one extra query.
async function assertSearchVectorPopulated(ids) {
  const sample = ids.slice(0, 50);
  const list = sample.map(id => `"${id}"`).join(',');
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/knowledge_chunks?id=in.(${encodeURIComponent(list)})&search_vector=is.null&select=id`,
    { headers: sbHeaders({}, { write: false }) },
  );
  if (!r.ok) {
    console.warn(`  (could not verify search_vector: HTTP ${r.status})`);
    return;
  }
  const nulls = await r.json();
  if (nulls.length > 0) {
    throw new Error(
      `${nulls.length} of ${sample.length} checked chunks have a NULL search_vector (e.g. ${nulls[0].id}).\n` +
      'Keyword retrieval will silently miss them. The trigger that maintains search_vector is missing —\n' +
      'inspect it with scripts/migrations/2026-07-16_production_snapshot_request.sql and restore it before re-ingesting.',
    );
  }
  console.log(`Verified search_vector populated on ${sample.length} written chunk(s).`);
}

async function deleteIds(ids) {
  for (let i = 0; i < ids.length; i += 50) {
    const list = ids.slice(i, i + 50).map(id => `"${id}"`).join(',');
    const r = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_chunks?id=in.(${encodeURIComponent(list)})`, {
      method: 'DELETE',
      headers: sbHeaders(),
    });
    if (!r.ok) throw new Error(`Prune delete failed (${r.status})`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Ingesting '${entry.document_id}' (${entry.loader}: ${entry.local_path ?? entry.source_url})${DRY_RUN ? ' [DRY RUN]' : ''}`);
  const chunks = await LOADERS[entry.loader](entry);
  console.log(`Loaded ${chunks.length} chunks from source.`);

  for (const c of chunks) {
    if (c.category && !CATEGORIES.includes(c.category)) {
      throw new Error(`Chunk ${c.id} has unknown category '${c.category}' (valid: ${CATEGORIES.join(', ')})`);
    }
  }

  let existing = [];
  try {
    existing = await fetchExisting(entry.document_id);
  } catch (e) {
    if (!DRY_RUN) throw e;
    console.warn(`(dry-run) could not diff against DB: ${e.message}`);
  }
  const existingHashById = new Map(existing.map(r => [r.id, r.content_hash]));
  const sourceIds = new Set(chunks.map(c => c.id));

  const unchanged = chunks.filter(c => existingHashById.get(c.id) === c.contentHash);
  const toWrite = chunks.filter(c => existingHashById.get(c.id) !== c.contentHash);
  const orphans = existing.filter(r => !sourceIds.has(r.id)).map(r => r.id);

  console.log(`Diff: ${unchanged.length} unchanged (skipped), ${toWrite.length} new/changed, ${orphans.length} orphaned in DB${PRUNE ? ' (will prune)' : ' (kept; use --prune to remove)'}`);

  if (DRY_RUN) {
    for (const c of toWrite.slice(0, 10)) console.log(`  would write: ${c.id}  "${c.title.slice(0, 70)}"`);
    if (toWrite.length > 10) console.log(`  … and ${toWrite.length - 10} more`);
    return;
  }

  if (toWrite.length > 0) {
    console.log('Tagging new/changed chunks…');
    for (const c of toWrite) {
      if (!c.tags || c.tags.length === 0) c.tags = await autoTag(c);
    }

    console.log('Embedding…');
    const now = new Date().toISOString();
    for (let i = 0; i < toWrite.length; i += EMBED_BATCH) {
      const batch = toWrite.slice(i, i + EMBED_BATCH);
      const vectors = await embedBatch(batch.map(c => `${c.title}. ${c.content}`));
      batch.forEach((c, j) => { c.embedding = vectors[j]; });
      process.stdout.write('.');
    }
    console.log(' done.');

    await upsert(toWrite.map(c => ({
      id: c.id,
      category: c.category,
      title: c.title,
      content: c.content,
      tags: c.tags,
      source_url: c.source_url ?? null,
      source_org: c.source_org ?? entry.source_org,
      embedding: c.embedding,
      document_id: entry.document_id,
      source_version: entry.source_version,
      country: entry.country,
      chunk_level: c.chunk_level ?? null,
      content_hash: c.contentHash,
      embedding_model: EMBEDDING_MODEL,
      embedded_at: now,
      licence: entry.licence,
    })));
    console.log(`Upserted ${toWrite.length} chunks.`);
    await assertSearchVectorPopulated(toWrite.map(c => c.id));
  }

  if (PRUNE && orphans.length > 0) {
    await deleteIds(orphans);
    console.log(`Pruned ${orphans.length} orphaned chunks: ${orphans.slice(0, 8).join(', ')}${orphans.length > 8 ? ', …' : ''}`);
  }

  console.log('Done. Re-run npm run rag:eval:retrieval to verify retrieval after content changes.');
}

main().catch(e => { console.error(`\nERROR: ${e.message}`); process.exit(1); });
