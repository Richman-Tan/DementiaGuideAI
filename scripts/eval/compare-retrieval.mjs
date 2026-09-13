#!/usr/bin/env node
// Paired comparison of two retrieval runs over the same labelled questions:
// per-metric mean deltas with a seeded bootstrap CI, and McNemar on hit@5
// (recall@5 = 1) for the binary view. Deterministic; no network.
//
//   node scripts/eval/compare-retrieval.mjs docs/report/eval/retrieval_<sha>_v2.json docs/report/eval/retrieval_<sha>_v2_cap-none.json
import { readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { createRequire } from 'node:module';

import { ROOT } from './lib.mjs';
const require = createRequire(import.meta.url);
const { mean, bootstrapCI, mcnemar } = require('./lib/stats.js');

const [a, b] = process.argv.slice(2);
if (!a || !b) { console.error('Usage: compare-retrieval.mjs <run A.json> <run B.json>'); process.exit(1); }
const A = JSON.parse(readFileSync(resolve(ROOT, a), 'utf8'));
const B = JSON.parse(readFileSync(resolve(ROOT, b), 'utf8'));
const byIdB = Object.fromEntries(B.perQuestion.map(r => [r.id, r]));
const shared = A.perQuestion.filter(r => byIdB[r.id]);
console.log(`Paired retrieval comparison — A: ${basename(a)} (${A.variant ?? 'production'}) vs B: ${basename(b)} (${B.variant ?? 'production'}); ${shared.length} shared questions\n`);
console.log('| Metric | A mean | B mean | Δ (B − A) | 95% bootstrap CI of Δ | questions better / worse in B |');
console.log('|---|---|---|---|---|---|');
for (const k of ['recall@1', 'recall@3', 'recall@5', 'mrr', 'ndcg@5']) {
  const pairs = shared.filter(r => r[k] != null && byIdB[r.id][k] != null);
  const d = pairs.map(r => byIdB[r.id][k] - r[k]);
  const ci = bootstrapCI(d, mean, { iters: 2000, seed: 42 });
  console.log(`| ${k} | ${mean(pairs.map(r => r[k])).toFixed(3)} | ${mean(pairs.map(r => byIdB[r.id][k])).toFixed(3)} | ${mean(d) >= 0 ? '+' : ''}${mean(d).toFixed(3)} | [${ci.lo.toFixed(3)}, ${ci.hi.toFixed(3)}] | ${d.filter(x => x > 0).length} / ${d.filter(x => x < 0).length} |`);
}
const hitA = (r) => r['recall@5'] === 1, hitB = (r) => byIdB[r.id]['recall@5'] === 1;
const bOnly = shared.filter(r => !hitA(r) && hitB(r)).map(r => r.id);
const aOnly = shared.filter(r => hitA(r) && !hitB(r)).map(r => r.id);
const m = mcnemar(aOnly.length, bOnly.length);
console.log(`\nhit@5: A ${shared.filter(hitA).length}/${shared.length}, B ${shared.filter(hitB).length}/${shared.length}; discordant — hit only in A: ${aOnly.join(', ') || 'none'}; hit only in B: ${bOnly.join(', ') || 'none'}; McNemar exact p = ${m.exactP.toFixed(4)}`);
