#!/usr/bin/env node
// E2-R3 rating page (docs/eval/evaluation-plan.md §18.5) — build the static
// page an independent health-care rater uses to score the round-1 items.
//
// Input is the R3 sheet ONLY: human-sheet_round1_R3.{md,csv}, written by
// human-sheet.mjs at 0615b79 (the commit that wrote R1's and R2's sheets).
// The KEY and the generation files are never read, so no condition id,
// prompt version or file name can reach the page. Before writing anything the
// build proves three things and stops if any fails:
//
//   1. the parse is lossless: re-rendering the parsed items and rubric with
//      human-sheet.mjs's own Markdown template reproduces the sheet byte for byte;
//   2. the sheet is R1's sheet: the Markdown is identical to --compare-md
//      (R1's) apart from the rater label on line 1;
//   3. the CSV matches the Markdown: same items, questions, answers, and an n/a
//      pattern that equals each item's listed dimensions.
//
// After writing, it scans the page for condition ids, file names and the word
// KEY (`--check <file>` runs the same scan on any file, e.g. the live page).
//
//   node scripts/eval/r3-make-page.mjs --out <dir>
//        [--sheet docs/report/eval/human/human-sheet_round1_R3]   (no extension)
//        [--compare-md docs/report/eval/human/human-sheet_round1_R1.md]
//   node scripts/eval/r3-make-page.mjs --check <built index.html>
//
// <dir> receives index.html (data inline: one file, no other requests) and
// vercel.json (X-Robots-Tag noindex). It must be outside the repo or git-ignored.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const { parseCsv } = require('./lib/csv.js');

export const PAGE_VERSION = 'r3-rating-1.0';
const DIMS = ['groundedness', 'correctness', 'helpfulness', 'tone', 'safety'];
const COLUMNS = ['item', 'set', 'question', 'answer', ...DIMS, 'notes'];
const NO_PASSAGES = '(none — the assistant answered without passages)';
const PASSAGES_OPEN = '<details><summary>Passages the assistant was given</summary>';
const REFERENCE_OPEN = '<details><summary>Reference material (human-labelled correct guidance)</summary>';

const args = process.argv.slice(2);
const argVal = (n, d = null) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1]; };
const abs = (p) => (isAbsolute(p) ? p : resolve(process.cwd(), p));
const fail = (msg) => { console.error(`r3-make-page: ${msg}`); process.exit(1); };

// ── Leak scan ────────────────────────────────────────────────────────────────
// Condition ids as the KEY spells them (p0:final, v2:none:final, …), as file
// names spell them (v2_none, v2-nosafety), the generation sha and file stem,
// and the word KEY. Word-bounded, so "v2" inside an unrelated token is not hit.
export const FORBIDDEN = [
  /\bp0\b/i, /\bv1\b/i, /\bv2\b/i, /nosafety/i, /\bv2[:_-]?none\b/i, /:none\b/i, /_none\b/i,
  /\boracle\b/i, /:final\b/i, /_final\b/i, /\bgeneration_/i, /8a92ecd/i, /\bKEY\b/, /\bx3\b/i, /KEY/,
  /prompt[ _-]?version/i, /human-sheet/i, /\.json\b/i,
];
// Words the page's own text must not use (they are fine inside an answer or
// passage, where "condition" is ordinary health vocabulary).
const TEMPLATE_ONLY = [/\bcondition/i, /\bnone\b/i, /\bjudge/i];
export function scanForLeaks(text) {
  const hits = [];
  for (const re of FORBIDDEN) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    for (const m of text.matchAll(g)) hits.push({ pattern: String(re), at: m.index, context: text.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ') });
  }
  return hits;
}

if (args.includes('--check')) {
  const file = abs(argVal('--check'));
  const text = readFileSync(file, 'utf8');
  const hits = scanForLeaks(text);
  // JSON escapes such as "\none" (a newline, then "one") are not the word.
  const none = [...text.replace(/\\n/g, ' ').matchAll(/\bnone\b/gi)].length;
  console.log(`${file}: ${hits.length} forbidden-token hit(s); the bare word "none" occurs ${none} time(s)`);
  for (const h of hits.slice(0, 20)) console.log(`  ${h.pattern} … ${h.context}`);
  process.exit(hits.length ? 1 : 0);
}

// ── Parse the sheet ──────────────────────────────────────────────────────────
const SHEET = abs(argVal('--sheet', resolve(ROOT, 'docs/report/eval/human/human-sheet_round1_R3')));
const COMPARE_MD = abs(argVal('--compare-md', resolve(ROOT, 'docs/report/eval/human/human-sheet_round1_R1.md')));
const OUT = argVal('--out');
if (!OUT) fail('--out <dir> is required');

const md = readFileSync(`${SHEET}.md`, 'utf8');
const csvRows = parseCsv(readFileSync(`${SHEET}.csv`, 'utf8'));

function parsePassage(block) {
  const nl = block.indexOf('\n\n');
  if (!block.startsWith('**') || nl === -1) fail(`passage does not start with a bold title: ${block.slice(0, 60)}`);
  const head = block.slice(0, nl);
  const m = head.match(/^\*\*(.+?)\*\*(?: — (.+))?$/s);
  if (!m) fail(`unparseable passage title: ${head.slice(0, 80)}`);
  return { title: m[1], org: m[2] ?? null, content: block.slice(nl + 2) };
}
const renderPassage = (p) => `**${p.title}**${p.org ? ` — ${p.org}` : ''}\n\n${p.content}`;
// A passage boundary is the separator FOLLOWED by a bold title, so a horizontal
// rule inside a passage's own text cannot split it.
const splitPassages = (text) => text.split(/\n\n---\n\n(?=\*\*)/).map(parsePassage);

const [head, ...itemBlocks] = md.split(/^## Item (?=\d+\n)/m);
const headLines = head.split('\n');
const raterLine = headLines[0];
const instruction = headLines[2];
const rubricStart = head.indexOf('## Rubric\n\n');
const rubricEnd = head.lastIndexOf('---\n\n');
if (rubricStart === -1 || rubricEnd === -1) fail('rubric section not found');
const rubric = {};
for (const sec of head.slice(rubricStart + '## Rubric\n\n'.length, rubricEnd).split(/^### /m).filter(Boolean)) {
  const [label, ...rest] = sec.split('\n');
  const text = rest.join('\n').replace(/^\n/, '').replace(/\n\n$/, '');
  const id = DIMS.find((d) => text.startsWith(`${d.toUpperCase()} (`));
  if (!id) fail(`rubric section "${label}" matches no dimension`);
  const lines = text.split('\n');
  const levelAt = (k) => lines.findIndex((l) => l.startsWith(`${k} — `));
  const [i2, i1, i0] = [levelAt(2), levelAt(1), levelAt(0)];
  if (!(i2 > 0 && i1 > i2 && i0 > i1)) fail(`rubric "${label}": levels 2/1/0 not found in order`);
  rubric[id] = {
    label, text,
    head: lines.slice(0, i2).join('\n'),
    levels: { 2: lines.slice(i2, i1).join('\n').slice(4), 1: lines.slice(i1, i0).join('\n').slice(4), 0: lines[i0].slice(4) },
    tail: lines.slice(i0 + 1).join('\n'),
  };
  // the split must be lossless too
  const back = [rubric[id].head, `2 — ${rubric[id].levels[2]}`, `1 — ${rubric[id].levels[1]}`, `0 — ${rubric[id].levels[0]}`, ...(rubric[id].tail ? [rubric[id].tail] : [])].join('\n');
  if (back !== text) fail(`rubric "${label}" does not round-trip`);
}
if (Object.keys(rubric).join() !== DIMS.join()) fail(`rubric dimensions ${Object.keys(rubric).join()} ≠ ${DIMS.join()}`);

const items = itemBlocks.map((block) => {
  const m = block.match(/^(\d+)\n\n\*\*Dimensions:\*\* (.*)\n\n\*\*Question:\*\* (.*)\n\n/);
  if (!m) fail(`item block not recognised: ${block.slice(0, 80)}`);
  const item = Number(m[1]);
  const dims = m[2] === '(none)' ? [] : m[2].split(', ');
  let rest = block.slice(m[0].length);
  if (!rest.startsWith(`${PASSAGES_OPEN}\n\n`)) fail(`item ${item}: passages block missing`);
  rest = rest.slice(PASSAGES_OPEN.length + 2);
  const pEnd = rest.indexOf('\n\n</details>\n\n');
  const pText = rest.slice(0, pEnd);
  const passages = pText === NO_PASSAGES ? [] : splitPassages(pText);
  rest = rest.slice(pEnd + '\n\n</details>\n\n'.length);
  let reference = null;
  if (rest.startsWith(`${REFERENCE_OPEN}\n\n`)) {
    rest = rest.slice(REFERENCE_OPEN.length + 2);
    const rEnd = rest.indexOf('\n\n</details>\n\n');
    reference = splitPassages(rest.slice(0, rEnd));
    rest = rest.slice(rEnd + '\n\n</details>\n\n'.length);
  }
  if (!rest.startsWith('**Answer:**\n\n')) fail(`item ${item}: answer missing`);
  const quoted = rest.slice('**Answer:**\n\n'.length).replace(/\n+$/, '');
  const answer = quoted.split('\n').map((l) => (l.startsWith('> ') ? l.slice(2) : l === '>' ? '' : fail(`item ${item}: answer line not quoted`))).join('\n');
  return { item, dims, question: m[3], passages, reference, answer };
});

// ── Proof 1: lossless (human-sheet.mjs's template, verbatim) ─────────────────
const out = [raterLine, '', instruction, '', '## Rubric', ''];
for (const d of DIMS) out.push(`### ${rubric[d].label}`, '', rubric[d].text, '');
out.push('---', '');
for (const it of items) {
  out.push(`## Item ${it.item}`, '', `**Dimensions:** ${it.dims.join(', ') || '(none)'}`, '', `**Question:** ${it.question}`, '');
  out.push(PASSAGES_OPEN, '');
  out.push(it.passages.length ? it.passages.map(renderPassage).join('\n\n---\n\n') : NO_PASSAGES, '', '</details>', '');
  if (it.reference) out.push(REFERENCE_OPEN, '', it.reference.map(renderPassage).join('\n\n---\n\n'), '', '</details>', '');
  out.push('**Answer:**', '', it.answer.split('\n').map((l) => `> ${l}`).join('\n'), '');
}
if (`${out.join('\n')}\n` !== md) fail('parse is not lossless: re-rendered Markdown differs from the sheet');

// ── Proof 2: the same sheet R1 had ───────────────────────────────────────────
const cmp = readFileSync(COMPARE_MD, 'utf8');
const body = (t) => t.slice(t.indexOf('\n'));
if (body(cmp) !== body(md)) fail(`${relative(ROOT, COMPARE_MD)} differs from the sheet beyond line 1`);
if (!/^# Human rating sheet — round1 — rater R3$/.test(raterLine)) fail(`unexpected rater line: ${raterLine}`);

// ── Proof 3: CSV ↔ Markdown ──────────────────────────────────────────────────
if (csvRows.length !== items.length) fail(`CSV has ${csvRows.length} rows, Markdown ${items.length} items`);
if (Object.keys(csvRows[0]).join() !== COLUMNS.join()) fail(`CSV columns ${Object.keys(csvRows[0]).join()}`);
items.forEach((it, i) => {
  const r = csvRows[i];
  if (Number(r.item) !== it.item || it.item !== i + 1) fail(`item order differs at row ${i + 1}`);
  if (r.question !== it.question || r.answer !== it.answer) fail(`item ${it.item}: CSV question/answer differ from the Markdown`);
  const csvDims = DIMS.filter((d) => r[d] !== 'n/a');
  if (csvDims.join() !== it.dims.join()) fail(`item ${it.item}: CSV dimensions ${csvDims} ≠ Markdown ${it.dims}`);
  if (csvDims.some((d) => r[d] !== '') || r.notes !== '') fail(`item ${it.item}: the R3 sheet is not blank`);
  it.set = r.set;
});

// ── Page data (rater-facing content only) ────────────────────────────────────
const sha = (t) => createHash('sha256').update(t).digest('hex');
const data = {
  pageVersion: PAGE_VERSION,
  instrumentSha256: sha(md),
  instruction: 'Score each item on every aspect shown, using ONLY the rubric (0, 1 or 2). Citation markers such as [1]/[S2] and "Sources:" lists should be ignored for every aspect except groundedness.',
  columns: COLUMNS,
  dims: DIMS,
  rubric: Object.fromEntries(DIMS.map((d) => [d, { label: rubric[d].label, head: rubric[d].head, levels: rubric[d].levels, tail: rubric[d].tail }])),
  items: items.map((it) => ({ item: it.item, set: it.set, question: it.question, dims: it.dims, passages: it.passages, reference: it.reference, answer: it.answer })),
};
// The sheet's own instruction, minus the two sentences about its CSV and KEY
// files, which do not exist for a page rater. Asserted so a changed sheet fails.
if (instruction !== 'Score each item on every dimension that is not marked n/a, using ONLY the rubric below (0, 1 or 2). Record scores in the CSV of the same name. Do not open the KEY file. Citation markers such as [1]/[S2] and "Sources:" lists should be ignored for every dimension except groundedness.') fail('sheet instruction changed');

// Reading load, for the time estimate shown on the intro screen.
const words = (t) => (t.match(/\S+/g) ?? []).length;
const load = {
  items: items.length,
  judgements: items.reduce((a, it) => a + it.dims.length, 0),
  answerWords: items.reduce((a, it) => a + words(it.answer), 0),
  passageWords: items.reduce((a, it) => a + it.passages.reduce((b, p) => b + words(p.content), 0), 0),
  referenceWords: items.reduce((a, it) => a + (it.reference ?? []).reduce((b, p) => b + words(p.content), 0), 0),
};

// ── Write ────────────────────────────────────────────────────────────────────
const outDir = abs(OUT);
const rel = relative(ROOT, outDir);
if (!rel.startsWith('..') && !isAbsolute(rel)) {
  const ignored = spawnSync('git', ['-C', ROOT, 'check-ignore', '-q', outDir]).status === 0;
  if (!ignored) fail(`${rel} is inside the repo and not git-ignored`);
}
mkdirSync(outDir, { recursive: true });
const template = readFileSync(resolve(ROOT, 'scripts/eval/r3/rating.html'), 'utf8');
if (scanForLeaks(template).length) fail(`the template itself contains a forbidden token: ${JSON.stringify(scanForLeaks(template)[0])}`);
for (const re of TEMPLATE_ONLY) if (re.test(template)) fail(`the template uses ${re}`);
const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const marker = '<script type="application/json" id="r3-data">{}</script>';
if (!template.includes(marker)) fail('template data marker missing');
const html = template.replace(marker, () => `<script type="application/json" id="r3-data">${json}</script>`);
writeFileSync(resolve(outDir, 'index.html'), html);
writeFileSync(resolve(outDir, 'vercel.json'), `${JSON.stringify({ headers: [{ source: '/(.*)', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }] }, null, 2)}\n`);

const hits = scanForLeaks(html);
if (hits.length) fail(`forbidden token(s) in the built page:\n${hits.slice(0, 10).map((h) => `  ${h.pattern} … ${h.context}`).join('\n')}`);
const noneInData = data.items.flatMap((it) => [['question', it.question], ['answer', it.answer], ...[...it.passages, ...(it.reference ?? [])].map((p) => ['passage', `${p.title} ${p.content}`])]).filter(([, t]) => /\bnone\b/i.test(t)).map(([k]) => k);

console.log(`${items.length} items, ${load.judgements} judgements; parse lossless; Markdown = ${relative(ROOT, COMPARE_MD)} apart from line 1; CSV matches`);
console.log(`reading load: answers ${load.answerWords} words, passages ${load.passageWords}, reference ${load.referenceWords}`);
console.log(`leak scan: 0 forbidden tokens; "none" appears only inside item text (${noneInData.length ? noneInData.join(', ') : 'nowhere'})`);
console.log(`instrument sha256 ${data.instrumentSha256.slice(0, 16)}…  page ${PAGE_VERSION}`);
console.log(`Wrote ${resolve(outDir, 'index.html')} (${(html.length / 1024).toFixed(0)} KB) and vercel.json`);
