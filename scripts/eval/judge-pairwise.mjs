#!/usr/bin/env node
// Blinded pairwise judge: answers from two generation runs to the same
// question (matched by id and sample), judged twice with the positions
// swapped. A verdict counts only when both orderings agree; disagreement is
// recorded as a tie (position bias made the call, not the content).
//
//   node scripts/eval/judge-pairwise.mjs --a docs/report/eval/generation_<sha>_v2.json --b docs/report/eval/generation_<sha>_p0.json
//        [--model claude-opus-5|gpt-4o-mini] [--sets A,B,N,S] [--limit N] [--effort medium] [--concurrency 2] [--dry-run] [--tag t] [--out-dir docs/report/eval] [--heldout]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { createRequire } from 'node:module';

import { requireEnv, fetchChunks, gitSha, csvEscape, sleep, ROOT } from './lib.mjs';
import { judgeCall, judgeCostEstimateUSD, parseJsonObject } from './lib/judgeClient.mjs';

const require = createRequire(import.meta.url);
const { QUESTIONS } = require('./questions.js');
const { PAIRWISE_PREAMBLE, pairwiseUserContent } = require('./judges/rubrics.js');
const { stripCitations } = require('./lib/textMetrics.js');
const { columnKey } = require('./lib/aggregate.js');
const { wilson, signTest } = require('./lib/stats.js');

const args = process.argv.slice(2);
const argVal = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const A = argVal('--a'), B = argVal('--b');
if (!A || !B) { console.error('Usage: node scripts/eval/judge-pairwise.mjs --a <gen.json> --b <gen.json>'); process.exit(1); }
const MODEL = argVal('--model') ?? 'claude-opus-5';
const SETS = argVal('--sets')?.split(',') ?? null;
const LIMIT = argVal('--limit') ? Number(argVal('--limit')) : Infinity;
const EFFORT = argVal('--effort') ?? 'medium';
const CONCURRENCY = Number(argVal('--concurrency') ?? 2);
const DRY_RUN = args.includes('--dry-run');
const TAG = argVal('--tag');
const OUT_DIR = resolve(ROOT, argVal('--out-dir') ?? 'docs/report/eval');
const CACHE_PATH = resolve(ROOT, '.cache/eval/chunks.json');

const pool = [...QUESTIONS];
if (args.includes('--heldout')) {
  const p = resolve(ROOT, 'scripts/eval/questions.heldout.js');
  if (existsSync(p)) pool.push(...require(p).HELDOUT_QUESTIONS);
}
const byId = Object.fromEntries(pool.map(q => [q.id, q]));

let chunkCache = {};
if (existsSync(CACHE_PATH)) { try { chunkCache = JSON.parse(readFileSync(CACHE_PATH, 'utf8')); } catch { chunkCache = {}; } }
async function ensureChunks(ids) {
  const missing = [...new Set(ids)].filter(id => !chunkCache[id]);
  for (let i = 0; i < missing.length; i += 40) {
    const rows = await fetchChunks(missing.slice(i, i + 40));
    for (const r of rows) chunkCache[r.id] = { title: r.title, content: r.content, source_org: r.source_org ?? null };
    await sleep(100);
  }
  mkdirSync(resolve(CACHE_PATH, '..'), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(chunkCache));
}

async function runPool(tasks, n) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() { while (next < tasks.length) { const i = next++; results[i] = await tasks[i](); } }
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, worker));
  return results;
}

const mapWinner = (w, first, second) => (w === 'A' ? first : w === 'B' ? second : 'tie');

async function main() {
  const runA = JSON.parse(readFileSync(resolve(ROOT, A), 'utf8'));
  const runB = JSON.parse(readFileSync(resolve(ROOT, B), 'utf8'));
  const keyA = columnKey(runA), keyB = columnKey(runB);
  const bIndex = new Map(runB.rows.map(r => [`${r.id}#${r.sample ?? 0}`, r]));
  const pairs = runA.rows
    .filter(r => byId[r.id] && (!SETS || SETS.includes(byId[r.id].set)) && bIndex.has(`${r.id}#${r.sample ?? 0}`))
    .slice(0, LIMIT)
    .map(r => ({ q: byId[r.id], a: r, b: bIndex.get(`${r.id}#${r.sample ?? 0}`) }));
  console.log(`Pairwise ${keyA} vs ${keyB}: ${pairs.length} matched answers × 2 orderings with ${MODEL}`);
  if (DRY_RUN) { console.log(`  estimated cost ≈ US$${judgeCostEstimateUSD(MODEL, pairs.length * 2, 2500, 200).toFixed(2)}`); return; }
  requireEnv();
  await ensureChunks(pairs.flatMap(p => [...(p.q.relevant ?? []), ...(p.q.acceptable ?? [])]));

  const tasks = pairs.map(({ q, a, b }) => async () => {
    const refIds = [...(q.relevant ?? []), ...(q.acceptable ?? [])];
    const background = refIds.map(id => chunkCache[id] ? `--- ${chunkCache[id].title} ---\n${chunkCache[id].content}` : null).filter(Boolean).join('\n\n');
    const ansA = stripCitations(a.answer), ansB = stripCitations(b.answer);
    const call = async (first, second) => {
      const user = pairwiseUserContent({ question: a.question, background, answerA: first, answerB: second });
      try {
        const res = await judgeCall(MODEL, PAIRWISE_PREAMBLE, user, { effort: EFFORT, maxTokens: 1200 });
        return res.text ? (parseJsonObject(res.text) ?? {}) : {};
      } catch (e) { return { error: e.message }; }
    };
    const r1 = await call(ansA, ansB);   // A first
    await sleep(120);
    const r2 = await call(ansB, ansA);   // B first
    const out = { id: a.id, sample: a.sample ?? 0, set: q.set, category: q.category, verdicts: {} };
    for (const dim of ['helpful', 'safe']) {
      const w1 = mapWinner(r1[dim]?.winner, keyA, keyB);
      const w2 = mapWinner(r2[dim]?.winner, keyB, keyA);
      const consistent = w1 === w2;
      out.verdicts[dim] = { first: w1, second: w2, consistent, final: consistent ? w1 : 'tie', reason1: r1[dim]?.reason ?? r1.error ?? '', reason2: r2[dim]?.reason ?? r2.error ?? '' };
    }
    console.log(`  ${a.id.padEnd(5)} helpful=${out.verdicts.helpful.final}${out.verdicts.helpful.consistent ? '' : ' (inconsistent)'}  safe=${out.verdicts.safe.final}${out.verdicts.safe.consistent ? '' : ' (inconsistent)'}`);
    await sleep(150);
    return out;
  });
  const results = await runPool(tasks, CONCURRENCY);

  const summary = {};
  for (const dim of ['helpful', 'safe']) {
    const v = results.map(r => r.verdicts[dim]);
    const winsA = v.filter(x => x.final === keyA).length;
    const winsB = v.filter(x => x.final === keyB).length;
    const ties = v.filter(x => x.final === 'tie').length;
    const inconsistent = v.filter(x => !x.consistent).length;
    summary[dim] = { n: v.length, winsA, winsB, ties, inconsistent, winRateA: wilson(winsA, winsA + winsB), signTest: signTest(winsA, winsB), consistency: wilson(v.length - inconsistent, v.length) };
    console.log(`\n${dim}: ${keyA} wins ${winsA}, ${keyB} wins ${winsB}, ties ${ties} (${inconsistent} position-inconsistent → tie); ` +
      `win rate ${keyA} among decisive = ${summary[dim].winRateA.p == null ? '—' : (100 * summary[dim].winRateA.p).toFixed(1) + '%'} [${summary[dim].winRateA.lo == null ? '' : (100 * summary[dim].winRateA.lo).toFixed(1)}–${summary[dim].winRateA.hi == null ? '' : (100 * summary[dim].winRateA.hi).toFixed(1)}], sign test p = ${summary[dim].signTest.p.toFixed(4)}`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const modelShort = MODEL.replace(/[^a-z0-9]+/gi, '-');
  const base = `pairwise_${modelShort}_${keyA.replace(/:/g, '_')}_vs_${keyB.replace(/:/g, '_')}${TAG ? `_${TAG}` : ''}`;
  const lines = ['id,sample,set,category,dimension,first_order,second_order,consistent,final,reason_first,reason_second'];
  for (const r of results) for (const [dim, v] of Object.entries(r.verdicts)) lines.push([r.id, r.sample, r.set, r.category, dim, v.first, v.second, v.consistent ? 1 : 0, v.final, v.reason1, v.reason2].map(csvEscape).join(','));
  writeFileSync(resolve(OUT_DIR, `${base}.csv`), lines.join('\n') + '\n');
  writeFileSync(resolve(OUT_DIR, `${base}.json`), JSON.stringify({ generatedAt: new Date().toISOString(), gitSha: gitSha(), judgeModel: MODEL, effort: EFFORT, a: { file: basename(A), key: keyA }, b: { file: basename(B), key: keyB }, summary, rows: results }, null, 2));
  console.log(`\nWrote ${resolve(OUT_DIR, base)}.{csv,json}`);
}
main().catch(e => { console.error(e); process.exit(1); });
