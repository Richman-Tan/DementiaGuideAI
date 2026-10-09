#!/usr/bin/env node
// Read-only fingerprint of the live knowledge base, compared with the September
// evaluation snapshot (docs/report/kb_chunks_reference.csv, 453 chunks, frozen
// in fa69e62 by `npm run rag:introspect`).
//
// Records what the latency runs were retrieving against (E4-B, and a post-hoc
// note for E4-S). GET requests with the anon key only — nothing is written.
//
//   node scripts/eval/latency/kb-fingerprint.mjs            # JSON to stdout
//
// Fingerprint:
//   count, byCategory
//   idsContentHashSha256  sha256 over the sorted "id\tcontent_hash\n" lines
//                         (the stored hashes — directly comparable with the CSV)
//   recomputed            content_hash recomputed from title + content with the
//                         ingest normaliser (scripts/ingest/chunking.js), and how
//                         many rows match the stored value
//   contentSha256         sha256 over the sorted "id\tsha256(content)\n" lines
//                         (raw content, no normalisation)
//   embeddingSha256       sha256 over the sorted "id\t<pgvector text>\n" lines
//                         (for later comparison; September kept no vectors)
//   embeddedAfterSnapshot rows whose embedded_at is later than the snapshot day
//   vsSeptember           ids added/removed and rows whose content_hash, title
//                         or tags differ from the September CSV
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { ROOT, SUPABASE_URL, SUPABASE_ANON_KEY, requireEnv } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { contentHash } = require('../../ingest/chunking.js');
const { parseCsv } = require('../lib/csv.js');

const SEPTEMBER_CSV = 'docs/report/kb_chunks_reference.csv';
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

async function fetchAll() {
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
  const select = 'id,category,title,tags,content_hash,content,embedded_at,embedding_model';
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_chunks?select=${select}&order=id.asc&limit=1000&offset=${offset}`, { headers });
    if (!r.ok) throw new Error(`knowledge_chunks fetch failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
    const page = await r.json();
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

async function embeddingHash(ids) {
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
  const vec = new Map();
  for (let offset = 0; ; offset += 100) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_chunks?select=id,embedding&order=id.asc&limit=100&offset=${offset}`, { headers });
    if (!r.ok) throw new Error(`embedding fetch failed (${r.status})`);
    const page = await r.json();
    for (const row of page) vec.set(row.id, typeof row.embedding === 'string' ? row.embedding : JSON.stringify(row.embedding));
    if (page.length < 100) break;
  }
  return sha256(ids.map((id) => `${id}\t${vec.get(id) ?? ''}\n`).join(''));
}

export async function kbFingerprint() {
  requireEnv({ openai: false, supabase: true });
  const at = new Date().toISOString();
  const rows = await fetchAll();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ids = [...byId.keys()].sort();
  const byCategory = {};
  for (const r of rows) byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
  let recomputedMatches = 0;
  const recomputedLines = [];
  const contentLines = [];
  for (const id of ids) {
    const r = byId.get(id);
    const h = contentHash(r.title ?? '', r.content ?? '');
    if (h === r.content_hash) recomputedMatches++;
    recomputedLines.push(`${id}\t${h}\n`);
    contentLines.push(`${id}\t${sha256(r.content ?? '')}\n`);
  }
  const SNAPSHOT_DAY = '2026-09-13T00:00:00Z';
  const embeddedAfter = rows.filter((r) => r.embedded_at && r.embedded_at > SNAPSHOT_DAY).map((r) => r.id).sort();
  const models = [...new Set(rows.map((r) => r.embedding_model ?? 'null'))];
  const idsContentHashSha256 = sha256(ids.map((id) => `${id}\t${byId.get(id).content_hash ?? ''}\n`).join(''));

  const sept = parseCsv(readFileSync(resolve(ROOT, SEPTEMBER_CSV), 'utf8'));
  const septById = new Map(sept.map((r) => [r.id, r]));
  const septIds = [...septById.keys()].sort();
  const septHash = sha256(septIds.map((id) => `${id}\t${septById.get(id).content_hash ?? ''}\n`).join(''));
  const added = ids.filter((id) => !septById.has(id));
  const removed = septIds.filter((id) => !byId.has(id));
  const changed = [];
  for (const id of ids) {
    const s = septById.get(id);
    if (!s) continue;
    const r = byId.get(id);
    const diffs = [];
    if ((s.content_hash ?? '') !== (r.content_hash ?? '')) diffs.push('content_hash');
    if ((s.title ?? '') !== (r.title ?? '')) diffs.push('title');
    if ((s.tags ?? '') !== (Array.isArray(r.tags) ? r.tags.join('|') : (r.tags ?? ''))) diffs.push('tags');
    if ((s.category ?? '') !== (r.category ?? '')) diffs.push('category');
    if (diffs.length) changed.push({ id, diffs });
  }
  return {
    at,
    source: `${SUPABASE_URL.replace(/^https?:\/\//, '').split('.')[0]}… knowledge_chunks (anon GET)`,
    count: rows.length,
    byCategory,
    idsContentHashSha256,
    recomputed: { matchesStored: recomputedMatches, of: rows.length, sha256: sha256(recomputedLines.join('')) },
    contentSha256: sha256(contentLines.join('')),
    embeddingSha256: await embeddingHash(ids),
    embeddingModels: models,
    embeddedAfterSnapshot: { since: SNAPSHOT_DAY, count: embeddedAfter.length, latest: rows.map((r) => r.embedded_at).filter(Boolean).sort().at(-1) ?? null },
    vsSeptember: {
      snapshot: `${SEPTEMBER_CSV} (fa69e62, 2026-09-13)`,
      septemberCount: sept.length,
      septemberIdsContentHashSha256: septHash,
      identical: added.length === 0 && removed.length === 0 && changed.length === 0 && septHash === idsContentHashSha256,
      added, removed, changed,
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  kbFingerprint().then((fp) => console.log(JSON.stringify(fp, null, 2))).catch((e) => { console.error(e); process.exit(1); });
}
