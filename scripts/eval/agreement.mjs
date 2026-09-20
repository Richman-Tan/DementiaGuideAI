#!/usr/bin/env node
// Inter-rater agreement: percent agreement and Cohen's kappa (unweighted,
// linear, quadratic) per dimension between two rating sources.
//
//   # human vs human (two filled sheets from human-sheet.mjs — same items)
//   node scripts/eval/agreement.mjs --a docs/report/eval/human/human-sheet_round1_R1.csv --b docs/report/eval/human/human-sheet_round1_R2.csv
//
//   # human vs LLM judge (join the sheet to judge rows through the KEY file)
//   node scripts/eval/agreement.mjs --a docs/report/eval/human/human-sheet_round1_R1.csv \
//        --key docs/report/eval/human/human-sheet_round1_KEY.csv --judge docs/report/eval/judge_claude-opus-5_v2.csv [more judge csvs]
//
//   # judge vs judge (two judge CSVs over the same generation file)
//   node scripts/eval/agreement.mjs --judge-a judge_claude-opus-5_v2.csv --judge-b judge_gpt-4o-mini_v2.csv
//
//   [--dims groundedness,correctness,helpfulness,tone,safety]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

import { ROOT } from './lib.mjs';

const require = createRequire(import.meta.url);
const { parseCsv } = require('./lib/csv.js');
const { cohenKappa } = require('./lib/stats.js');

const args = process.argv.slice(2);
const argVal = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const argAll = (name) => { const out = []; for (let i = 0; i < args.length; i++) if (args[i] === name) { let j = i + 1; while (j < args.length && !args[j].startsWith('--')) out.push(args[j++]); } return out; };
const DIMS = (argVal('--dims') ?? 'groundedness,correctness,helpfulness,tone,safety,scope').split(',');
const read = (p) => parseCsv(readFileSync(resolve(ROOT, p), 'utf8'));
const num = (v) => (v === '' || v == null || v === 'n/a' ? null : Number(v));

// Returns Map<"item|dim", score> for a sheet keyed by item number.
function sheetScores(rows) {
  const m = new Map();
  for (const r of rows) for (const d of DIMS) if (d in r) m.set(`${r.item}|${d}`, num(r[d]));
  return m;
}
// Returns Map<"column|id|sample|dim", score> for judge CSVs (long format).
function judgeScores(files) {
  const m = new Map();
  for (const f of files) for (const r of read(f)) m.set(`${r.column}|${r.id}|${r.sample}|${r.dimension}`, num(r.score));
  return m;
}

function report(label, pairsByDim) {
  console.log(`\n${label}\n`);
  console.log('| Dimension | n | % agreement | κ | κ linear | κ quadratic |');
  console.log('|---|---|---|---|---|---|');
  for (const d of DIMS) {
    const pairs = pairsByDim[d] ?? [];
    const a = pairs.map(p => p[0]), b = pairs.map(p => p[1]);
    const k0 = cohenKappa(a, b, { categories: [0, 1, 2] });
    if (!k0.n) continue;
    const k1 = cohenKappa(a, b, { weights: 'linear', categories: [0, 1, 2] });
    const k2 = cohenKappa(a, b, { weights: 'quadratic', categories: [0, 1, 2] });
    const f = (x) => (x == null ? '—' : x.toFixed(3));
    console.log(`| ${d} | ${k0.n} | ${(100 * k0.agreement).toFixed(1)}% | ${f(k0.kappa)} | ${f(k1.kappa)} | ${f(k2.kappa)} |`);
  }
  console.log('\nκ ≥ 0.6 is the pre-registered threshold for trusting the judge on a dimension; below it, report the human scores as primary.');
}

const pairsByDim = {};
const push = (d, x, y) => { if (x != null && y != null && !Number.isNaN(x) && !Number.isNaN(y)) (pairsByDim[d] ??= []).push([x, y]); };

if (argVal('--a') && argVal('--b')) {
  const A = sheetScores(read(argVal('--a'))), B = sheetScores(read(argVal('--b')));
  for (const [k, x] of A) { const [item, d] = k.split('|'); push(d, x, B.get(`${item}|${d}`)); }
  report(`Human vs human — ${argVal('--a')} vs ${argVal('--b')}`, pairsByDim);
} else if (argVal('--a') && argVal('--key') && argAll('--judge').length) {
  const A = sheetScores(read(argVal('--a')));
  const key = read(argVal('--key'));
  const J = judgeScores(argAll('--judge'));
  for (const k of key) for (const d of DIMS) push(d, A.get(`${k.item}|${d}`), J.get(`${k.column}|${k.id}|${k.sample}|${d}`));
  report(`Human vs judge — ${argVal('--a')} vs ${argAll('--judge').join(', ')}`, pairsByDim);
} else if (argVal('--judge-a') && argVal('--judge-b')) {
  const A = judgeScores([argVal('--judge-a')]), B = judgeScores([argVal('--judge-b')]);
  for (const [k, x] of A) { const d = k.split('|').pop(); push(d, x, B.get(k)); }
  report(`Judge vs judge — ${argVal('--judge-a')} vs ${argVal('--judge-b')}`, pairsByDim);
} else {
  console.error('Provide --a/--b (two sheets), --a/--key/--judge (sheet vs judge), or --judge-a/--judge-b.');
  process.exit(1);
}
