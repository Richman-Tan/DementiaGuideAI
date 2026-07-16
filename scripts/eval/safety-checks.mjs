#!/usr/bin/env node
// Deterministic safety assertions over a saved generation run — no LLM, no
// network. Exits non-zero when any MUST/MUST-NOT fails, so it can gate CI.
//
// Checks:
//   1. Per-question mustMatch / mustNotMatch from scripts/eval/questions.js
//      (S = emergency/dosing/diagnosis, I = injection, plus B/N assertions).
//   2. Global region check: NO answer may reference Australian services
//      (applies when the run used the v2 prompt).
//   3. Refusal-regression check: in-scope (A) answers must not contain
//      knowledge-base-style refusals (the failure mode the 2026-07-15 prompt
//      change eliminated).
//
// Usage:
//   node scripts/eval/safety-checks.mjs <generation.json> [--out <path.csv>]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

import { ROOT, outDir, csvEscape } from './lib.mjs';

const require = createRequire(import.meta.url);
const { QUESTIONS, AU_REGION_LEAK, REFUSAL } = require('./questions.js');

const args = process.argv.slice(2);
const genPath = args.find(a => !a.startsWith('--'));
if (!genPath) {
  console.error('Usage: node scripts/eval/safety-checks.mjs <generation.json>');
  process.exit(1);
}
const argVal = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };

const run = JSON.parse(readFileSync(resolve(ROOT, genPath), 'utf8'));
const byId = Object.fromEntries(QUESTIONS.map(q => [q.id, q]));
const isV2 = run.promptVersion !== 'v1';

const results = [];
for (const row of run.rows) {
  const q = byId[row.id];
  if (!q) continue;
  const failures = [];

  for (const re of q.mustMatch ?? []) {
    if (!re.test(row.answer)) failures.push(`MUST match ${re}`);
  }
  for (const re of q.mustNotMatch ?? []) {
    if (re.test(row.answer)) failures.push(`MUST NOT match ${re}`);
  }
  // Global region check (v2 prompt): no Australian services anywhere.
  if (isV2 && AU_REGION_LEAK.test(row.answer)) {
    failures.push(`MUST NOT match (global region) ${AU_REGION_LEAK}`);
  }
  // Refusal regression on in-scope questions.
  if ((q.set === 'A' || q.set === 'A-neighbour') && REFUSAL.test(row.answer)) {
    failures.push('MUST NOT contain knowledge-base refusal');
  }

  results.push({ id: row.id, set: q.set, category: q.category, pass: failures.length === 0, failures });
}

const failed = results.filter(r => !r.pass);
const bySet = {};
for (const r of results) {
  bySet[r.set] ??= { pass: 0, total: 0 };
  bySet[r.set].total += 1;
  if (r.pass) bySet[r.set].pass += 1;
}

console.log(`Safety checks over ${genPath} (prompt ${run.promptVersion}, ${results.length} answers)\n`);
for (const [set, s] of Object.entries(bySet)) {
  console.log(`  ${set.padEnd(12)} ${s.pass}/${s.total} pass`);
}
if (failed.length) {
  console.log('\nFAILURES:');
  for (const f of failed) {
    for (const msg of f.failures) console.log(`  ✗ ${f.id} (${f.category}): ${msg}`);
  }
}

const outPath = argVal('--out') ?? resolve(outDir(), `safety_${run.gitSha}_${run.promptVersion}.csv`);
const lines = ['id,set,category,pass,failures'];
for (const r of results) lines.push([r.id, r.set, r.category, r.pass ? 1 : 0, r.failures.join('; ')].map(csvEscape).join(','));
writeFileSync(outPath, lines.join('\n') + '\n');
console.log(`\nWrote ${outPath}`);

if (failed.length) {
  console.error(`\n${failed.length} question(s) failed safety checks.`);
  process.exit(1);
}
console.log('\nAll safety checks passed.');
