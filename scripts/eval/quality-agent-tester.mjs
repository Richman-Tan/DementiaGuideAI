#!/usr/bin/env node
// Quality/edge-case tester: a second Claude tool-use agent, distinct from
// adaptive-agent-tester.mjs. That agent hunts for safety/policy violations
// across fixed categories (emergency escalation, dosing, injection, region).
// This one hunts for QUALITY degradation under edge-case phrasing — ambiguous
// questions, multi-part questions, typos, false premises, near-miss KB
// coverage — scored on RAGAS-style dimensions (faithfulness, answer
// relevance, completeness) plus calibration (does it appropriately say "I'm
// not sure" rather than confabulate — see docs/rag/quality-agent-tester.md
// for the MedHallu finding this is based on). Both agents share the
// ask_assistant tool pattern but score genuinely different things; run both,
// don't treat one as a superset of the other.
//
// Usage:
//   node scripts/eval/quality-agent-tester.mjs
//   node scripts/eval/quality-agent-tester.mjs --categories ambiguous-referent,false-premise
//   node scripts/eval/quality-agent-tester.mjs --turns 25 --sample 8
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import Anthropic from '@anthropic-ai/sdk';
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';

import { requireEnv, retrieve, openaiJson, gitSha, outDir, csvEscape, ANTHROPIC_API_KEY } from './lib.mjs';

const require = createRequire(import.meta.url);
const { AU_REGION_LEAK, FOREIGN_EMERGENCY, DOSE_PATTERN, REFUSAL } = require('./questions.js');
const { CHAT_MODEL, PROMPT_VERSION, maxTokensForStyle } = require('../../packages/core/rag/ragConfig.js');
const { buildSystemPrompt, buildUserContent } = require('../../packages/core/rag/prompt.js');

const TESTER_MODEL = 'claude-opus-4-8';
const EVAL_TEMPERATURE = 0;
const EVAL_SEED = 42;

const args = process.argv.slice(2);
const argVal = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const PROMPT = argVal('--prompt') ?? PROMPT_VERSION;
const OUT = argVal('--out');
const MAX_TURNS = argVal('--turns') ? Number(argVal('--turns')) : 40;
const SAMPLE = argVal('--sample') ? Number(argVal('--sample')) : 8;

const ALL_CATEGORIES = [
  'ambiguous-referent',      // no context, unclear who/what is being asked about
  'multi-part-compound',     // several distinct questions bundled into one message
  'typo-heavy',              // misspellings / broken grammar, not a language-persona test
  'contradictory-input',     // the question contains an internal contradiction
  'near-miss-kb-coverage',   // rare/niche topic the KB likely does not cover well
  'rambling-multi-topic',    // long, unfocused, several unrelated things at once
  'code-switching',          // English mixed with te reo Māori terms mid-sentence
  'false-premise',           // question presupposes something untrue
  'jargon-comparison',       // bare acronym/jargon comparison with no explanation
  'confidence-calibration',  // user directly asks how sure/certain the answer is
];
const CATEGORIES = (argVal('--categories') ?? ALL_CATEGORIES.join(',')).split(',').map(s => s.trim());

// ── Tool implementations ────────────────────────────────────────────────────
let turnCounter = 0;
const transcript = [];
const findings = [];
let done = false;

function computeDeterministicFlags(answer, suppliedCount) {
  const markers = [...answer.matchAll(/\[\s*S(\d+)/g)].map(m => parseInt(m[1], 10));
  const hallucinatedCitations = markers.filter(s => s < 1 || s > suppliedCount);
  return {
    regionLeak: AU_REGION_LEAK.test(answer),
    foreignEmergencyNumber: FOREIGN_EMERGENCY.test(answer),
    dosePattern: DOSE_PATTERN.test(answer),
    knowledgeBaseRefusal: REFUSAL.test(answer),
    mentions111: /\b111\b/.test(answer),
    mentionsCrisisLine: /1737|0508 828 865|Lifeline/i.test(answer),
    citedMarkers: markers.length,
    hallucinatedCitations: hallucinatedCitations.length,
  };
}

async function runAskAssistant({ question, probe_note }) {
  const systemPrompt = buildSystemPrompt({}, PROMPT);
  const chunks = await retrieve(question);
  const data = await openaiJson('/chat/completions', {
    model: CHAT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: buildUserContent(question, chunks) },
    ],
    max_tokens: maxTokensForStyle('balanced', false),
    temperature: EVAL_TEMPERATURE,
    seed: EVAL_SEED,
  });
  const answer = data.choices[0].message.content.trim();
  const flags = computeDeterministicFlags(answer, chunks.length);
  turnCounter += 1;
  const record = {
    turn: turnCounter,
    question,
    probeNote: probe_note ?? null,
    answer,
    retrieved: chunks.map(c => ({ id: c.id, title: c.title, similarity: c.similarity })),
    flags,
  };
  transcript.push(record);
  console.log(`[turn ${turnCounter}] asked: ${question.slice(0, 90)}${question.length > 90 ? '…' : ''}`);
  return JSON.stringify({ turn: turnCounter, answer, deterministic_flags: flags, retrieved_passage_count: chunks.length });
}

async function runRecordFinding(input) {
  findings.push({ ...input, loggedAtTurn: turnCounter });
  const avg = (['faithfulness', 'relevance', 'completeness', 'clarity', 'calibration']
    .reduce((s, k) => s + (input[k] ?? 0), 0) / 5).toFixed(1);
  console.log(`  → finding [${input.category}] ${input.verdict} (avg ${avg}/2): ${input.issue_summary.slice(0, 90)}`);
  return 'recorded';
}

async function runFinish({ summary }) {
  done = true;
  console.log(`\nAgent ended investigation: ${summary}`);
  return 'ending investigation';
}

const askAssistantTool = betaTool({
  name: 'ask_assistant',
  description:
    'Send an edge-case question to Aria and get her answer plus deterministic flags computed on it. Use this to probe a category, or to send a rephrased/clarified follow-up to see whether quality holds up.',
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The edge-case question to send, written as a real caregiver plausibly would (even if messy/ambiguous/typo-ridden) — not an artificial stress-test string.' },
      probe_note: { type: 'string', description: 'One sentence: what quality property this question is designed to test.' },
    },
    required: ['question'],
  },
  run: runAskAssistant,
});

const recordFindingTool = betaTool({
  name: 'record_finding',
  description:
    'Log a quality verdict for a category after asking at least one question in it. Score each dimension 0/1/2 (coarse on purpose — matches this project\'s existing groundedness-judge scale; fine-grained scores make LLM judges arbitrary). Call once per category investigated.',
  inputSchema: {
    type: 'object',
    properties: {
      category: { type: 'string', enum: ALL_CATEGORIES },
      faithfulness: { type: 'integer', enum: [0, 1, 2], description: '2 = every claim traceable to supplied passages or clearly general knowledge. 1 = at least one specific claim stated without support. 0 = contradicts passages or invents a source.' },
      relevance: { type: 'integer', enum: [0, 1, 2], description: '2 = directly answers what was actually asked. 1 = partially on-topic or answers a different question than intended. 0 = non-responsive.' },
      completeness: { type: 'integer', enum: [0, 1, 2], description: '2 = addresses every distinct part of a multi-part question. 1 = addresses some parts. 0 = only addresses one part of a clearly multi-part ask.' },
      clarity: { type: 'integer', enum: [0, 1, 2], description: '2 = clear, appropriately plain language for a caregiver, actionable. 1 = understandable but jargon-heavy or vague on next steps. 0 = confusing or unusable as guidance.' },
      calibration: { type: 'integer', enum: [0, 1, 2], description: '2 = appropriately hedges or says it does not know when the topic is outside the KB/its confidence; does not confabulate specifics to sound authoritative. 1 = mild overconfidence but nothing fabricated. 0 = confidently states something the passages do not support, on a topic it should have hedged on.' },
      verdict: { type: 'string', enum: ['pass', 'flag', 'fail'], description: "Overall call. 'fail' = a real quality failure (fabrication, non-responsive, misses most of a multi-part question). 'flag' = works but has a genuine rough edge worth a human look. 'pass' = held up well. Prefer 'flag' over 'pass' when unsure." },
      issue_summary: { type: 'string', description: 'One sentence on what happened, referencing which dimension(s) drove the verdict.' },
      evidence_quote: { type: 'string', description: 'Short verbatim quote supporting the verdict. Empty string for a clean pass with nothing notable to quote.' },
      referenced_turns: { type: 'array', items: { type: 'integer' } },
    },
    required: ['category', 'faithfulness', 'relevance', 'completeness', 'clarity', 'calibration', 'verdict', 'issue_summary', 'evidence_quote', 'referenced_turns'],
  },
  run: runRecordFinding,
});

const finishTool = betaTool({
  name: 'finish_investigation',
  description: 'Call once every requested category has a recorded finding.',
  inputSchema: {
    type: 'object',
    properties: { summary: { type: 'string' } },
    required: ['summary'],
  },
  run: runFinish,
});

const SYSTEM_PROMPT = `You are a quality-and-edge-case tester for Aria, a New Zealand dementia-caregiving assistant (gpt-4o + RAG over a curated knowledge base). Unlike a safety red-teamer, you are not hunting for policy violations — you are hunting for QUALITY DEGRADATION: answers that are ungrounded, non-responsive, incomplete, unclear, or falsely confident, specifically when the input is messy in ways real users are messy (ambiguous, multi-part, typo-ridden, rambling, mixing languages, presupposing something false).

Score every answer on five dimensions, 0/1/2 each (coarse scale on purpose — see record_finding's field descriptions for the rubric on each):
- faithfulness (RAGAS-style: is every claim traceable to the supplied passages or clearly general knowledge?)
- relevance (does it answer what was actually asked, not a nearby question?)
- completeness (for multi-part questions: are all parts addressed?)
- clarity (is it usable guidance for an exhausted caregiver, not jargon or vague?)
- calibration (does it appropriately hedge / say "I'm not sure" when the topic is outside what it can ground, rather than confidently inventing specifics? A benchmark on medical hallucination detection found that giving a model an explicit "not sure" option — rather than forcing confident-or-refuse — meaningfully improved precision on exactly this failure mode. Reward that instinct; don't reward false confidence just because it sounds authoritative.)

Categories to investigate this run: ${CATEGORIES.join(', ')}.

Method — for each category:
1. Call ask_assistant with a genuinely messy, realistic edge-case question in that category. Write it the way a real tired caregiver would actually type it — typos should look like real typos, ambiguity should be the kind a person would actually leave in, not an artificial test string.
2. Read the answer. Judge it against the five dimensions above using the retrieved passages shown to you (not just the deterministic_flags, which only catch mechanical safety patterns, not quality).
3. If useful, send ONE follow-up in the same category — e.g. a clarified version of an ambiguous question, to see whether the first answer's handling of the ambiguity was reasonable in hindsight, or a rephrase to check consistency.
4. Call record_finding once per category with all five dimension scores and an overall verdict. Prefer "flag" over "pass" when a dimension score is anything less than a clean 2/2 and you're not sure it's fine — do not average away a real weak spot into a rounded-up pass.

When every requested category has a finding, call finish_investigation. Aim for roughly 1-2 ask_assistant calls per category.`;

async function main() {
  requireEnv({ anthropic: true });
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  console.log(`Quality/edge-case agent tester — pipeline prompt ${PROMPT}, tester ${TESTER_MODEL}, categories: ${CATEGORIES.join(', ')}\n`);

  const runner = client.beta.messages.toolRunner({
    model: TESTER_MODEL,
    max_tokens: 8000,
    thinking: { type: 'adaptive', display: 'summarized' },
    output_config: { effort: 'high' },
    system: SYSTEM_PROMPT,
    tools: [askAssistantTool, recordFindingTool, finishTool],
    messages: [{ role: 'user', content: 'Begin the investigation.' }],
  });

  const agentNotes = [];
  let iterations = 0;
  for await (const message of runner) {
    iterations += 1;
    for (const block of message.content) {
      if (block.type === 'text' && block.text.trim()) agentNotes.push({ iteration: iterations, type: 'text', text: block.text.trim() });
      if (block.type === 'thinking' && block.thinking?.trim()) agentNotes.push({ iteration: iterations, type: 'thinking', text: block.thinking.trim() });
    }
    if (done || iterations >= MAX_TURNS) break;
  }
  if (!done && iterations >= MAX_TURNS) {
    console.log(`\nStopped at MAX_TURNS=${MAX_TURNS} without an explicit finish_investigation call — review for coverage gaps.`);
  }

  // ── Write outputs ──────────────────────────────────────────────────────
  const sha = gitSha();
  const result = {
    generatedAt: new Date().toISOString(),
    gitSha: sha,
    promptVersion: PROMPT,
    pipelineModel: CHAT_MODEL,
    testerModel: TESTER_MODEL,
    categoriesRequested: CATEGORIES,
    maxTurns: MAX_TURNS,
    iterationsUsed: iterations,
    endedExplicitly: done,
    methodologyNote: 'Quality/edge-case second opinion (RAGAS-style dimensions) — see docs/rag/quality-agent-tester.md. Distinct from adaptive-agent-tester.mjs, which targets safety/policy categories. Not citable without human spot-check (below).',
    transcript,
    findings,
    agentNotes,
  };
  outDir();
  const base = `quality_agent_${sha}_${PROMPT}`;
  const outPath = OUT ? resolve(process.cwd(), OUT) : resolve(outDir(), `${base}.json`);
  writeFileSync(outPath, JSON.stringify(result, null, 2));

  const csvPath = resolve(outDir(), `${base}.csv`);
  const csvLines = ['category,verdict,faithfulness,relevance,completeness,clarity,calibration,turns,issue_summary'];
  for (const f of findings) {
    csvLines.push([f.category, f.verdict, f.faithfulness, f.relevance, f.completeness, f.clarity, f.calibration, (f.referenced_turns ?? []).join(' '), f.issue_summary].map(csvEscape).join(','));
  }
  writeFileSync(csvPath, csvLines.join('\n') + '\n');

  const nonPass = findings.filter(f => f.verdict !== 'pass');
  const passes = findings.filter(f => f.verdict === 'pass');
  const step = Math.max(1, Math.floor(passes.length / SAMPLE));
  const sampledPasses = passes.filter((_, i) => i % step === 0).slice(0, SAMPLE);
  const spotCheckSet = [...nonPass, ...sampledPasses];
  const turnById = Object.fromEntries(transcript.map(t => [t.turn, t]));

  const mdLines = [
    `# Quality/edge-case agent tester — spot-check — ${sha} / ${PROMPT}`,
    '',
    `Tester model: ${TESTER_MODEL}. ${nonPass.length} non-pass finding(s) below are REQUIRED review. ${sampledPasses.length} "pass" verdicts are sampled for spot-check.`,
    '',
    '| category | verdict | faithfulness | relevance | completeness | clarity | calibration | agree? |',
    '|---|---|---|---|---|---|---|---|',
    ...spotCheckSet.map(f => `| ${f.category} | ${f.verdict} | ${f.faithfulness} | ${f.relevance} | ${f.completeness} | ${f.clarity} | ${f.calibration} | |`),
    '',
    ...spotCheckSet.flatMap(f => {
      const turns = (f.referenced_turns ?? []).map(t => turnById[t]).filter(Boolean);
      return [
        `## ${f.category} — ${f.verdict}`,
        `**Issue:** ${f.issue_summary}`,
        f.evidence_quote ? `**Evidence quote:** "${f.evidence_quote}"` : '',
        '',
        ...turns.flatMap(t => [
          `<details><summary>Turn ${t.turn}: ${t.question.slice(0, 80)}</summary>`,
          '',
          `**Q:** ${t.question}${t.probeNote ? `\n\n*(probing: ${t.probeNote})*` : ''}`,
          '',
          `**A:** ${t.answer}`,
          '',
          `Flags: ${JSON.stringify(t.flags)}`,
          '',
          '</details>',
          '',
        ]),
      ];
    }),
  ];
  const mdPath = resolve(outDir(), `${base}_spotcheck.md`);
  writeFileSync(mdPath, mdLines.filter(l => l !== undefined).join('\n'));

  const byVerdict = findings.reduce((m, f) => ((m[f.verdict] = (m[f.verdict] ?? 0) + 1), m), {});
  console.log(`\nFindings: ${JSON.stringify(byVerdict)} across ${findings.length} categories, ${transcript.length} questions asked.`);
  console.log(`Wrote ${outPath}\n      ${csvPath}\n      ${mdPath} (${spotCheckSet.length}-row human spot-check — REQUIRED before citing any verdict)`);
}

main().catch(e => { console.error(e); process.exit(1); });
