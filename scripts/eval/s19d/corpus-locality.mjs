#!/usr/bin/env node
// §19D (docs/eval/plan-19d-neutral-prompt.md): which knowledge-base snapshot the
// answers were generated against, and how local the library itself is.
// Read-only GET of knowledge_chunks with the anon key — no write, no RPC, no
// OpenAI. Writes the chunk count, the same SHA-256 as §19A's corpus-snapshot.mjs
// (over (id, sha256(content)) pairs, ordered by id), and how many chunks match
// each §19D locality pattern, the chunk count per source organisation, and the
// ids of any chunk that names a foreign signpost or organisation, plus, as ids
// only, which chunks contain 111, an NZ helpline or an NZ anchor and each
// chunk's origin. No corpus text is written.
//
//   node scripts/eval/s19d/corpus-locality.mjs --label before-generation
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

import { ROOT, SUPABASE_URL, SUPABASE_ANON_KEY, requireEnv } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { localityOf } = require('./locality.js');

const args = process.argv.slice(2);
const label = (() => { const i = args.indexOf('--label'); return i === -1 ? 'snapshot' : args[i + 1]; })();
requireEnv({ openai: false });

const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
const rows = [];
for (let offset = 0; ; offset += 1000) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_chunks?select=id,content,source_org&order=id.asc&limit=1000&offset=${offset}`, { headers });
  if (!r.ok) throw new Error(`knowledge_chunks fetch failed (${r.status})`);
  const page = await r.json();
  rows.push(...page);
  if (page.length < 1000) break;
}
const sha = (s) => createHash('sha256').update(s).digest('hex');
const pairs = rows.map(r => [r.id, sha(r.content ?? '')]);

// Origin of a chunk, by its source organisation.
const family = (r) => {
  const org = r.source_org ?? '';
  if (/World Health Organization/.test(org)) return 'WHO (iSupport, international)';
  if (/\bNZ\b|New Zealand|Te Whatu Ora/.test(org)) return 'NZ organisations';
  if (/DementiaGuideAI/.test(org)) return 'this project (NZ-written)';
  return 'other countries (UK, US, Australia, Hong Kong)';
};
const counts = {};
const foreignIds = [];
const bySourceOrg = {};
const chunkOrigin = {};
const idsWith = { has111: [], helplineNamed: [], nzAnchor: [], foreignSignpost: [], foreignOrg: [] };
for (const r of rows) {
  const f = family(r);
  const loc = localityOf(r.content ?? '');
  counts[f] ??= { chunks: 0, foreignEmergency: 0, auService: 0, foreignSignpost: 0, foreign: 0, foreignOrg: 0, has111: 0, helplineNamed: 0, nzAnchor: 0 };
  const c = counts[f];
  c.chunks += 1;
  for (const k of ['foreignEmergency', 'auService', 'foreignSignpost', 'foreign', 'foreignOrg', 'has111', 'helplineNamed', 'nzAnchor']) if (loc[k]) c[k] += 1;
  if (loc.foreign || loc.foreignOrg) foreignIds.push({ id: r.id, family: f, source_org: r.source_org ?? null, foreignEmergency: loc.foreignEmergency, auService: loc.auService, foreignSignpost: loc.foreignSignpost, foreignOrg: loc.foreignOrgMatch });
  bySourceOrg[r.source_org ?? '(none)'] = (bySourceOrg[r.source_org ?? '(none)'] ?? 0) + 1;
  chunkOrigin[r.id] = f;
  for (const k of Object.keys(idsWith)) if (loc[k]) idsWith[k].push(r.id);
}

const out = {
  plan: 'docs/eval/plan-19d-neutral-prompt.md',
  label,
  takenAt: new Date().toISOString(),
  chunks: rows.length,
  sha256: sha(JSON.stringify(pairs)),
  hashNote: 'same algorithm as scripts/eval/s19a/corpus-snapshot.mjs, so it compares directly with docs/report/eval/safety/s19a_corpus-snapshot_*.json',
  localityCountsByFamily: counts,
  chunksBySourceOrg: Object.fromEntries(Object.entries(bySourceOrg).sort((a, b) => b[1] - a[1])),
  chunksNamingAForeignSignpostOrOrganisation: foreignIds,
  // Metadata only (ids, no text): lets the analysis tell, per item, whether a
  // retrieved passage itself contains 111, an NZ helpline or a foreign name.
  chunkIdsWith: idsWith,
  chunkOrigin,
};
const dir = resolve(ROOT, 'docs/report/eval/safety');
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, `s19d_corpus-locality_${label}.json`), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out, null, 2));
