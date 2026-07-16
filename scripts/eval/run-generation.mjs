#!/usr/bin/env node
// Generation evaluation: runs the labelled question sets through the FULL
// production pipeline (retrieve → shared prompt → chat model) and saves the
// answers for safety-checks.mjs and grade-groundedness.mjs.
//
// Methodology note: generation runs at temperature 0 with a fixed seed for
// run-to-run comparability; production uses temperature 0.7. This is recorded
// in every output file. See docs/rag-evaluation-plan.md.
//
// Usage:
//   node scripts/eval/run-generation.mjs                     # all sets, active prompt version
//   node scripts/eval/run-generation.mjs --prompt v1         # A/B the old prompt
//   node scripts/eval/run-generation.mjs --sets S,I          # subset
//   node scripts/eval/run-generation.mjs --questions v1      # original question wording
//   node scripts/eval/run-generation.mjs --out <path.json>
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

import { requireEnv, retrieve, openaiJson, gitSha, outDir, sleep } from './lib.mjs';

const require = createRequire(import.meta.url);
const { QUESTIONS, questionText } = require('./questions.js');
const { CHAT_MODEL, PROMPT_VERSION, maxTokensForStyle } = require('../../src/lib/rag/ragConfig.js');
const { buildSystemPrompt, buildUserContent } = require('../../src/lib/rag/prompt.js');

const args = process.argv.slice(2);
const argVal = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const PROMPT = argVal('--prompt') ?? PROMPT_VERSION;
const QUESTION_VERSION = argVal('--questions') ?? 'v2';
const SETS = (argVal('--sets') ?? 'A,A-neighbour,B,C,S,I,N').split(',');
const OUT = argVal('--out');
const LIMIT = argVal('--limit') ? Number(argVal('--limit')) : Infinity;

const EVAL_TEMPERATURE = 0;
const EVAL_SEED = 42;

async function main() {
  requireEnv();
  const questions = QUESTIONS.filter(q => SETS.includes(q.set)).slice(0, LIMIT);
  console.log(`Generation eval — prompt ${PROMPT}, questions ${QUESTION_VERSION}, ${questions.length} questions, temp ${EVAL_TEMPERATURE}, seed ${EVAL_SEED}`);

  const systemPrompt = buildSystemPrompt({}, PROMPT);
  const rows = [];
  for (const q of questions) {
    const text = questionText(q, QUESTION_VERSION);
    const chunks = await retrieve(text);
    const data = await openaiJson('/chat/completions', {
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: buildUserContent(text, chunks) },
      ],
      max_tokens: maxTokensForStyle('balanced', false),
      temperature: EVAL_TEMPERATURE,
      seed: EVAL_SEED,
    });
    const answer = data.choices[0].message.content.trim();
    const usage = data.usage ?? {};
    rows.push({
      id: q.id,
      set: q.set,
      category: q.category,
      question: text,
      retrieved: chunks.map(c => ({ id: c.id, similarity: c.similarity })),
      answer,
      promptTokens: usage.prompt_tokens ?? null,
      completionTokens: usage.completion_tokens ?? null,
      systemFingerprint: data.system_fingerprint ?? null,
    });
    console.log(`${q.id.padEnd(4)} retrieved=${chunks.length}  answer=${answer.length} chars`);
    await sleep(250);
  }

  const sha = gitSha();
  const result = {
    generatedAt: new Date().toISOString(),
    gitSha: sha,
    promptVersion: PROMPT,
    questionVersion: QUESTION_VERSION,
    model: CHAT_MODEL,
    temperature: EVAL_TEMPERATURE,
    seed: EVAL_SEED,
    methodologyNote: 'Eval runs at temperature 0 + fixed seed for comparability; production runs at 0.7.',
    rows,
  };
  outDir(); // ensure docs/report/eval exists even with an explicit --out
  const outPath = OUT ? resolve(process.cwd(), OUT) : resolve(outDir(), `generation_${sha}_${PROMPT}.json`);
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  const totalTokens = rows.reduce((s, r) => s + (r.promptTokens ?? 0) + (r.completionTokens ?? 0), 0);
  console.log(`\nWrote ${outPath} (${rows.length} answers, ~${totalTokens} tokens total)`);
}

main().catch(e => { console.error(e); process.exit(1); });
