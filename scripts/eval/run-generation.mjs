#!/usr/bin/env node
// Generation evaluation: runs the labelled question sets through the FULL
// production pipeline (retrieve → prompt package → chat model) and saves the
// answers for safety-checks.mjs, safety-report.mjs, judge.mjs and
// grade-groundedness.mjs.
//
// Conditions (scripts/eval/prompts/promptVersions.js): p0 | v1 | v2-nosafety |
// v2-trailing | v2 (alias v2-nz-safety). Retrieval modes: production (default),
// --no-rag (bare question), --oracle (the labelled relevant/acceptable chunks —
// isolates retrieval misses from generation errors; unlabelled questions fall
// back to production retrieval and are marked per row).
//
// Methodology notes recorded in every output file:
//   * Default is temperature 0 + seed 42 for run-to-run comparability with the
//     frozen July artefacts; production runs at 0.7. With --samples N (N > 1)
//     the default flips to the production temperature so pass RATES and
//     consistency can be estimated.
//   * Passages are retrieved once per question and reused for every sample, so
//     sample-to-sample variance is generation variance only.
//   * Set J questions get their poisoned passage appended to the retrieved
//     context (indirect injection). --no-inject runs them as plain questions.
//
// Usage:
//   node scripts/eval/run-generation.mjs                          # v2, all sets, temp 0, seed 42
//   node scripts/eval/run-generation.mjs --prompt p0              # a prompt condition
//   node scripts/eval/run-generation.mjs --no-rag                 # RAG ablation
//   node scripts/eval/run-generation.mjs --oracle --sets A,A-neighbour
//   node scripts/eval/run-generation.mjs --samples 3              # 3 × temp 0.7 per question
//   node scripts/eval/run-generation.mjs --sets S,I,J --heldout   # + scripts/eval/questions.heldout.js
//   node scripts/eval/run-generation.mjs --heldout-only            # only the held-out items
//   node scripts/eval/run-generation.mjs --dry-run                # plan only, no API calls
//   flags: --questions v1|v2  --limit N  --temperature T  --seed S  --model id  --tag label  --out path  --no-inject
import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

import { requireEnv, retrieve, fetchChunks, openaiJson, gitSha, outDir, sleep } from './lib.mjs';

const require = createRequire(import.meta.url);
const { QUESTIONS, questionText } = require('./questions.js');
const { CHAT_MODEL, GENERATION_TEMPERATURE, maxTokensForStyle } = require('../../packages/core/rag/ragConfig.js');
const { resolveCondition } = require('./prompts/promptVersions.js');

const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const argVal = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };

const condition = resolveCondition(argVal('--prompt') ?? 'v2');
const QUESTION_VERSION = argVal('--questions') ?? 'v2';
const SETS = (argVal('--sets') ?? 'A,A-neighbour,B,C,S,I,N,J').split(',');
const OUT = argVal('--out');
const LIMIT = argVal('--limit') ? Number(argVal('--limit')) : Infinity;
const SAMPLES = Math.max(1, Number(argVal('--samples') ?? 1));
const MODEL = argVal('--model') ?? CHAT_MODEL;
const TAG = argVal('--tag');
const NO_RAG = has('--no-rag');
const ORACLE = has('--oracle');
const NO_INJECT = has('--no-inject');
const DRY_RUN = has('--dry-run');
const INCLUDE_HELDOUT = has('--heldout') || has('--heldout-only');
const HELDOUT_ONLY = has('--heldout-only');

if (NO_RAG && ORACLE) { console.error('--no-rag and --oracle are mutually exclusive'); process.exit(1); }

const TEMPERATURE = argVal('--temperature') != null ? Number(argVal('--temperature')) : (SAMPLES > 1 ? GENERATION_TEMPERATURE : 0);
const SEED = argVal('--seed') != null ? Number(argVal('--seed')) : (TEMPERATURE === 0 ? 42 : null);
const RETRIEVAL_MODE = NO_RAG ? 'none' : ORACLE ? 'oracle' : 'production';

function loadQuestionPool() {
  const pool = [...QUESTIONS];
  if (INCLUDE_HELDOUT) {
    const heldoutPath = resolve(process.cwd(), 'scripts/eval/questions.heldout.js');
    if (!existsSync(heldoutPath)) { console.error('--heldout given but scripts/eval/questions.heldout.js does not exist'); process.exit(1); }
    const { HELDOUT_QUESTIONS } = require(heldoutPath);
    for (const q of HELDOUT_QUESTIONS) {
      if (pool.some(p => p.id === q.id)) throw new Error(`duplicate question id ${q.id} between questions.js and questions.heldout.js`);
      pool.push(q);
    }
  }
  return pool;
}

async function withRetry(fn, label, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      const retryable = /\(429\)|\(5\d\d\)|fetch failed|ECONNRESET|ETIMEDOUT/.test(String(e.message));
      if (!retryable || i === attempts - 1) throw e;
      const wait = 1500 * 2 ** i;
      console.warn(`  ${label}: ${e.message.slice(0, 80)} — retrying in ${wait} ms`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

// Passages for one question under the chosen retrieval mode.
async function passagesFor(q, text) {
  if (NO_RAG) return { chunks: [], mode: 'none' };
  const labelled = [...(q.relevant ?? []), ...(q.acceptable ?? [])];
  if (ORACLE && labelled.length) {
    const rows = await withRetry(() => fetchChunks(labelled), 'oracle fetch');
    // Relevant first, then acceptable, in label order; similarity is undefined by construction.
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));
    const ordered = labelled.map(id => byId[id]).filter(Boolean).map(r => ({ ...r, similarity: null }));
    return { chunks: ordered, mode: 'oracle' };
  }
  const chunks = await withRetry(() => retrieve(text), 'retrieve');
  return { chunks, mode: ORACLE ? 'production(no-label)' : 'production' };
}

function injectedChunks(q) {
  if (NO_INJECT || !q.injectedPassages?.length) return [];
  return q.injectedPassages.map((p, k) => ({
    id: `INJECT:${q.id}:${k}`, title: p.title, content: p.content, source_org: p.source_org ?? 'Injected test passage', similarity: null,
  }));
}

async function main() {
  const pool = loadQuestionPool();
  const questions = pool.filter(q => SETS.includes(q.set) && (!HELDOUT_ONLY || q.heldout)).slice(0, LIMIT);
  const systemPrompt = condition.system({});
  const systemPromptSha256 = createHash('sha256').update(systemPrompt).digest('hex');
  const maxTokens = maxTokensForStyle('balanced', false);

  console.log(`Generation eval — condition ${condition.id} (${condition.label})`);
  console.log(`  retrieval ${RETRIEVAL_MODE}, injection ${NO_INJECT ? 'off' : 'on (set J)'}, questions ${QUESTION_VERSION}, ${questions.length} questions × ${SAMPLES} sample(s)`);
  console.log(`  model ${MODEL}, temperature ${TEMPERATURE}, seed ${SEED ?? 'none'}, max_tokens ${maxTokens}, system prompt sha256 ${systemPromptSha256.slice(0, 12)}`);
  if (DRY_RUN) {
    const calls = questions.length * SAMPLES;
    console.log(`\nDry run: ${calls} chat completions (~${Math.round(calls * 2.8)}k tokens ≈ US$${(calls * 0.02).toFixed(2)} at gpt-4o rates), ${NO_RAG ? 0 : questions.length} retrievals.`);
    for (const q of questions) console.log(`  ${q.id.padEnd(5)} ${q.set.padEnd(12)} ${questionText(q, QUESTION_VERSION).slice(0, 80)}`);
    return;
  }
  requireEnv({ supabase: !NO_RAG });

  const rows = [];
  for (const q of questions) {
    const text = questionText(q, QUESTION_VERSION);
    const { chunks: base, mode } = await passagesFor(q, text);
    const injected = injectedChunks(q);
    const chunks = [...base, ...injected];
    const userContent = condition.userContent(text, chunks);

    for (let sample = 0; sample < SAMPLES; sample++) {
      const body = {
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        max_tokens: maxTokens,
        temperature: TEMPERATURE,
      };
      if (SEED != null) body.seed = SEED + sample;
      const data = await withRetry(() => openaiJson('/chat/completions', body), `${q.id}#${sample}`);
      const choice = data.choices[0];
      const answer = choice.message.content.trim();
      const usage = data.usage ?? {};
      rows.push({
        id: q.id,
        set: q.set,
        category: q.category,
        question: text,
        sample,
        retrievalMode: mode,
        injected: injected.length > 0,
        retrieved: chunks.map(c => ({ id: c.id, similarity: c.similarity ?? null })),
        answer,
        finishReason: choice.finish_reason ?? null,
        promptTokens: usage.prompt_tokens ?? null,
        completionTokens: usage.completion_tokens ?? null,
        systemFingerprint: data.system_fingerprint ?? null,
      });
      console.log(`${q.id.padEnd(5)}${SAMPLES > 1 ? `#${sample}` : ''} retrieved=${chunks.length}${injected.length ? ` (+${injected.length} injected)` : ''}  answer=${answer.length} chars${choice.finish_reason === 'length' ? '  [TRUNCATED]' : ''}`);
      await sleep(250);
    }
  }

  const sha = gitSha();
  const result = {
    generatedAt: new Date().toISOString(),
    gitSha: sha,
    condition: condition.id,
    promptVersion: condition.id,          // legacy field name kept for older consumers
    promptLabel: condition.label,
    region: condition.region,
    citationMode: condition.citationMode,
    retrievalMode: RETRIEVAL_MODE,
    injection: !NO_INJECT,
    questionVersion: QUESTION_VERSION,
    heldout: INCLUDE_HELDOUT,
    model: MODEL,
    temperature: TEMPERATURE,
    seed: SEED,
    samples: SAMPLES,
    tag: TAG ?? null,
    systemPromptSha256,
    methodologyNote: SAMPLES > 1
      ? 'Multi-sample run at the production temperature; passages retrieved once per question and reused across samples so variance is generation-only. Seeds are per-sample offsets when a seed is set.'
      : 'Eval runs at temperature 0 + fixed seed for comparability; production runs at 0.7.',
    rows,
  };
  outDir(); // ensure docs/report/eval exists even with an explicit --out
  const suffix = [condition.id, RETRIEVAL_MODE !== 'production' ? RETRIEVAL_MODE : null, SAMPLES > 1 ? `x${SAMPLES}` : null, TAG].filter(Boolean).join('_');
  const outPath = OUT ? resolve(process.cwd(), OUT) : resolve(outDir(), `generation_${sha}_${suffix}.json`);
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  const totalTokens = rows.reduce((s, r) => s + (r.promptTokens ?? 0) + (r.completionTokens ?? 0), 0);
  const truncated = rows.filter(r => r.finishReason === 'length').length;
  console.log(`\nWrote ${outPath} (${rows.length} answers, ~${totalTokens} tokens total${truncated ? `, ${truncated} truncated at max_tokens` : ''})`);
}

main().catch(e => { console.error(e); process.exit(1); });
