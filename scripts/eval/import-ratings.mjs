#!/usr/bin/env node
// Fill a blinded human rating sheet from rating documents exported out of the
// rating-bench artifact (one JSON file per item, as written by the page).
//
//   node scripts/eval/import-ratings.mjs --pull <dir> --sheet docs/report/eval/human/human-sheet_round1_R1.csv --rater R1
//   node scripts/eval/import-ratings.mjs ... --dry-run      # validate only, write nothing
//
// Applicability (which dimensions a given item is scored on) always comes from
// the SHEET, never from the exported documents: the sheet is the instrument and
// the export is just the recording surface. A document that carries a score for
// a dimension the sheet marks n/a is an error, not something to merge in.
//
// Refuses to write a partially-filled sheet unless --allow-partial is given, so
// an interrupted rating session cannot silently become "the human ratings".
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';

import { ROOT } from './lib.mjs';

const require = createRequire(import.meta.url);
const { parseCsv, toCsv } = require('./lib/csv.js');

const args = process.argv.slice(2);
const argVal = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };
const PULL = argVal('--pull');
const SHEET = argVal('--sheet');
const RATER = argVal('--rater');
const DRY = args.includes('--dry-run');
const ALLOW_PARTIAL = args.includes('--allow-partial');

if (!PULL || !SHEET || !RATER) {
  console.error('usage: import-ratings.mjs --pull <dir> --sheet <csv> --rater <id> [--dry-run] [--allow-partial]');
  process.exit(2);
}

const DIMS = ['groundedness', 'correctness', 'helpfulness', 'tone', 'safety'];

// --- read the exported documents -------------------------------------------
const dir = resolve(ROOT, PULL);
const docs = new Map();
for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const raw = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const d = raw.data ?? raw;           // tolerate the {id,data,version} envelope
  if (d.rater !== RATER) continue;
  docs.set(Number(d.item), d);
}

// --- fill, validating against the sheet ------------------------------------
const rows = parseCsv(readFileSync(resolve(ROOT, SHEET), 'utf8'));
const columns = Object.keys(rows[0]);
const problems = [];
let filled = 0, missing = 0;
const stamps = [];

for (const r of rows) {
  const n = Number(r.item);
  const doc = docs.get(n);
  if (!doc) { problems.push(`item ${n}: no exported document`); missing += DIMS.filter(d => r[d] !== 'n/a').length; continue; }
  if (doc.updatedAt) stamps.push(doc.updatedAt);
  const scores = doc.scores ?? {};
  for (const d of DIMS) {
    if (r[d] === 'n/a') {
      if (scores[d] != null) problems.push(`item ${n}: scored ${d}=${scores[d]} but the sheet marks it n/a`);
      continue;
    }
    const v = scores[d];
    if (v == null) { missing++; continue; }
    if (![0, 1, 2].includes(v)) { problems.push(`item ${n}: ${d}=${JSON.stringify(v)} is not 0, 1 or 2`); continue; }
    r[d] = String(v);
    filled++;
  }
  r.notes = (doc.notes ?? '').trim();
}

const expected = rows.reduce((a, r) => a + DIMS.filter(d => r[d] !== 'n/a').length, 0);

console.log(`rater ${RATER}: ${docs.size} documents, ${filled}/${expected} judgements filled, ${missing} missing`);
if (stamps.length) {
  const s = stamps.slice().sort();
  console.log(`recorded between ${s[0]} and ${s[s.length - 1]}`);
}
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems.slice(0, 25)) console.error('  ' + p);
  process.exit(1);
}
if (missing && !ALLOW_PARTIAL) {
  console.error(`\n${missing} judgement(s) missing — refusing to write a partial sheet (pass --allow-partial to override).`);
  process.exit(1);
}
if (DRY) { console.log('\n--dry-run: nothing written.'); process.exit(0); }

writeFileSync(resolve(ROOT, SHEET), toCsv(rows, columns));
console.log(`\nWrote ${SHEET}`);
