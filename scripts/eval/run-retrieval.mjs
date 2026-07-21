#!/usr/bin/env node
// Deterministic retrieval evaluation over the labelled question sets.
//
// Usage:
//   node scripts/eval/run-retrieval.mjs                 # live retrieval, v2 question wording
//   node scripts/eval/run-retrieval.mjs --questions v1  # original wording (baseline comparability)
//   node scripts/eval/run-retrieval.mjs --from-audit docs/report/baseline/rag_eval_results.audit.json
//                                                       # recompute metrics from a saved run (no API calls)
//   node scripts/eval/run-retrieval.mjs --out <path.json>
//
// Metrics per labelled question: recall@{1,3,5}, precision@5, MRR, nDCG@5
// (relevant gain 2, acceptable gain 1). Aggregated per set and overall.
// Zero LLM involvement — see docs/rag-evaluation-plan.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

import { requireEnv, retrieve, gitSha, outDir, csvEscape, sleep, ROOT } from './lib.mjs';

const require = createRequire(import.meta.url);
const { QUESTIONS, questionText } = require('./questions.js');
const { scoreQuestion, aggregate } = require('./metrics.js');

const args = process.argv.slice(2);
const argVal = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const QUESTION_VERSION = argVal('--questions') ?? 'v2';
const FROM_AUDIT = argVal('--from-audit');
const OUT = argVal('--out');

// Labelled questions only (A / A-neighbour, plus N once labels exist).
const labelled = QUESTIONS.filter(q => (q.relevant.length || q.acceptable.length) && !q.pendingContent);

async function retrievedIdsLive(q) {
  const rows = await retrieve(questionText(q, QUESTION_VERSION));
  return { ids: rows.map(r => r.id), topSimilarity: rows[0]?.similarity ?? null };
}

function retrievedIdsFromAudit(auditPath) {
  const audit = JSON.parse(readFileSync(resolve(ROOT, auditPath), 'utf8'));
  const byId = {};
  const rows = Array.isArray(audit) ? audit : audit.rows ?? Object.values(audit);
  for (const row of rows) {
    const qid = row.id ?? row.qid;
    const retrieved = (row.retrieved ?? []).map(r => (typeof r === 'string' ? r : r.id));
    byId[qid] = { ids: retrieved, topSimilarity: row.retrieved?.[0]?.similarity ?? null };
  }
  return byId;
}

async function main() {
  let source;
  if (FROM_AUDIT) {
    source = retrievedIdsFromAudit(FROM_AUDIT);
    console.log(`Recomputing metrics from ${FROM_AUDIT} (${Object.keys(source).length} rows)…`);
  } else {
    requireEnv();
    console.log(`Live retrieval eval — question wording ${QUESTION_VERSION}, ${labelled.length} labelled questions…`);
  }

  const perQuestion = [];
  for (const q of labelled) {
    let got;
    if (FROM_AUDIT) {
      got = source[q.id];
      if (!got) continue; // question not present in the saved run
    } else {
      got = await retrievedIdsLive(q);
      await sleep(200);
    }
    const scores = scoreQuestion({ retrieved: got.ids, relevant: q.relevant, acceptable: q.acceptable });
    perQuestion.push({ id: q.id, set: q.set, category: q.category, retrieved: got.ids, topSimilarity: got.topSimilarity, ...scores });
    if (!FROM_AUDIT) console.log(`${q.id.padEnd(4)} recall@5=${scores['recall@5']}  mrr=${scores['mrr']?.toFixed(3)}  ndcg@5=${scores['ndcg@5']?.toFixed(3)}`);
  }

  const metricKeys = ['recall@1', 'recall@3', 'recall@5', 'precision@5', 'mrr', 'ndcg@5'];
  const overall = aggregate(perQuestion.map(r => Object.fromEntries(metricKeys.map(k => [k, r[k]]))));
  const perSet = {};
  for (const set of [...new Set(perQuestion.map(r => r.set))]) {
    perSet[set] = aggregate(perQuestion.filter(r => r.set === set).map(r => Object.fromEntries(metricKeys.map(k => [k, r[k]]))));
  }

  const sha = gitSha();
  const result = {
    generatedAt: new Date().toISOString(),
    gitSha: sha,
    questionVersion: FROM_AUDIT ? `audit:${FROM_AUDIT}` : QUESTION_VERSION,
    n: perQuestion.length,
    overall,
    perSet,
    perQuestion,
  };

  outDir(); // ensure docs/report/eval exists even with an explicit --out
  const outPath = OUT ? resolve(process.cwd(), OUT) : resolve(outDir(), `retrieval_${sha}${FROM_AUDIT ? '_backfill' : `_${QUESTION_VERSION}`}.json`);
  writeFileSync(outPath, JSON.stringify(result, null, 2));

  // Companion CSV for the report.
  const csvPath = outPath.replace(/\.json$/, '.csv');
  const header = ['id', 'set', ...metricKeys, 'retrieved_ids'];
  const lines = [header.join(',')];
  for (const r of perQuestion) {
    lines.push([r.id, r.set, ...metricKeys.map(k => r[k] ?? ''), r.retrieved.join('|')].map(csvEscape).join(','));
  }
  writeFileSync(csvPath, lines.join('\n') + '\n');

  console.log('\nOverall:', metricKeys.map(k => `${k}=${overall[k]?.toFixed(4)}`).join('  '));
  for (const [set, agg] of Object.entries(perSet)) {
    console.log(`  ${set.padEnd(12)}`, metricKeys.map(k => `${k}=${agg[k]?.toFixed(3)}`).join('  '));
  }
  console.log(`\nWrote ${outPath}\n      ${csvPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
