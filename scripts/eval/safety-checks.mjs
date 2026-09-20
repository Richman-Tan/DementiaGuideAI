#!/usr/bin/env node
// Deterministic safety assertions over a saved generation run — no LLM, no
// network. Exits non-zero when any MUST/MUST-NOT fails, so it can gate CI.
//
// Checks (implemented in scripts/eval/lib/checks.js, shared with safety-report.mjs):
//   1. Per-question mustMatch / mustNotMatch from scripts/eval/questions.js
//      (S = emergency/dosing/diagnosis, I = injection, J = indirect injection,
//      plus B/N assertions).
//   2. Global region check: NO answer may reference Australian services
//      (applies to NZ-era prompts — v2 and its ablations; legacy runs without a
//      `region` header field are inferred from promptVersion).
//   3. Refusal-regression check: in-scope (A) answers must not contain
//      knowledge-base-style refusals (the failure mode the 2026-07-15 prompt
//      change eliminated).
//   4. Citation validity: every [S#] marker must reference a supplied passage.
//
// Multi-sample runs (run-generation.mjs --samples N) are scored per answer;
// use safety-report.mjs for per-item robust-pass rates and confidence intervals.
//
// Usage:
//   node scripts/eval/safety-checks.mjs <generation.json> [--out <path.csv>]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

import { ROOT, outDir, csvEscape } from './lib.mjs';

const require = createRequire(import.meta.url);
const { QUESTIONS } = require('./questions.js');
const { checkRow, runRegion } = require('./lib/checks.js');

const args = process.argv.slice(2);
const genPath = args.find(a => !a.startsWith('--'));
if (!genPath) {
  console.error('Usage: node scripts/eval/safety-checks.mjs <generation.json>');
  process.exit(1);
}
const argVal = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };

const run = JSON.parse(readFileSync(resolve(ROOT, genPath), 'utf8'));
const byId = Object.fromEntries(QUESTIONS.map(q => [q.id, q]));
const region = runRegion(run);
const condition = run.condition ?? run.promptVersion;

const results = [];
for (const row of run.rows) {
  const q = byId[row.id];
  if (!q) continue;
  const r = checkRow(q, row, { region });
  results.push({ id: row.id, sample: row.sample ?? 0, set: q.set, category: q.category, pass: r.pass, failures: r.failures, citedMarkers: r.citedMarkers, hallucinatedMarkers: r.hallucinatedMarkers });
}

const failed = results.filter(r => !r.pass);
const bySet = {};
for (const r of results) {
  bySet[r.set] ??= { pass: 0, total: 0 };
  bySet[r.set].total += 1;
  if (r.pass) bySet[r.set].pass += 1;
}

console.log(`Safety checks over ${genPath} (condition ${condition}, region ${region}, ${results.length} answers)\n`);
for (const [set, s] of Object.entries(bySet)) {
  console.log(`  ${set.padEnd(12)} ${s.pass}/${s.total} pass`);
}
const totalMarkers = results.reduce((s, r) => s + r.citedMarkers, 0);
const totalHallucinated = results.reduce((s, r) => s + r.hallucinatedMarkers, 0);
if (totalMarkers > 0) {
  console.log(`  citations    ${totalMarkers - totalHallucinated}/${totalMarkers} markers valid (citation precision ${(100 * (totalMarkers - totalHallucinated) / totalMarkers).toFixed(1)}%)`);
}
if (failed.length) {
  console.log('\nFAILURES:');
  for (const f of failed) {
    for (const msg of f.failures) console.log(`  ✗ ${f.id}${f.sample ? `#${f.sample}` : ''} (${f.category}): ${msg}`);
  }
}

const outPath = argVal('--out') ?? resolve(outDir(), `safety_${run.gitSha}_${condition}${run.tag ? `_${run.tag}` : ''}.csv`);
const lines = ['id,sample,set,category,pass,failures'];
for (const r of results) lines.push([r.id, r.sample, r.set, r.category, r.pass ? 1 : 0, r.failures.join('; ')].map(csvEscape).join(','));
writeFileSync(outPath, lines.join('\n') + '\n');
console.log(`\nWrote ${outPath}`);

if (failed.length) {
  console.error(`\n${failed.length} answer(s) failed safety checks.`);
  process.exit(1);
}
console.log('\nAll safety checks passed.');
