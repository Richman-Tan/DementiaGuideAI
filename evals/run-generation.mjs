#!/usr/bin/env node
/**
 * Run the labelled question sets through the answering pipeline and save the
 * answers for the checkers and judges.
 *
 * This drives runTurn, the same function the server calls, with the real
 * providers (Claude, Voyage, the database search). The output file has the
 * shape scripts/eval/run-generation.mjs wrote for the old pipeline, so the
 * existing tools score it unchanged:
 *
 *   node scripts/eval/safety-checks.mjs evals/results/<file>.json
 *   node scripts/eval/judge.mjs evals/results/<file>.json
 *
 * Usage:
 *   node evals/run-generation.mjs --dry-run                     the plan and a rough cost; no API calls
 *   node evals/run-generation.mjs --max-usd 5                   prompt v3, Opus 5.5, every set
 *   node evals/run-generation.mjs --max-usd 2 --sets S,I,J      the safety and injection sets only
 *   node evals/run-generation.mjs --max-usd 5 --prompt v2       the studied prompt, for comparison
 *   node evals/run-generation.mjs --max-usd 5 --model claude-haiku-5-5 --effort low
 *
 * Options:
 *   --prompt v2|v3          default v3
 *   --model <id>            default claude-opus-5-5
 *   --effort low|medium|high|xhigh|max   default medium
 *   --modality text|voice   default text
 *   --sets A,S,…            default every set
 *   --no-heldout            leave out scripts/eval/questions.heldout.js
 *   --limit N               the first N questions only
 *   --samples N             N answers per question (Claude takes no seed; use this for pass rates)
 *   --no-rag                no passages at all (the retrieval ablation)
 *   --no-inject             run the injection set without its poisoned passages
 *   --rerank                rerank candidates with Voyage before keeping the top K
 *   --no-triage             skip the safety triage call (the keyword floor still runs)
 *   --search <function>     database search function, default match_chunks_v2
 *   --vector-weight <0-1>   the vector/keyword mix passed to the search function
 *   --min-similarity <n>    similarity floor for a passage to count
 *   --max-usd <n>           REQUIRED for a real run: stop before spending more than this
 *   --resume                keep the answers already in the output file
 *   --tag <label>  --out <path>  --pace-ms <n>
 *
 * Environment (the repo root .env, or the shell): ANTHROPIC_API_KEY,
 * VOYAGE_API_KEY (and VOYAGE_BASE_URL for a key issued by Voyage directly),
 * SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL, and EXPO_PUBLIC_SUPABASE_ANON_KEY.
 *
 * Every real run spends money on the keys above. --dry-run prints an estimate
 * first; --max-usd is a hard stop, checked before each answer.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  runEvalQuestion,
  costUsd,
  EVAL_SETTINGS,
} from '../packages/core/rag/eval/generationRun.ts';
import { pipelineConfig } from '../packages/core/rag/pipelineConfig.ts';
import { promptV2 } from '../packages/core/rag/pipeline/promptV2.ts';
import { promptV3 } from '../packages/core/rag/pipeline/promptV3.ts';
import {
  createClaudeGenerate,
  createClaudeTriage,
  HELPER_MODEL,
} from '../packages/core/rag/providers/claude.ts';
import { createVoyage, VOYAGE_ATLAS_URL } from '../packages/core/rag/providers/voyage.ts';
import { createSupabaseSearch } from '../packages/core/rag/providers/supabaseSearch.ts';
import { LIST_PRICES, PRICES_CACHED_ON } from '../packages/core/rag/prices.ts';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { QUESTIONS, questionText } = require('../scripts/eval/questions.js');
// One price table for the estimate here and for the app's own cost figures.
const PRICES = { models: LIST_PRICES, cachedOn: PRICES_CACHED_ON };

// ─── Arguments ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const value = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

const PROMPTS = { v2: promptV2, v3: promptV3 };
const PROMPT_ID = value('--prompt', 'v3');
const MODEL = value('--model', 'claude-opus-5-5');
const EFFORT = value('--effort', 'medium');
const MODALITY = value('--modality', 'text');
const SETS = value('--sets')?.split(',') ?? null;
const HELDOUT = !has('--no-heldout');
const LIMIT = value('--limit') ? Number(value('--limit')) : Infinity;
const SAMPLES = Math.max(1, Number(value('--samples', '1')));
const NO_RAG = has('--no-rag');
const NO_INJECT = has('--no-inject');
const RERANK = has('--rerank');
const TRIAGE = !has('--no-triage');
const SEARCH = value('--search', 'match_chunks_v2');
const VECTOR_WEIGHT =
  value('--vector-weight') == null ? undefined : Number(value('--vector-weight'));
const MIN_SIMILARITY =
  value('--min-similarity') == null ? undefined : Number(value('--min-similarity'));
const MAX_USD = value('--max-usd') == null ? null : Number(value('--max-usd'));
const DRY_RUN = has('--dry-run');
const RESUME = has('--resume');
const TAG = value('--tag');
const OUT = value('--out');
const PACE_MS = Number(value('--pace-ms', '0'));
const CHECKPOINT_EVERY = 5;

if (!PROMPTS[PROMPT_ID]) fail(`--prompt must be one of ${Object.keys(PROMPTS).join(', ')}`);
if (!['low', 'medium', 'high', 'xhigh', 'max'].includes(EFFORT))
  fail('--effort must be low, medium, high, xhigh or max');
if (!['text', 'voice'].includes(MODALITY)) fail('--modality must be text or voice');
if (!DRY_RUN && !(MAX_USD > 0))
  fail('--max-usd <amount> is required for a real run (it is the hard stop on spending)');
const PRICE = PRICES.models[MODEL];
if (!PRICE)
  fail(
    `no list price for ${MODEL} in packages/core/rag/prices.ts; add it before running, so the spend guard can work`
  );

const config = pipelineConfig({
  model: MODEL,
  prompt: PROMPTS[PROMPT_ID],
  textEffort: EFFORT,
  voiceEffort: EFFORT,
  ...(MIN_SIMILARITY === undefined ? {} : { minSimilarity: MIN_SIMILARITY }),
});

// ─── Questions ───────────────────────────────────────────────────────────────
function loadQuestions() {
  const pool = [...QUESTIONS];
  if (HELDOUT) pool.push(...require('../scripts/eval/questions.heldout.js').HELDOUT_QUESTIONS);
  const ids = new Set();
  for (const q of pool) {
    if (ids.has(q.id)) fail(`duplicate question id ${q.id}`);
    ids.add(q.id);
  }
  return pool.filter((q) => !SETS || SETS.includes(q.set)).slice(0, LIMIT);
}
const questions = loadQuestions();
if (!questions.length) fail('no questions match --sets/--limit');

const systemPromptSha256 = createHash('sha256')
  .update(config.prompt.system(EVAL_SETTINGS, MODALITY).stable)
  .digest('hex');

console.log(`Generation eval of the pipeline — ${config.pipelineVersion}`);
console.log(`  prompt ${config.prompt.version}, model ${MODEL}, effort ${EFFORT}, ${MODALITY}`);
console.log(
  `  retrieval ${NO_RAG ? 'none' : `${SEARCH}${RERANK ? ' + rerank' : ''}`}, triage ${TRIAGE ? `on (${HELPER_MODEL})` : 'off'}, injection ${NO_INJECT ? 'off' : 'on'}`
);
console.log(
  `  ${questions.length} questions × ${SAMPLES} sample(s) = ${questions.length * SAMPLES} answers`
);

// ─── Dry run ─────────────────────────────────────────────────────────────────
if (DRY_RUN) {
  // A rough size for one answer: the instructions plus five passages in, an
  // answer and its thinking out. Real usage replaces this in the output file.
  const assumed = {
    model: MODEL,
    inputTokens: 3600,
    outputTokens: 1500,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  const each = costUsd(assumed, PRICE);
  const total = each * questions.length * SAMPLES;
  const bySet = {};
  for (const q of questions) bySet[q.set] = (bySet[q.set] ?? 0) + 1;
  console.log(
    `\nDry run. Sets: ${Object.entries(bySet)
      .map(([s, n]) => `${s} ${n}`)
      .join(', ')}`
  );
  console.log(
    `Rough cost: US$${total.toFixed(2)} (assuming ${assumed.inputTokens} tokens in and ${assumed.outputTokens} out per answer at list prices cached ${PRICES.cachedOn}).`
  );
  console.log(
    'Not counted: the triage call per answer on the helper model, and Voyage embeddings (both small).'
  );
  console.log(
    `A real run needs --max-usd; ${(total * 1.5).toFixed(2)} would leave headroom on this estimate.`
  );
  process.exit(0);
}

// ─── Environment ─────────────────────────────────────────────────────────────
function loadDotEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = { ...loadDotEnv(resolve(ROOT, '.env')), ...process.env };
const SUPABASE_URL = env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!env.ANTHROPIC_API_KEY) fail('ANTHROPIC_API_KEY is not set');
if (!NO_RAG && !env.VOYAGE_API_KEY) fail('VOYAGE_API_KEY is not set (or pass --no-rag)');
if (!NO_RAG && (!SUPABASE_URL || !SUPABASE_KEY)) {
  fail(
    'SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) and EXPO_PUBLIC_SUPABASE_ANON_KEY are needed for retrieval'
  );
}

// ─── Providers ───────────────────────────────────────────────────────────────
const { default: Anthropic } = await import('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const voyage = NO_RAG
  ? null
  : createVoyage({ apiKey: env.VOYAGE_API_KEY, baseUrl: env.VOYAGE_BASE_URL || VOYAGE_ATLAS_URL });
const providers = {
  now: () => performance.now(),
  embed: voyage ? voyage.embed : () => Promise.reject(new Error('retrieval is off')),
  search: NO_RAG
    ? () => Promise.reject(new Error('retrieval is off'))
    : createSupabaseSearch({
        url: SUPABASE_URL,
        key: SUPABASE_KEY,
        functionName: SEARCH,
        ...(VECTOR_WEIGHT === undefined ? {} : { vectorWeight: VECTOR_WEIGHT }),
      }),
  generate: createClaudeGenerate(client),
  ...(RERANK && voyage ? { rerank: voyage.rerank } : {}),
  ...(TRIAGE ? { triage: createClaudeTriage(client) } : {}),
};

// ─── Output ──────────────────────────────────────────────────────────────────
const gitSha = () => {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
  } catch {
    return 'unknown';
  }
};
const sha = gitSha();
const suffix = [
  PROMPT_ID,
  MODEL.replace(/^claude-/, ''),
  EFFORT,
  MODALITY === 'voice' ? 'voice' : null,
  NO_RAG ? 'none' : null,
  RERANK ? 'rerank' : null,
  SAMPLES > 1 ? `x${SAMPLES}` : null,
  TAG,
]
  .filter(Boolean)
  .join('_');
mkdirSync(resolve(ROOT, 'evals/results'), { recursive: true });
const outPath = OUT
  ? resolve(process.cwd(), OUT)
  : resolve(ROOT, 'evals/results', `generation_${sha}_${suffix}.json`);

const header = (spentUsd) => ({
  generatedAt: new Date().toISOString(),
  gitSha: sha,
  pipelineVersion: config.pipelineVersion,
  // The field names the existing checkers and judges read:
  condition: config.prompt.version,
  promptVersion: config.prompt.version,
  region: 'NZ',
  citationMode: 'inline',
  retrievalMode: NO_RAG ? 'none' : 'pipeline',
  injection: !NO_INJECT,
  questionVersion: 'v2',
  heldout: HELDOUT,
  model: MODEL,
  temperature: null,
  seed: null,
  samples: SAMPLES,
  tag: TAG ?? null,
  systemPromptSha256,
  // What this pipeline adds:
  effort: EFFORT,
  modality: MODALITY,
  searchFunction: NO_RAG ? null : SEARCH,
  vectorWeight: VECTOR_WEIGHT ?? null,
  minSimilarity: config.retrieval.minSimilarity,
  rerank: RERANK,
  triage: TRIAGE ? HELPER_MODEL : null,
  spentUsd: Number(spentUsd.toFixed(4)),
  methodologyNote:
    'Claude takes no temperature or seed, so answers vary run to run; use --samples for pass rates. spentUsd covers the answering model at list prices, not the triage call or embeddings.',
});

let rows = [];
if (RESUME && existsSync(outPath)) {
  const prev = JSON.parse(readFileSync(outPath, 'utf8'));
  if (
    prev.pipelineVersion !== config.pipelineVersion ||
    prev.systemPromptSha256 !== systemPromptSha256 ||
    prev.searchFunction !== (NO_RAG ? null : SEARCH)
  ) {
    fail(`--resume: ${outPath} was produced with a different configuration; refusing to mix runs`);
  }
  rows = prev.rows;
  console.log(`  resuming: ${rows.length} answers already in ${outPath}`);
}
const spent = () =>
  rows.reduce(
    (total, r) => total + (r.usage ? costUsd(r.usage, PRICES.models[r.usage.model] ?? PRICE) : 0),
    0
  );
const save = (partial) =>
  writeFileSync(outPath, `${JSON.stringify({ ...header(spent()), partial, rows }, null, 2)}\n`);

// ─── Run ─────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(label, fn, attempts = 4) {
  for (let i = 0; ; i += 1) {
    try {
      return await fn();
    } catch (err) {
      const message = String(err?.message ?? err);
      const transient =
        /\b(429|5\d\d)\b|rate.?limit|overloaded|fetch failed|ECONNRESET|ETIMEDOUT|socket hang up/i.test(
          message
        );
      if (!transient || i === attempts - 1) throw err;
      const wait = 2000 * 2 ** i;
      console.warn(
        `  ${label}: ${message.replace(/\s+/g, ' ').slice(0, 80)} — retrying in ${wait} ms`
      );
      await sleep(wait);
    }
  }
}

const done = new Set(rows.map((r) => `${r.id}#${r.sample}`));
let sinceSave = 0;
let stoppedForBudget = false;
outer: for (const q of questions) {
  for (let sample = 0; sample < SAMPLES; sample += 1) {
    if (done.has(`${q.id}#${sample}`)) continue;
    // Stop before an answer that could take the total past the limit: allow
    // for one answer costing three times the average so far.
    const average = rows.length
      ? spent() / rows.length
      : costUsd(
          {
            model: MODEL,
            inputTokens: 3600,
            outputTokens: 1500,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          PRICE
        );
    if (spent() + 3 * average > MAX_USD) {
      stoppedForBudget = true;
      break outer;
    }
    const text = questionText(q, 'v2');
    const row = await withRetry(`${q.id}#${sample}`, () =>
      runEvalQuestion({
        question: q,
        text,
        sample,
        providers,
        config,
        modality: MODALITY,
        useRetrieval: !NO_RAG,
        includeInjected: !NO_INJECT,
      })
    );
    rows.push(row);
    console.log(
      `${q.id.padEnd(6)}${SAMPLES > 1 ? `#${sample} ` : ''}passages=${row.retrieved.length} answer=${row.answer.length} chars finish=${row.finishReason} safety=${row.safety?.level ?? '-'} first-token=${Math.round(row.timings?.firstToken ?? 0)}ms spent=US$${spent().toFixed(3)}`
    );
    if (++sinceSave >= CHECKPOINT_EVERY) {
      save(true);
      sinceSave = 0;
    }
    if (PACE_MS) await sleep(PACE_MS);
  }
}

const order = new Map(questions.map((q, i) => [q.id, i]));
rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0) || a.sample - b.sample);
save(stoppedForBudget);
const refused = rows.filter((r) => r.finishReason === 'refusal').length;
const cut = rows.filter((r) => r.finishReason === 'length').length;
console.log(
  `\nWrote ${outPath}: ${rows.length} answers, US$${spent().toFixed(2)} at list prices${refused ? `, ${refused} refused` : ''}${cut ? `, ${cut} cut off at the length limit` : ''}.`
);
if (stoppedForBudget) {
  console.error(
    `STOPPED at the --max-usd limit of ${MAX_USD} with ${questions.length * SAMPLES - rows.length} answers still to do. Re-run with --resume and a higher limit.`
  );
  process.exit(2);
}
console.log(`Next: node scripts/eval/safety-checks.mjs ${outPath.replace(`${ROOT}/`, '')}`);
