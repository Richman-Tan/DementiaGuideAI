#!/usr/bin/env node
// §19A: record which knowledge-base snapshot the answers were generated against
// (plan §19A.5). Read-only GET of knowledge_chunks with the anon key — no write,
// no RPC, no OpenAI. Writes the chunk count and a SHA-256 over (id, sha256(content))
// pairs, so two snapshots can be compared without committing corpus text.
//
//   node scripts/eval/s19a/corpus-snapshot.mjs --label before-generation
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

import { ROOT, SUPABASE_URL, SUPABASE_ANON_KEY, requireEnv } from '../lib.mjs';

const args = process.argv.slice(2);
const label = (() => { const i = args.indexOf('--label'); return i === -1 ? 'snapshot' : args[i + 1]; })();
requireEnv({ openai: false });

const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
const rows = [];
for (let offset = 0; ; offset += 1000) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_chunks?select=id,content&order=id.asc&limit=1000&offset=${offset}`, { headers });
  if (!r.ok) throw new Error(`knowledge_chunks fetch failed (${r.status})`);
  const page = await r.json();
  rows.push(...page);
  if (page.length < 1000) break;
}
const sha = (s) => createHash('sha256').update(s).digest('hex');
const pairs = rows.map(r => [r.id, sha(r.content ?? '')]);
const out = { plan: 'docs/eval/plan-19a-safety.md §19A.5', label, takenAt: new Date().toISOString(), chunks: rows.length, sha256: sha(JSON.stringify(pairs)) };
const dir = resolve(ROOT, 'docs/report/eval/safety');
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, `s19a_corpus-snapshot_${label}.json`), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out));
