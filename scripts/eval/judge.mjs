#!/usr/bin/env node
// Blinded, rubric-based LLM judge over saved generation runs.
//
// Protocol (docs/eval/evaluation-plan.md §5 E2, "Judge protocol"):
//   * the judge never sees the condition id, prompt version or file name —
//     only question, the passages the assistant was given, optional human-
//     labelled reference material, and the answer;
//   * citation markers and "Sources:" lists are stripped for every dimension
//     except groundedness, so citation FORMAT cannot cue the judge;
//   * rubrics are the committed texts in scripts/eval/judges/rubrics.js, shared
//     with the human rating sheets; scores are 0/1/2 with a one-sentence reason;
//   * default judge is a Claude model — a different family from the gpt-4o
//     generator; run the same file through --model gpt-4o-mini too and report
//     judge–judge and judge–human agreement (scripts/eval/agreement.mjs).
//
//   node scripts/eval/judge.mjs docs/report/eval/generation_<sha>_v2.json [more.json ...]
//        [--model claude-opus-5|gpt-4o-mini|gpt-4o] [--dims groundedness,correctness,helpfulness,tone,safety,scope]
//        [--sets A,B] [--limit N] [--effort low|medium|high] [--concurrency 2] [--dry-run] [--tag t] [--out-dir docs/report/eval] [--heldout]
//        [--retry-missing]   re-judge only the rows whose previous output has a null score and merge into the existing files
//        [--questions-file scripts/eval/questions.perturbed.js]   extra question file, same contract as run-generation.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { createRequire } from 'node:module';

import { requireEnv, fetchChunks, gitSha, csvEscape, sleep, ROOT } from './lib.mjs';
import { judgeCall, judgeCostEstimateUSD, isAnthropicModel, parseJsonObject } from './lib/judgeClient.mjs';

const require = createRequire(import.meta.url);
const { QUESTIONS } = require('./questions.js');
const { DIMENSIONS, applicableDimensions, judgeSystemPrompt, judgeUserContent } = require('./judges/rubrics.js');
const { stripCitations } = require('./lib/textMetrics.js');
const { columnKey } = require('./lib/aggregate.js');

const args = process.argv.slice(2);
const argVal = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const flagArgs = new Set(['--model', '--dims', '--sets', '--limit', '--effort', '--concurrency', '--tag', '--out-dir', '--cache', '--questions-file']);
const files = args.filter((a, i) => !a.startsWith('--') && !flagArgs.has(args[i - 1]));
if (!files.length) { console.error('Usage: node scripts/eval/judge.mjs <generation.json> [...] [--model claude-opus-5]'); process.exit(1); }

const MODEL = argVal('--model') ?? 'claude-opus-5';
const DIMS = argVal('--dims')?.split(',') ?? null;
const SETS = argVal('--sets')?.split(',') ?? null;
const LIMIT = argVal('--limit') ? Number(argVal('--limit')) : Infinity;
const EFFORT = argVal('--effort') ?? 'medium';
const CONCURRENCY = Number(argVal('--concurrency') ?? 2);
const DRY_RUN = args.includes('--dry-run');
const TAG = argVal('--tag');
const OUT_DIR = resolve(ROOT, argVal('--out-dir') ?? 'docs/report/eval');
const CACHE_PATH = resolve(ROOT, argVal('--cache') ?? '.cache/eval/chunks.json');
const RETRY_MISSING = args.includes('--retry-missing');

const pool = [...QUESTIONS];
if (args.includes('--heldout')) {
  const p = resolve(ROOT, 'scripts/eval/questions.heldout.js');
  if (existsSync(p)) pool.push(...require(p).HELDOUT_QUESTIONS);
}
// An extra question file (E9 §2.5 perturbed variants), same contract as run-generation.mjs.
const QUESTIONS_FILE = argVal('--questions-file');
if (QUESTIONS_FILE) {
  const abs = resolve(ROOT, QUESTIONS_FILE);
  if (!existsSync(abs)) { console.error(`--questions-file ${QUESTIONS_FILE} does not exist`); process.exit(1); }
  const mod = require(abs);
  const list = mod.HELDOUT_QUESTIONS ?? mod.PERTURBED_QUESTIONS ?? mod.QUESTIONS ?? (Array.isArray(mod) ? mod : null);
  if (!Array.isArray(list)) { console.error(`${QUESTIONS_FILE} must export an array as HELDOUT_QUESTIONS, PERTURBED_QUESTIONS or QUESTIONS`); process.exit(1); }
  pool.push(...list);
}
const byId = Object.fromEntries(pool.map(q => [q.id, q]));

// ── chunk cache (passages + reference material) ─────────────────────────────
let chunkCache = {};
if (existsSync(CACHE_PATH)) { try { chunkCache = JSON.parse(readFileSync(CACHE_PATH, 'utf8')); } catch { chunkCache = {}; } }
async function ensureChunks(ids) {
  const missing = [...new Set(ids)].filter(id => !id.startsWith('INJECT:') && !chunkCache[id]);
  for (let i = 0; i < missing.length; i += 40) {
    const rows = await fetchChunks(missing.slice(i, i + 40));
    for (const r of rows) chunkCache[r.id] = { title: r.title, content: r.content, source_org: r.source_org ?? null };
    await sleep(100);
  }
  mkdirSync(resolve(CACHE_PATH, '..'), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(chunkCache));
}
function passageText(id, q) {
  if (id.startsWith('INJECT:')) {
    const k = Number(id.split(':')[2]);
    const p = q.injectedPassages?.[k];
    return p ? `--- ${p.title} ---\n${p.content}` : null;
  }
  const c = chunkCache[id];
  return c ? `--- ${c.title} ---\n${c.content}` : `--- ${id} --- (passage text unavailable)`;
}

async function runPool(tasks, n) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) { const i = next++; results[i] = await tasks[i](); }
  }
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, worker));
  return results;
}

async function judgeFile(file) {
  const run = JSON.parse(readFileSync(resolve(ROOT, file), 'utf8'));
  const column = columnKey(run);
  let rows = run.rows.filter(r => byId[r.id] && (!SETS || SETS.includes(byId[r.id].set))).slice(0, LIMIT);
  const modelShort = MODEL.replace(/[^a-z0-9]+/gi, '-');
  const base = `judge_${modelShort}_${column.replace(/:/g, '_')}${TAG ? `_${TAG}` : ''}`;
  let previous = null;
  if (RETRY_MISSING) {
    const prevPath = resolve(OUT_DIR, `${base}.json`);
    if (!existsSync(prevPath)) { console.error(`--retry-missing: ${prevPath} not found`); process.exit(1); }
    previous = JSON.parse(readFileSync(prevPath, 'utf8'));
    const incomplete = new Set(previous.rows.filter(r => Object.values(r.scores).some(s => s.score == null)).map(r => `${r.id}#${r.sample}`));
    rows = rows.filter(r => incomplete.has(`${r.id}#${r.sample ?? 0}`));
    console.log(`  retry-missing: ${incomplete.size} of ${previous.rows.length} rows had a null score`);
  }
  const plan = rows.map(r => ({ row: r, q: byId[r.id], dims: applicableDimensions(byId[r.id], r, DIMS) })).filter(p => p.dims.length);
  const dimCounts = {};
  for (const p of plan) for (const d of p.dims) dimCounts[d] = (dimCounts[d] ?? 0) + 1;
  console.log(`\n${basename(file)} → column ${column}: ${plan.length} answers to judge with ${MODEL} (${JSON.stringify(dimCounts)})`);
  if (DRY_RUN) { console.log(`  estimated cost ≈ US$${judgeCostEstimateUSD(MODEL, plan.length).toFixed(2)}`); return null; }

  await ensureChunks(plan.flatMap(p => [...p.row.retrieved.map(c => c.id), ...(p.q.relevant ?? []), ...(p.q.acceptable ?? [])]));

  const tasks = plan.map(({ row, q, dims }) => async () => {
    const passages = row.retrieved.map(c => passageText(c.id, q)).filter(Boolean).join('\n\n');
    const refIds = [...(q.relevant ?? []), ...(q.acceptable ?? [])];
    const reference = refIds.map(id => passageText(id, q)).join('\n\n');
    const user = judgeUserContent({ question: row.question, passages, reference, answerRaw: row.answer, answerClean: stripCitations(row.answer), dims });
    const system = judgeSystemPrompt(dims);
    let res;
    try { res = await judgeCall(MODEL, system, user, { effort: EFFORT }); } catch (e) { res = { text: null, error: e.message }; }
    const parsed = res.text ? parseJsonObject(res.text) : null;
    const scores = {};
    for (const d of dims) {
      const s = parsed?.[d];
      const score = Number.isInteger(s?.score) && s.score >= 0 && s.score <= 2 ? s.score : null;
      scores[d] = { score, reason: s?.reason ?? (res.refused ? `judge refused (${res.refusalCategory})` : res.error ? `error: ${res.error.slice(0, 120)}` : 'unparsed') };
    }
    console.log(`  ${row.id.padEnd(5)}${run.samples > 1 ? `#${row.sample}` : ''} ${dims.map(d => `${d}=${scores[d].score ?? '?'}`).join(' ')}`);
    await sleep(150);
    return { id: row.id, sample: row.sample ?? 0, set: q.set, category: q.category, dims, scores, judgeInput: user, judgeRaw: res.text, usage: res.usage ?? null, judgeModel: res.model ?? MODEL };
  });
  let results = await runPool(tasks, CONCURRENCY);
  if (previous) {
    const fresh = new Map(results.map(r => [`${r.id}#${r.sample}`, r]));
    results = previous.rows.map(r => fresh.get(`${r.id}#${r.sample}`) ?? r);
  }

  const dist = {};
  for (const r of results) for (const [d, s] of Object.entries(r.scores)) { dist[d] ??= {}; dist[d][s.score ?? 'null'] = (dist[d][s.score ?? 'null'] ?? 0) + 1; }
  console.log(`  distribution: ${JSON.stringify(dist)}`);

  mkdirSync(OUT_DIR, { recursive: true });
  const csvLines = ['column,id,sample,set,category,dimension,score,reason'];
  for (const r of results) for (const [d, s] of Object.entries(r.scores)) csvLines.push([column, r.id, r.sample, r.set, r.category, d, s.score ?? '', s.reason].map(csvEscape).join(','));
  writeFileSync(resolve(OUT_DIR, `${base}.csv`), csvLines.join('\n') + '\n');
  writeFileSync(resolve(OUT_DIR, `${base}.json`), JSON.stringify({
    generatedAt: new Date().toISOString(), gitSha: gitSha(), judgeModel: MODEL, effort: isAnthropicModel(MODEL) ? EFFORT : null,
    sourceFile: basename(file), sourceGitSha: run.gitSha, column, condition: run.condition ?? run.promptVersion, retrievalMode: run.retrievalMode ?? 'production',
    dimensions: Object.fromEntries(Object.keys(dimCounts).map(d => [d, DIMENSIONS[d].rubric])), distribution: dist, n: results.length, rows: results,
  }, null, 2));
  console.log(`  wrote ${resolve(OUT_DIR, base)}.{csv,json}`);
  return results;
}

async function main() {
  if (!DRY_RUN) requireEnv({ openai: !isAnthropicModel(MODEL) || true, supabase: true });
  for (const f of files) await judgeFile(f);
}
main().catch(e => { console.error(e); process.exit(1); });
