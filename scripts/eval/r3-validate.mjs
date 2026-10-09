#!/usr/bin/env node
// E2-R3 (docs/eval/evaluation-plan.md §18.5) — validate the file(s) an
// independent rater returns from the rating page, apply the pre-registered
// exclusion rules, pick the one sheet that is analysed, and split it.
//
// A returned file is the sheet in exactly the human-sheet_round1_R*.csv format
// (header + items 1–60, same columns and quoting), then a blank line, then
// `#about,<field>,<value>` rows holding the eligibility answers and timings.
// The sheet part is what agreement.mjs reads; the #about part is private and is
// never committed (it can hold the rater's optional job title).
//
//   node scripts/eval/r3-validate.mjs <file.csv | dir> [...]
//        [--sheet docs/report/eval/human/human-sheet_round1_R3.csv]  (the blank sheet; set/question/answer/n-a pattern)
//        [--md docs/report/eval/human/human-sheet_round1_R3.md]      (instrument hash)
//        [--min-minutes 30] [--deadline 2026-10-16T23:59:59+13:00]
//        [--received <ISO date>]            (default: each file's modification time)
//        [--write-sheet <path>] [--write-about <path>]   (for the picked file)
//
// Exit 0 when a file is picked, 1 when every file is excluded, 2 on usage errors.
// Rules (fixed in §18.5 before any rating): incomplete or altered sheet,
// criteria not met, under 30 summed on-screen minutes, received after the
// deadline → excluded. Same code twice → the latest finish time. Several
// eligible raters → the first received.
import { readFileSync, writeFileSync, statSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join, isAbsolute, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const { parseCsv, toCsv } = require('./lib/csv.js');

const PAGE_VERSION = 'r3-rating-1.0';
const DIMS = ['groundedness', 'correctness', 'helpfulness', 'tone', 'safety'];
const COLUMNS = ['item', 'set', 'question', 'answer', ...DIMS, 'notes'];
const YES_FIELDS = ['works_in_health_care', 'not_involved_in_building_or_evaluating', 'not_seen_answers_before', 'not_in_usability_study', 'consent'];

const args = process.argv.slice(2);
const VALUE_FLAGS = new Set(['--sheet', '--md', '--min-minutes', '--deadline', '--received', '--write-sheet', '--write-about']);
const argVal = (n, d = null) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1]; };
const abs = (p) => (isAbsolute(p) ? p : resolve(process.cwd(), p));
const inputs = args.filter((a, i) => !a.startsWith('--') && !VALUE_FLAGS.has(args[i - 1]));
if (!inputs.length) { console.error('usage: r3-validate.mjs <file.csv | dir> [...] [--write-sheet <path>] [--write-about <path>]'); process.exit(2); }

const SHEET = abs(argVal('--sheet', resolve(ROOT, 'docs/report/eval/human/human-sheet_round1_R3.csv')));
const MD = abs(argVal('--md', resolve(ROOT, 'docs/report/eval/human/human-sheet_round1_R3.md')));
const MIN_MINUTES = Number(argVal('--min-minutes', 30));
const DEADLINE = new Date(argVal('--deadline', '2026-10-16T23:59:59+13:00'));
const RECEIVED = argVal('--received');

const blank = parseCsv(readFileSync(SHEET, 'utf8'));
const instrumentSha = createHash('sha256').update(readFileSync(MD, 'utf8')).digest('hex');

const files = inputs.flatMap((p) => {
  const a = abs(p);
  return statSync(a).isDirectory() ? readdirSync(a).filter((f) => f.endsWith('.csv')).sort().map((f) => join(a, f)) : [a];
});
if (!files.length) { console.error('no CSV files found'); process.exit(1); }

function validate(file) {
  const reasons = [];
  // CRLF can appear if the file passed through an email client or Windows;
  // line endings are transport, not content, so they are normalised first.
  const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const firstLine = text.slice(0, text.indexOf('\n'));
  if (firstLine !== COLUMNS.join(',')) return { file, reasons: [`header is not the sheet header: ${firstLine.slice(0, 80)}`] };
  const rows = parseCsv(text);
  const sheetRows = rows.filter((r) => r.item !== '#about');
  const aboutRows = rows.filter((r) => r.item === '#about');
  const about = Object.fromEntries(aboutRows.filter((r) => r.set !== 'field').map((r) => [r.set, r.question]));

  // Exact format: the sheet part re-serialises to the file's own first bytes,
  // and nothing but the #about block follows it.
  const sheetText = toCsv(sheetRows.map((r) => Object.fromEntries(COLUMNS.map((c) => [c, r[c]]))), COLUMNS);
  if (!text.startsWith(sheetText)) reasons.push('the sheet part is not in the exact sheet format');
  else if (!/^\n#about,field,value\n/.test(text.slice(sheetText.length))) reasons.push('unexpected content after the sheet part');

  // Incomplete or altered sheet.
  if (sheetRows.length !== blank.length) reasons.push(`${sheetRows.length} items, expected ${blank.length}`);
  let missing = 0, filled = 0;
  blank.forEach((b, i) => {
    const r = sheetRows[i];
    if (!r) return;
    for (const c of ['item', 'set', 'question', 'answer']) if (r[c] !== b[c]) reasons.push(`item ${b.item}: ${c} differs from the R3 sheet`);
    for (const d of DIMS) {
      if (b[d] === 'n/a') { if (r[d] !== 'n/a') reasons.push(`item ${b.item}: ${d} is n/a but carries "${r[d]}"`); continue; }
      if (r[d] === '') { missing++; continue; }
      if (!['0', '1', '2'].includes(r[d])) reasons.push(`item ${b.item}: ${d}="${r[d]}" is not 0, 1 or 2`);
      else filled++;
    }
  });
  const expected = blank.reduce((a, b) => a + DIMS.filter((d) => b[d] !== 'n/a').length, 0);
  if (missing) reasons.push(`${missing} of ${expected} judgements missing`);
  if (about.page_version !== PAGE_VERSION) reasons.push(`page version "${about.page_version}" is not ${PAGE_VERSION}`);
  if (about.instrument_sha256 !== instrumentSha) reasons.push('instrument hash does not match human-sheet_round1_R3.md');

  // Criteria not met.
  for (const f of YES_FIELDS) if (about[f] !== 'yes') reasons.push(`eligibility: ${f} is "${about[f] ?? ''}", not yes`);

  // Not read.
  const minutes = Number(about.on_screen_minutes);
  if (!(minutes >= MIN_MINUTES)) reasons.push(`on-screen time ${about.on_screen_minutes ?? '?'} min is under ${MIN_MINUTES} min`);

  // Deadline (received = file modification time unless given).
  const received = RECEIVED ? new Date(RECEIVED) : statSync(file).mtime;
  if (received > DEADLINE) reasons.push(`received ${received.toISOString()} after the deadline ${DEADLINE.toISOString()}`);

  return { file, code: about.code ?? '', finishedAt: about.finished_at ?? '', received, minutes, filled, expected, sheetText, aboutRows, about, reasons };
}

const results = files.map(validate);
// Same code twice → latest finish time among that code's eligible files.
const eligible = results.filter((r) => !r.reasons.length);
const byCode = new Map();
for (const r of eligible) { const prev = byCode.get(r.code); if (!prev || r.finishedAt > prev.finishedAt) byCode.set(r.code, r); }
for (const r of eligible) if (byCode.get(r.code) !== r) r.superseded = true;
// Several eligible raters → the first received.
const candidates = [...byCode.values()].sort((a, b) => a.received - b.received);
const picked = candidates[0] ?? null;

console.log('| file | code | finished | received | on-screen min | judgements | status |');
console.log('|---|---|---|---|---|---|---|');
for (const r of results) {
  const status = r.reasons.length ? `**excluded**: ${r.reasons.slice(0, 3).join('; ')}${r.reasons.length > 3 ? ` (+${r.reasons.length - 3} more)` : ''}`
    : r === picked ? '**picked (R3)**' : r.superseded ? 'eligible; superseded by a later file with the same code' : 'eligible; not used (a sheet was received earlier)';
  console.log(`| ${basename(r.file)} | ${r.code ?? ''} | ${r.finishedAt ?? ''} | ${r.received ? r.received.toISOString() : ''} | ${Number.isFinite(r.minutes) ? r.minutes : ''} | ${r.filled ?? ''}/${r.expected ?? ''} | ${status} |`);
}
if (!picked) { console.log('\nNo eligible sheet. E2-R3 is reported as excluded/not run, with the reasons above.'); process.exit(1); }

if (argVal('--write-sheet')) {
  const out = abs(argVal('--write-sheet'));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, picked.sheetText);
  console.log(`\nWrote the sheet part (${picked.filled} judgements) → ${out}`);
}
if (argVal('--write-about')) {
  const out = abs(argVal('--write-about'));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, toCsv(picked.aboutRows.filter((r) => r.set !== 'field').map((r) => ({ field: r.set, value: r.question })), ['field', 'value']));
  console.log(`Wrote the private #about block → ${out}  (never commit this file)`);
}
