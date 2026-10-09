#!/usr/bin/env node
// §19B P1 (docs/eval/plan-19b-propagation.md): build the recogniser error
// models from the COMMITTED E9 aggregate artefacts only — never from
// DementiaBank transcripts, hypotheses or audio, which stay in the git-ignored
// data/dementiabank/ and are not read here.
//
// Inputs, per recogniser (dementia group, condition (a), fillers stripped):
//   docs/report/eval/stt/wer_<sha>_<model>.csv  per-speaker S/D/I/refWords (summed over the group)
//   docs/report/eval/stt/wer_<sha>_<model>.md   hallucination table row (phrase / empty counts),
//                                               function-word deletion share, top-30 substitutions
// Every value is recorded with the file and line it came from.
//
//   node scripts/eval/stt/build-error-model.mjs [--out docs/report/eval/stt/error-model_<sha>_s19b.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

import { ROOT, gitSha } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { parseCsv } = require('../lib/csv.js');
const { deriveRecogniser } = require('./asrModel.js');

const args = process.argv.slice(2);
const argVal = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };

const RECOGNISERS = [
  { id: 'w1', label: 'whisper-1 (deployed fallback / rescue recogniser)', stem: 'docs/report/eval/stt/wer_57ad032_whisper-1' },
  { id: 'ap', label: 'Apple on-device recogniser, en-NZ (proxy for the iOS live recogniser)', stem: 'docs/report/eval/stt/wer_e65cdc2_apple-ondevice-en-NZ' },
];
const GROUP = 'dementia';

const sha256 = (p) => createHash('sha256').update(readFileSync(resolve(ROOT, p))).digest('hex');

function findLine(lines, re, what, file) {
  const i = lines.findIndex(l => re.test(l));
  if (i === -1) throw new Error(`${file}: could not find ${what}`);
  return { line: i + 1, text: lines[i] };
}

function aggregatesFor({ stem }) {
  const csvPath = `${stem}.csv`, mdPath = `${stem}.md`;
  const rows = parseCsv(readFileSync(resolve(ROOT, csvPath), 'utf8')).filter(r => r.group === GROUP);
  const sum = (k) => rows.reduce((s, r) => s + Number(r[k]), 0);
  const counts = { speakers: rows.length, refWords: sum('refWords'), S: sum('S'), D: sum('D'), I: sum('I') };

  const lines = readFileSync(resolve(ROOT, mdPath), 'utf8').split('\n');
  // Primary-policy group row: "| dementia | 78 | 7870 | … | Sub | Del | Ins |" — the first such row.
  const primary = findLine(lines, new RegExp(`^\\| ${GROUP} \\| \\d+ \\| \\d+ \\|`), 'the primary-policy dementia row', mdPath);
  // Hallucination row: "| dementia | 1018 | 1.7% (17) | 11.4% (116) | 0.6% (6) | 3.0% (31) | …"
  const hall = findLine(lines, new RegExp(`^\\| ${GROUP} \\| (\\d+) \\| [\\d.]+% \\((\\d+)\\) \\| [\\d.]+% \\((\\d+)\\) \\| [\\d.]+% \\((\\d+)\\) \\| [\\d.]+% \\((\\d+)\\)`), 'the hallucination row', mdPath);
  const m = new RegExp(`^\\| ${GROUP} \\| (\\d+) \\| [\\d.]+% \\((\\d+)\\) \\| [\\d.]+% \\((\\d+)\\) \\| [\\d.]+% \\((\\d+)\\) \\| [\\d.]+% \\((\\d+)\\)`).exec(hall.text);
  const [utterances, runaway, phrase, repetition, empty] = m.slice(1).map(Number);
  const fn = findLine(lines, /^Function-word share of deletions: [\d.]+% \((\d+) function, (\d+) content\)/, 'the function-word deletion share', mdPath);
  const [, fnDeleted, contentDeleted] = /\((\d+) function, (\d+) content\)/.exec(fn.text).map(Number);
  const subHead = findLine(lines, /^Top substitutions/, 'the substitution table', mdPath);
  const substitutions = [];
  let k = subHead.line; // 0-based index of the line after the heading
  while (k < lines.length && !/^- /.test(lines[k])) k++;
  const firstSub = k + 1;
  for (; k < lines.length && /^- /.test(lines[k]); k++) {
    const s = /^- (\S+) → (\S+) \((\d+)\)/.exec(lines[k]);
    if (s) substitutions.push({ ref: s[1], hyp: s[2], n: Number(s[3]) });
  }
  const lastSub = k;

  // Cross-check: the CSV sums reproduce the md's rounded Sub/Del/Ins percentages.
  const pct = primary.text.split('|').map(c => c.trim()).filter(Boolean).slice(-3).map(c => Number(c.replace('%', '')));
  const fromCsv = [counts.S, counts.D, counts.I].map(x => Number((100 * x / counts.refWords).toFixed(1)));
  if (pct.join() !== fromCsv.join()) throw new Error(`${stem}: CSV sums ${fromCsv} do not reproduce the md row ${pct}`);

  return {
    aggregates: { ...counts, utterances, phraseUtterances: phrase, emptyUtterances: empty, runawayUtterances: runaway, repetitionUtterances: repetition, fnDeleted, contentDeleted, substitutions },
    sources: {
      [csvPath]: { sha256: sha256(csvPath), used: `per-speaker S, D, I and refWords summed over the ${counts.speakers} ${GROUP} speakers` },
      [mdPath]: {
        sha256: sha256(mdPath),
        lines: {
          [primary.line]: `primary-policy ${GROUP} row (cross-check of the CSV sums): ${primary.text}`,
          [hall.line]: `hallucination table, ${GROUP} row (utterances, phrase and empty counts): ${hall.text}`,
          [fn.line]: `function-word deletion share: ${fn.text}`,
          [`${firstSub}-${lastSub}`]: `top-${substitutions.length} substitution table`,
        },
      },
    },
  };
}

const out = {
  generatedAt: new Date().toISOString(),
  gitSha: gitSha(),
  generator: 'scripts/eval/stt/build-error-model.mjs',
  plan: 'docs/eval/plan-19b-propagation.md §19B.1',
  group: GROUP,
  condition: "E9 condition (a) — utterance cuts, pauses included; fillers stripped (primary policy)",
  calibration: 'expected per-word S, D, I over a population of mean-length utterances equal the committed pooled totals; empty utterances = all words deleted; stock-phrase words = insertions; empty and phrase utterances assumed to have the mean reference length (refWords / utterances)',
  dataRule: 'built from committed aggregate artefacts only; no DementiaBank transcript, hypothesis or audio is read or sent anywhere',
  recognisers: {},
};
for (const r of RECOGNISERS) {
  const { aggregates, sources } = aggregatesFor(r);
  const model = deriveRecogniser(aggregates);
  out.recognisers[r.id] = { label: r.label, aggregates, model, sources };
}

const path = resolve(ROOT, argVal('--out') ?? `docs/report/eval/stt/error-model_${out.gitSha}_s19b.json`);
writeFileSync(path, JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${path}`);
for (const [id, r] of Object.entries(out.recognisers)) {
  const m = r.model;
  console.log(`  ${id}: pEmpty ${(100 * m.pEmpty).toFixed(2)}%  pPhrase|non-empty ${(100 * m.pPhraseGivenNonEmpty).toFixed(2)}%  non-empty sub ${(100 * m.rates.sub).toFixed(2)}% del ${(100 * m.rates.del).toFixed(2)}% ins ${(100 * m.rates.ins).toFixed(2)}%  fn-del share ${(100 * m.functionWordDeletionShare).toFixed(1)}%  confusions ${m.confusions.length}  insert words ${m.insertWords.map(x => `${x.w}:${x.n}`).join(' ')}`);
}
