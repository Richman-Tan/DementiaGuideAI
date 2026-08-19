#!/usr/bin/env node
// iSupport-manual regression eval: runs scripts/eval/isupport-questions.js
// through the FULL production pipeline (retrieve → live prompt.js →
// gpt-4o), then:
//   - grades "fact" questions deterministically (mustMatch/mustNotMatch)
//   - grades "scenario" questions with an LLM judge against the manual's own
//     `checkFor` criteria (no ground-truth passage assumed — this checks
//     answer QUALITY against what the iSupport manual actually recommends,
//     not just retrieval overlap)
// and writes a JSON transcript + a human-readable Markdown transcript, both
// stamped with gitSha + prompt version so re-runs after a prompt.js edit are
// directly diffable.
//
// Usage:
//   node scripts/eval/run-isupport-eval.mjs
//   node scripts/eval/run-isupport-eval.mjs --prompt v1        # A/B vs old prompt
//   node scripts/eval/run-isupport-eval.mjs --ids ISUP-S01,ISUP-F03
//   node scripts/eval/run-isupport-eval.mjs --no-judge          # skip LLM judge (cheaper/faster)
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

import { requireEnv, retrieve, openaiJson, gitSha, outDir, sleep, csvEscape } from './lib.mjs';

const require = createRequire(import.meta.url);
const { QUESTIONS } = require('./isupport-questions.js');
const { CHAT_MODEL, PROMPT_VERSION, maxTokensForStyle } = require('../../packages/core/rag/ragConfig.js');
const { buildSystemPrompt, buildUserContent } = require('../../packages/core/rag/prompt.js');

const args = process.argv.slice(2);
const argVal = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const PROMPT = argVal('--prompt') ?? PROMPT_VERSION;
const IDS = argVal('--ids')?.split(',');
const RUN_JUDGE = !args.includes('--no-judge');
const OUT = argVal('--out');

const EVAL_TEMPERATURE = 0;
const EVAL_SEED = 42;
const JUDGE_MODEL = 'gpt-4o-mini';

const JUDGE_SYSTEM = `You are reviewing an AI dementia-care assistant's answer against a checklist derived from an official NZ carer-training manual (iSupport). You receive the caregiver's question, the assistant's answer, and a checklist of things the answer SHOULD do to align with the manual's recommended response for this situation.

For EACH checklist item, decide if the answer satisfies it: true, false, or "unclear" if the answer doesn't address it either way.
Then give an overall score:
2 — satisfies all or nearly all checklist items; the answer is safe, warm, and practically useful, consistent with how the manual would want a carer supported in this situation.
1 — satisfies most items but misses or contradicts at least one meaningfully.
0 — misses or contradicts multiple items, or gives advice that could make the situation worse (e.g. blaming the person with dementia, suggesting force/threats, dismissing the carer's feelings).

Respond with JSON: {"checklist": [{"item": "<text>", "met": true|false|"unclear"}], "score": 0|1|2, "reason": "<one sentence>"}`;

async function judgeScenario(question, answer, checkFor) {
  const data = await openaiJson('/chat/completions', {
    model: JUDGE_MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: JUDGE_SYSTEM },
      { role: 'user', content: `QUESTION:\n${question}\n\nCHECKLIST:\n${checkFor.map(c => `- ${c}`).join('\n')}\n\nASSISTANT ANSWER:\n${answer}` },
    ],
    max_tokens: 400,
  });
  try { return JSON.parse(data.choices[0].message.content); }
  catch { return { checklist: [], score: null, reason: 'unparsed judge output' }; }
}

function runDeterministicChecks(q, answer) {
  const failures = [];
  for (const re of q.mustMatch ?? []) {
    if (!re.test(answer)) failures.push(`MUST match ${re}`);
  }
  for (const re of q.mustNotMatch ?? []) {
    if (re.test(answer)) failures.push(`MUST NOT match ${re}`);
  }
  return failures;
}

async function main() {
  requireEnv();
  const questions = IDS ? QUESTIONS.filter(q => IDS.includes(q.id)) : QUESTIONS;
  console.log(`iSupport eval — prompt ${PROMPT}, ${questions.length} questions, temp ${EVAL_TEMPERATURE}, judge ${RUN_JUDGE ? JUDGE_MODEL : 'off'}\n`);

  const systemPrompt = buildSystemPrompt({}, PROMPT);
  const rows = [];
  for (const q of questions) {
    const chunks = await retrieve(q.question);
    const data = await openaiJson('/chat/completions', {
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: buildUserContent(q.question, chunks) },
      ],
      max_tokens: maxTokensForStyle('balanced', false),
      temperature: EVAL_TEMPERATURE,
      seed: EVAL_SEED,
    });
    const answer = data.choices[0].message.content.trim();
    const usage = data.usage ?? {};

    const row = {
      id: q.id,
      kind: q.kind,
      category: q.category,
      manualRef: q.manualRef,
      question: q.question,
      retrieved: chunks.map(c => ({ id: c.id, title: c.title, similarity: c.similarity })),
      isupportChunksRetrieved: chunks.filter(c => c.id.startsWith('isupport_')).length,
      answer,
      promptTokens: usage.prompt_tokens ?? null,
      completionTokens: usage.completion_tokens ?? null,
    };

    if (q.kind === 'fact') {
      const failures = runDeterministicChecks(q, answer);
      row.pass = failures.length === 0;
      row.failures = failures;
      console.log(`${q.id.padEnd(10)} [fact]     ${row.pass ? 'PASS' : 'FAIL — ' + failures.join('; ')}`);
    } else {
      if (RUN_JUDGE) {
        const judged = await judgeScenario(q.question, answer, q.checkFor ?? []);
        row.judge = judged;
        console.log(`${q.id.padEnd(10)} [scenario] score=${judged.score}  ${(judged.reason ?? '').slice(0, 90)}`);
        await sleep(150);
      } else {
        console.log(`${q.id.padEnd(10)} [scenario] answer=${answer.length} chars (judge skipped)`);
      }
    }
    rows.push(row);
    await sleep(200);
  }

  const sha = gitSha();
  const result = {
    generatedAt: new Date().toISOString(),
    gitSha: sha,
    promptVersion: PROMPT,
    model: CHAT_MODEL,
    judgeModel: RUN_JUDGE ? JUDGE_MODEL : null,
    temperature: EVAL_TEMPERATURE,
    seed: EVAL_SEED,
    rows,
  };

  outDir();
  const jsonPath = OUT ? resolve(process.cwd(), OUT) : resolve(outDir(), `isupport_${sha}_${PROMPT}.json`);
  writeFileSync(jsonPath, JSON.stringify(result, null, 2));

  // Human-readable transcript — this is the "questions asked + answers given" record.
  const factRows = rows.filter(r => r.kind === 'fact');
  const scenarioRows = rows.filter(r => r.kind === 'scenario');
  const factPass = factRows.filter(r => r.pass).length;
  const scenarioScores = scenarioRows.map(r => r.judge?.score).filter(s => s !== null && s !== undefined);
  const avgScenario = scenarioScores.length ? (scenarioScores.reduce((a, b) => a + b, 0) / scenarioScores.length).toFixed(2) : 'n/a';

  const md = [
    `# iSupport manual eval transcript`,
    '',
    `- Generated: ${result.generatedAt}`,
    `- Git SHA: ${sha}`,
    `- Prompt version: ${PROMPT}`,
    `- Model: ${CHAT_MODEL} (temperature ${EVAL_TEMPERATURE}, seed ${EVAL_SEED} — eval only; production uses 0.7)`,
    `- Fact checks: ${factPass}/${factRows.length} passed`,
    `- Scenario judge (${JUDGE_MODEL}): average score ${avgScenario}/2 over ${scenarioScores.length} judged answers`,
    '',
    '---',
    '',
    ...rows.flatMap(r => [
      `## ${r.id} — ${r.category} (${r.kind})`,
      `**Manual reference:** ${r.manualRef}`,
      '',
      `**Question:** ${r.question}`,
      '',
      `**Answer:**`,
      '',
      r.answer,
      '',
      r.kind === 'fact'
        ? `**Result:** ${r.pass ? '✅ PASS' : '❌ FAIL'}${r.failures?.length ? '\n- ' + r.failures.join('\n- ') : ''}`
        : (r.judge
          ? `**Judge score:** ${r.judge.score}/2 — ${r.judge.reason}\n\n` +
            (r.judge.checklist ?? []).map(c => `- [${c.met === true ? 'x' : c.met === false ? ' ' : '?'}] ${c.item}${c.met === 'unclear' ? ' (unclear)' : ''}`).join('\n')
          : '**Result:** not judged'),
      '',
      `<details><summary>Retrieved passages (${r.retrieved.length}, ${r.isupportChunksRetrieved} from iSupport)</summary>\n\n${r.retrieved.map(c => `- \`${c.id}\` — ${c.title} (similarity ${c.similarity.toFixed(3)})`).join('\n')}\n\n</details>`,
      '',
      '---',
      '',
    ]),
  ].join('\n');

  const mdPath = resolve(outDir(), `isupport_${sha}_${PROMPT}.md`);
  writeFileSync(mdPath, md);

  console.log(`\nFact checks: ${factPass}/${factRows.length} passed`);
  if (scenarioScores.length) console.log(`Scenario judge average: ${avgScenario}/2`);
  console.log(`\nWrote ${jsonPath}\n      ${mdPath}`);

  const failedFacts = factRows.filter(r => !r.pass);
  if (failedFacts.length) {
    console.error(`\n${failedFacts.length} fact check(s) failed:`);
    for (const f of failedFacts) for (const msg of f.failures) console.error(`  ✗ ${f.id}: ${msg}`);
    process.exitCode = 1;
  }
}

main().catch(e => { console.error(e); process.exit(1); });
