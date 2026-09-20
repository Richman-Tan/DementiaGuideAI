#!/usr/bin/env node
// Build the blinded candidate pool for a second retrieval annotator (E1).
//
// For every labelled question: union of the hybrid top-10, the dense-only
// top-10 and the existing labels (relevant + acceptable), shuffled with a
// fixed seed so the annotator cannot tell which candidates are labelled or
// how the retriever ranked them. Passage text is fetched from the live
// knowledge base. Output goes to a git-ignored directory; only the labels the
// annotator produces (chunk ids) are committed later.
//
//   node scripts/eval/build-label-pool.mjs --hybrid <json> --dense <json> --out data/labelpool
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, SUPABASE_URL, SUPABASE_ANON_KEY, requireEnv, gitSha } from './lib.mjs';
import { mulberry32, seededShuffle } from './lib/stats.js';

const require = createRequire(import.meta.url);
const { QUESTIONS } = require('./questions.js');
const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
requireEnv({ openai: false, supabase: true });

const hybrid = JSON.parse(readFileSync(resolve(ROOT, argVal('--hybrid')), 'utf8')).perQuestion;
const dense = JSON.parse(readFileSync(resolve(ROOT, argVal('--dense')), 'utf8')).perQuestion;
const outDir = resolve(ROOT, argVal('--out', 'data/labelpool'));
mkdirSync(outDir, { recursive: true });

const byId = (rows) => Object.fromEntries(rows.map(r => [r.id, r.retrieved.map(x => (typeof x === 'string' ? x : x.id))]));
const H = byId(hybrid), D = byId(dense);
const labelled = QUESTIONS.filter(q => q.relevant?.length);
const rnd = mulberry32(20260919);

const items = [];
const allIds = new Set();
for (const q of labelled) {
  const ids = [...new Set([...(H[q.id] ?? []), ...(D[q.id] ?? []), ...(q.relevant ?? []), ...(q.acceptable ?? [])])];
  const shuffled = seededShuffle(ids, rnd);
  shuffled.forEach(id => allIds.add(id));
  items.push({ id: q.id, set: q.set, category: q.category, question: q.nzVariant ?? q.question, candidates: shuffled });
}

// Fetch passage text for the union.
const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
const idList = [...allIds];
const chunks = {};
for (let i = 0; i < idList.length; i += 60) {
  const slice = idList.slice(i, i + 60);
  const url = `${SUPABASE_URL}/rest/v1/knowledge_chunks?select=id,title,content,category,document_id,tags&id=in.(${slice.map(s => `"${s}"`).join(',')})`;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`);
  for (const row of await r.json()) chunks[row.id] = row;
}
const missing = idList.filter(id => !chunks[id]);
if (missing.length) console.warn(`WARN: ${missing.length} candidate ids not found in knowledge_chunks:`, missing.slice(0, 5));

const pool = { generatedAt: new Date().toISOString(), gitSha: gitSha(), seed: 20260919, questions: items, chunks };
writeFileSync(resolve(outDir, 'pool.json'), JSON.stringify(pool, null, 1));
// The page embeds this file; no ids of the existing labels are marked anywhere in it.
writeFileSync(resolve(outDir, 'items.js'), `window.LABEL_POOL = ${JSON.stringify({ generatedAt: pool.generatedAt, gitSha: pool.gitSha, questions: items, chunks })};\n`);
const n = items.reduce((a, q) => a + q.candidates.length, 0);
console.log(`pool: ${items.length} questions, ${n} candidate judgements (${(n / items.length).toFixed(1)} per question), ${idList.length} distinct passages, text for ${idList.length - missing.length} → ${outDir}`);
