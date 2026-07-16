#!/usr/bin/env node
// LLM-judged groundedness over a saved generation run, with a stricter rubric
// than the retired rag-grade.mjs (which scored 32/32 answers a uniform 2/2 —
// a judge that never dissents measures nothing) and a mandatory human
// spot-check file. Judge output is never a gate on its own; the spot-check
// agreement is reported alongside it (docs/rag-evaluation-plan.md).
//
// Rubric (0/1/2, coarse on purpose — fine scales make LLM judges arbitrary):
//   2 — every factual claim is either traceable to the provided passages OR is
//       clearly framed as general knowledge; nothing contradicts the passages.
//   1 — mostly grounded, but at least one specific factual claim (number,
//       service name, medical fact) is presented as authoritative without
//       support from the passages.
//   0 — contradicts the passages, fabricates a source, or presents invented
//       specifics as sourced fact.
//
// Usage:
//   node scripts/eval/grade-groundedness.mjs <generation.json> [--sample 10]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

import { requireEnv, fetchChunks, openaiJson, outDir, csvEscape, sleep, ROOT } from './lib.mjs';

const require = createRequire(import.meta.url);
const { QUESTIONS } = require('./questions.js');

const JUDGE_MODEL = 'gpt-4o-mini';

const args = process.argv.slice(2);
const genPath = args.find(a => !a.startsWith('--'));
if (!genPath) {
  console.error('Usage: node scripts/eval/grade-groundedness.mjs <generation.json>');
  process.exit(1);
}
const argVal = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const SAMPLE = Number(argVal('--sample') ?? 10);

const JUDGE_SYSTEM = `You are a strict fact-checking judge for a dementia-care assistant. You receive: the user question, the reference passages the assistant was given, and the assistant's answer.

Score the answer's groundedness:
2 — every specific factual claim (numbers, phone numbers, service or program names, medical facts) is either supported by the passages or clearly presented as general knowledge; nothing contradicts the passages.
1 — mostly grounded, but at least one specific factual claim is stated authoritatively without support from the passages and without being framed as general knowledge.
0 — the answer contradicts the passages, cites a passage for something it does not say, or presents invented specifics as sourced fact.

Be strict: generic empathy and widely-known caregiving advice do not lower the score, but any unsupported specific (a number, a named program, a medical claim) presented as certain fact caps the score at 1.

Respond with JSON: {"score": 0|1|2, "reason": "<one sentence naming the specific claim that decided the score>"}`;

async function main() {
  requireEnv();
  const run = JSON.parse(readFileSync(resolve(ROOT, genPath), 'utf8'));
  const byId = Object.fromEntries(QUESTIONS.map(q => [q.id, q]));
  // Judge only in-scope answers (A sets) — B/C/S/I are covered by deterministic checks.
  const rows = run.rows.filter(r => ['A', 'A-neighbour'].includes(byId[r.id]?.set));
  console.log(`Grading groundedness — ${rows.length} in-scope answers, judge ${JUDGE_MODEL}, temp 0`);

  const graded = [];
  for (const row of rows) {
    const chunks = await fetchChunks(row.retrieved.map(r => r.id));
    const passages = chunks.map(c => `--- ${c.title} ---\n${c.content}`).join('\n\n') || '(no passages retrieved)';
    const data = await openaiJson('/chat/completions', {
      model: JUDGE_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: JUDGE_SYSTEM },
        { role: 'user', content: `QUESTION:\n${row.question}\n\nREFERENCE PASSAGES:\n${passages}\n\nASSISTANT ANSWER:\n${row.answer}` },
      ],
      max_tokens: 200,
    });
    let score = null, reason = 'unparsed';
    try { ({ score, reason } = JSON.parse(data.choices[0].message.content)); } catch {}
    graded.push({ id: row.id, set: byId[row.id].set, question: row.question, answer: row.answer, passages, score, reason });
    console.log(`${row.id.padEnd(4)} score=${score}  ${String(reason).slice(0, 90)}`);
    await sleep(200);
  }

  const dist = graded.reduce((m, g) => ((m[g.score] = (m[g.score] ?? 0) + 1), m), {});
  console.log(`\nDistribution: ${JSON.stringify(dist)}`);

  const base = `groundedness_${run.gitSha}_${run.promptVersion}`;
  const csvPath = resolve(outDir(), `${base}.csv`);
  const lines = ['id,set,score,reason'];
  for (const g of graded) lines.push([g.id, g.set, g.score, g.reason].map(csvEscape).join(','));
  writeFileSync(csvPath, lines.join('\n') + '\n');

  // Mandatory human spot-check sample: deterministic selection (every k-th row
  // after sorting by id) so re-runs sample the same questions.
  const sorted = [...graded].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const step = Math.max(1, Math.floor(sorted.length / SAMPLE));
  const sample = sorted.filter((_, i) => i % step === 0).slice(0, SAMPLE);
  const mdPath = resolve(outDir(), `${base}_spotcheck.md`);
  const md = [
    `# Groundedness spot-check — ${run.gitSha} / ${run.promptVersion}`,
    '',
    'For each row: read the passages and the answer, then record your own 0/1/2 in',
    'the "Human" column and note agreement with the judge. The judge is NOT trusted',
    `until agreement is recorded here. Judge distribution this run: ${JSON.stringify(dist)}.`,
    '',
    '| id | Judge | Human | Agree? |',
    '|----|-------|-------|--------|',
    ...sample.map(g => `| ${g.id} | ${g.score} | | |`),
    '',
    ...sample.flatMap(g => [
      `## ${g.id} (judge: ${g.score} — ${g.reason})`,
      `**Q:** ${g.question}`,
      '',
      `**Answer:**\n\n${g.answer}`,
      '',
      `<details><summary>Passages</summary>\n\n${g.passages}\n\n</details>`,
      '',
    ]),
  ].join('\n');
  writeFileSync(mdPath, md);

  console.log(`\nWrote ${csvPath}\n      ${mdPath} (${sample.length}-row human spot-check — REQUIRED before citing judge scores)`);
}

main().catch(e => { console.error(e); process.exit(1); });
