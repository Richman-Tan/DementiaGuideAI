#!/usr/bin/env node
// Retrieval parameter sweep: min_similarity × source-family cap, scored with
// the deterministic metrics over the labelled question set. One embedding per
// question; one match_chunks call per (question, threshold); cap variants are
// applied client-side exactly as production does.
//
//   node scripts/eval/sweep.mjs
//   node scripts/eval/sweep.mjs --thresholds 0.15,0.25,0.35 --caps 1,2,3
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

import { requireEnv, embed, gitSha, outDir, sleep, SUPABASE_URL, SUPABASE_ANON_KEY } from './lib.mjs';

const require = createRequire(import.meta.url);
const { QUESTIONS, questionText } = require('./questions.js');
const { scoreQuestion, aggregate } = require('./metrics.js');
const { TOP_K, RETRIEVAL_OVERSAMPLE, MIN_SIMILARITY, MAX_PER_SOURCE_FAMILY } = require('../../src/lib/rag/ragConfig.js');
const { capBySourceFamily } = require('../../src/lib/rag/retrieval.js');

const args = process.argv.slice(2);
const argVal = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const THRESHOLDS = (argVal('--thresholds') ?? '0.15,0.20,0.25,0.30,0.35').split(',').map(Number);
const CAPS = (argVal('--caps') ?? '1,2,3').split(',').map(Number);

const labelled = QUESTIONS.filter(q => (q.relevant.length || q.acceptable.length) && !q.pendingContent);
const metricKeys = ['recall@1', 'recall@3', 'recall@5', 'precision@5', 'mrr', 'ndcg@5'];

async function rpc(embedding, text, minSimilarity) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_chunks`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query_embedding: embedding,
      query_text: text,
      match_count: TOP_K * RETRIEVAL_OVERSAMPLE,
      min_similarity: minSimilarity,
    }),
  });
  if (!r.ok) throw new Error(`match_chunks failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function main() {
  requireEnv();
  console.log(`Sweep: thresholds ${THRESHOLDS.join('/')} × caps ${CAPS.join('/')} over ${labelled.length} labelled questions`);
  console.log(`(production config: min_similarity=${MIN_SIMILARITY}, cap=${MAX_PER_SOURCE_FAMILY})\n`);

  // Embed once per question.
  const embedded = [];
  for (const q of labelled) {
    embedded.push({ q, embedding: await embed(questionText(q, 'v2')) });
    await sleep(120);
  }

  const grid = [];
  for (const threshold of THRESHOLDS) {
    // Fetch the 50-candidate pool once per (question, threshold).
    const pools = [];
    for (const { q, embedding } of embedded) {
      pools.push({ q, rows: await rpc(embedding, questionText(q, 'v2'), threshold) });
      await sleep(120);
    }
    for (const cap of CAPS) {
      const rows = pools.map(({ q, rows }) => {
        const top = capBySourceFamily(rows, TOP_K, cap).map(r => r.id);
        return scoreQuestion({ retrieved: top, relevant: q.relevant, acceptable: q.acceptable });
      });
      const agg = aggregate(rows);
      grid.push({ threshold, cap, ...Object.fromEntries(metricKeys.map(k => [k, agg[k]])) });
      console.log(`min_sim=${threshold.toFixed(2)} cap=${cap}  ` + metricKeys.map(k => `${k}=${agg[k]?.toFixed(4)}`).join('  '));
    }
  }

  const outPath = resolve(outDir(), `sweep_${gitSha()}.json`);
  writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), gitSha: gitSha(), n: labelled.length, grid }, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
