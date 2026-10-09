#!/usr/bin/env node
// E2-R3 (docs/eval/evaluation-plan.md §18.5) — the pre-registered verdicts.
//
// Reads the κ tables that agreement.mjs wrote (so every κ quoted here is the
// number in an agreement_*.md file), computes the descriptive A3 counts from
// the sheets and the judge CSVs, and writes the summary with the C1–C5 and
// X1–X7 verdicts exactly as §18.5 defines them. Nothing here is split by
// condition: the KEY is used only to find each item's judge rows, and every
// count is pooled over the 60 items.
//
//   node scripts/eval/r3-summarise.mjs [--about <private #about csv>]
//        [--out docs/report/eval/final/e2-r3_independent-rater.md]
//        [--r3 docs/report/eval/human/human-sheet_round1_R3.csv] [--agreement-dir docs/report/eval/final]
//   (the last two only to dry-run the tooling on a dummy sheet outside the repo)
//
// The #about file (kept outside the repo) is read only for the page version,
// dates, on-screen minutes and number of sittings. The job title and the code
// are never written to the summary.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const { parseCsv } = require('./lib/csv.js');

const DIMS = ['groundedness', 'correctness', 'helpfulness', 'tone', 'safety'];
const GATE = 0.6, DEGENERATE = 0.95, C4_CUT = 1.64;
const PREREG = '327cbeb';
const args = process.argv.slice(2);
const argVal = (n, d = null) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1]; };
const abs = (p) => (isAbsolute(p) ? p : resolve(ROOT, p));
const H = 'docs/report/eval/human', F = 'docs/report/eval/final';
const OUT = abs(argVal('--out', `${F}/e2-r3_independent-rater.md`));
const R3_SHEET = argVal('--r3', `${H}/human-sheet_round1_R3.csv`);
const ADIR = argVal('--agreement-dir', F);
const read = (p) => readFileSync(abs(p), 'utf8');

// ── inputs ───────────────────────────────────────────────────────────────────
const sheet = (p) => { const m = {}; for (const r of parseCsv(read(p))) for (const d of DIMS) if (r[d] !== 'n/a' && r[d] !== '') (m[d] ??= {})[r.item] = Number(r[d]); return m; };
const S = { R1: sheet(`${H}/human-sheet_round1_R1.csv`), R2: sheet(`${H}/human-sheet_round1_R2.csv`), R1p1: sheet(`${H}/human-sheet_round1_R1_pass1.csv`), R3: sheet(R3_SHEET) };
const key = parseCsv(read(`${H}/human-sheet_round1_KEY.csv`));
const judgeFiles = {
  'gpt-4o-mini': ['p0', 'v1', 'v2', 'v2-nosafety', 'v2_none', 'v2_oracle'].map((c) => `docs/report/eval/judge_gpt-4o-mini_${c}_final.csv`),
  'claude-sonnet-5-5': readdirSync(abs(F)).filter((f) => /^judge_claude-sonnet-5-5_.*_key60\.csv$/.test(f)).sort().map((f) => `${F}/${f}`),
};
// judge scores re-keyed by sheet item (pooled; the KEY's other columns are dropped here)
const judgeByItem = (files) => {
  const j = new Map();
  for (const f of files) for (const r of parseCsv(read(f))) j.set(`${r.column}|${r.id}|${r.sample}|${r.dimension}`, r.score === '' ? null : Number(r.score));
  const m = {};
  for (const k of key) for (const d of DIMS) { const v = j.get(`${k.column}|${k.id}|${k.sample}|${d}`); if (v != null && !Number.isNaN(v)) (m[d] ??= {})[k.item] = v; }
  return m;
};
const J = Object.fromEntries(Object.entries(judgeFiles).map(([name, files]) => [name, judgeByItem(files)]));

const agreementTable = (file, dir = ADIR) => {
  const t = {};
  for (const line of read(`${dir}/${file}`).split('\n')) {
    const m = line.match(/^\| (\w+) \| (\d+) \| ([\d.]+)% \| (\S+) \| (\S+) \| (\S+) \|$/);
    if (m && DIMS.includes(m[1])) { const n = (x) => (x === '—' ? null : Number(x)); t[m[1]] = { n: Number(m[2]), pct: Number(m[3]), k: n(m[4]), kl: n(m[5]), kq: n(m[6]) }; }
  }
  return t;
};
const A = {
  R1R3: agreementTable('agreement_human_R1_vs_R3.md'),
  R2R3: agreementTable('agreement_human_R2_vs_R3.md'),
  R1p1R3: agreementTable('agreement_human_R1pass1_vs_R3.md'),
  R1R2: agreementTable('agreement_human_R1_vs_R2.md', F),
  mini: agreementTable('agreement_human-R3_vs_gpt-4o-mini.md'),
  claude: agreementTable('agreement_human-R3_vs_claude-sonnet-5-5.md'),
};

// ── descriptive helpers ──────────────────────────────────────────────────────
const counts = (m, items) => { const c = [0, 0, 0]; for (const it of items) if (m?.[it] != null) c[m[it]]++; return c; };
const degenerate = (c) => { const n = c[0] + c[1] + c[2]; return n > 0 && Math.max(...c) / n >= DEGENERATE; };
const paired = (a, b, d) => Object.keys(a[d] ?? {}).filter((it) => b[d]?.[it] != null);
const assessable = (a, b, d) => { const its = paired(a, b, d); return !degenerate(counts(a[d], its)) && !degenerate(counts(b[d], its)); };
const allScores = (m) => DIMS.flatMap((d) => Object.values(m[d] ?? {}));
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const f3 = (x) => (x == null ? '—' : x.toFixed(3));
const fmtC = (c) => `${c[0]} / ${c[1]} / ${c[2]}`;

const n3 = allScores(S.R3).length;
if (n3 !== 199) { console.error(`R3 sheet has ${n3} scores, expected 199 — validate it first`); process.exit(1); }
const means = Object.fromEntries(Object.entries(S).map(([k, m]) => [k, mean(allScores(m))]));
means.claude = mean(DIMS.flatMap((d) => paired(S.R3, J['claude-sonnet-5-5'], d).map((it) => J['claude-sonnet-5-5'][d][it])));

// ── verdicts (§18.5) ─────────────────────────────────────────────────────────
const C1 = {}, C2 = {}, C3 = {}, C5dims = {};
for (const d of DIMS) {
  const ok1 = assessable(S.R1, S.R3, d), ok2 = assessable(S.R2, S.R3, d);
  const k1 = A.R1R3[d]?.k, k2 = A.R2R3[d]?.k;
  C1[d] = !(ok1 && ok2) ? 'not assessable' : k1 >= GATE && k2 >= GATE ? 'holds' : k1 < GATE && k2 < GATE ? 'does not hold' : 'mixed';
  // C2: a judge comparison that is not assessable counts as below 0.6 (§18.5 clarification).
  const judgeAgrees = ['gpt-4o-mini', 'claude-sonnet-5-5'].some((j) => assessable(S.R3, J[j], d) && (j === 'gpt-4o-mini' ? A.mini : A.claude)[d]?.k >= GATE);
  C2[d] = judgeAgrees ? 'does not hold' : C1[d] === 'holds' ? 'holds' : C1[d] === 'not assessable' ? 'not assessable' : 'not supported';
  const cl = J['claude-sonnet-5-5'][d] ?? {};
  let below = 0, above = 0;
  for (const it of paired(S.R3, J['claude-sonnet-5-5'], d)) { if (cl[it] < S.R3[d][it]) below++; else if (cl[it] > S.R3[d][it]) above++; }
  C3[d] = { below, above, verdict: below > above ? 'holds' : 'does not hold' };
  const okp2 = assessable(S.R1, S.R3, d), okp1 = assessable(S.R1p1, S.R3, d);
  C5dims[d] = okp2 && okp1 && A.R1R3[d]?.k != null && A.R1p1R3[d]?.k != null && A.R1R3[d].k > A.R1p1R3[d].k;
}
const C3all = DIMS.every((d) => C3[d].verdict === 'holds');
const C4 = means.R3 >= C4_CUT ? 'holds' : 'does not hold';
const C5n = DIMS.filter((d) => C5dims[d]).length;
const C5 = C5n >= 4 ? 'holds' : 'does not hold';

const four = ['groundedness', 'helpfulness', 'tone', 'safety'];
const X = [
  ['X1', 'R3\'s overall mean is below both R1\'s and R2\'s', means.R3 < means.R1 && means.R3 < means.R2, `R3 ${means.R3.toFixed(2)}; R1 ${means.R1.toFixed(2)}, R2 ${means.R2.toFixed(2)}`],
  ['X2', 'on ≥ 3 of groundedness, helpfulness, tone, safety, R3\'s κ against both R1 and R2 is below the R1–R2 κ', four.filter((d) => A.R1R3[d]?.k != null && A.R2R3[d]?.k != null && A.R1R3[d].k < A.R1R2[d].k && A.R2R3[d].k < A.R1R2[d].k).length >= 3,
    `${four.filter((d) => A.R1R3[d]?.k != null && A.R2R3[d]?.k != null && A.R1R3[d].k < A.R1R2[d].k && A.R2R3[d].k < A.R1R2[d].k).length} of 4`],
  ['X3', 'C1 holds on helpfulness', C1.helpfulness === 'holds', `C1 helpfulness: ${C1.helpfulness}`],
  ['X4', 'neither judge reaches κ 0.6 against R3 on any dimension', DIMS.every((d) => !(A.mini[d]?.k >= GATE) && !(A.claude[d]?.k >= GATE)), `max κ: gpt-4o-mini ${f3(Math.max(...DIMS.map((d) => A.mini[d]?.k ?? -Infinity)))}, claude-sonnet-5-5 ${f3(Math.max(...DIMS.map((d) => A.claude[d]?.k ?? -Infinity)))}`],
  ['X5', 'C3 holds on at least 4 of the 5 dimensions', DIMS.filter((d) => C3[d].verdict === 'holds').length >= 4, `${DIMS.filter((d) => C3[d].verdict === 'holds').length} of 5`],
  ['X6', 'C5 holds', C5 === 'holds', `${C5n} of 5 dimensions`],
  ['X7', 'R3 gives 2 to at least 18 of the 20 correctness items', counts(S.R3.correctness, Object.keys(S.R3.correctness ?? {}))[2] >= 18, `${counts(S.R3.correctness, Object.keys(S.R3.correctness ?? {}))[2]} of ${Object.keys(S.R3.correctness ?? {}).length}`],
];

// ── provenance ───────────────────────────────────────────────────────────────
let about = {};
if (argVal('--about')) for (const r of parseCsv(readFileSync(abs(argVal('--about')), 'utf8'))) about[r.field] = r.value;
let sha = 'unknown';
try { sha = execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* not a git checkout */ }

// ── write ────────────────────────────────────────────────────────────────────
const md = [];
md.push('# E2-R3 — independent health-care rater (plan §18.5)', '');
md.push(`Pre-specification: \`docs/eval/evaluation-plan.md\` §18.5, committed and pushed as \`${PREREG}\` before the rating link was shared. Summary written by \`scripts/eval/r3-summarise.mjs\` at \`${sha}\` on ${new Date().toISOString().slice(0, 10)}.`, '');
md.push('R3 is **a health-care worker independent of the project**. No name, workplace or job title is recorded here.', '');
md.push('| Item | Value |', '|---|---|');
md.push('| Items | the 60 round-1 items, same order and rubric wording (2026-09-13) as R1 and R2; 199 judgements |');
md.push(`| Sheet | \`${H}/human-sheet_round1_R3.csv\`, validated by \`r3-validate.mjs\` (complete, eligible, ≥ 30 on-screen minutes) |`);
if (about.page_version) md.push(`| Page | \`${about.page_version}\`; rated ${String(about.started_at).slice(0, 10)} to ${String(about.finished_at).slice(0, 10)}, ${about.sittings} sitting(s), ${about.on_screen_minutes} on-screen minutes |`);
md.push('| Regenerate | `analyse-r3.sh` (author\'s folder), or the five `agreement.mjs` calls listed in §18.5, then `node scripts/eval/r3-summarise.mjs` |', '');

md.push('## A1 — R3 against R1 and R2 (primary)', '', 'Unweighted Cohen\'s κ, categories {0,1,2}; tables with linear and quadratic κ in `agreement_human_R1_vs_R3.md` and `agreement_human_R2_vs_R3.md`. "n.a." marks a comparison that is not assessable (one side gives one value on ≥ 95 % of the items).', '');
md.push('| Dimension | n | κ R3–R1 | κ R3–R2 | κ R1–R2 (for reference) | % agreement R3–R1 / R3–R2 |', '|---|---:|---:|---:|---:|---|');
for (const d of DIMS) md.push(`| ${d} | ${A.R1R3[d]?.n ?? '—'} | ${f3(A.R1R3[d]?.k)}${assessable(S.R1, S.R3, d) ? '' : ' (n.a.)'} | ${f3(A.R2R3[d]?.k)}${assessable(S.R2, S.R3, d) ? '' : ' (n.a.)'} | ${f3(A.R1R2[d]?.k)} | ${A.R1R3[d]?.pct ?? '—'} % / ${A.R2R3[d]?.pct ?? '—'} % |`);
md.push('');

md.push('## A2 — judges against R3 (descriptive)', '', 'The κ ≥ 0.6 gate stays defined against R1 and R2 (§5, §18.2); these values cannot pass or fail it.', '');
md.push('| Dimension | κ gpt-4o-mini–R3 | κ claude-sonnet-5-5–R3 |', '|---|---:|---:|');
for (const d of DIMS) md.push(`| ${d} | ${f3(A.mini[d]?.k)}${assessable(S.R3, J['gpt-4o-mini'], d) ? '' : ' (n.a.)'} | ${f3(A.claude[d]?.k)}${assessable(S.R3, J['claude-sonnet-5-5'], d) ? '' : ' (n.a.)'} |`);
md.push('');

md.push('## A3 — score distributions (pooled over the 60 items, never split by condition)', '');
md.push('| Dimension | R3 0 / 1 / 2 | R1 0 / 1 / 2 | R2 0 / 1 / 2 | Claude 0 / 1 / 2 | Claude below R3 / above R3 |', '|---|---|---|---|---|---|');
for (const d of DIMS) {
  const its = Object.keys(S.R3[d] ?? {});
  md.push(`| ${d} (${its.length}) | ${fmtC(counts(S.R3[d], its))}${degenerate(counts(S.R3[d], its)) ? ' (one value ≥ 95 %)' : ''} | ${fmtC(counts(S.R1[d], its))} | ${fmtC(counts(S.R2[d], its))} | ${fmtC(counts(J['claude-sonnet-5-5'][d], its))} | ${C3[d].below} / ${C3[d].above} |`);
}
md.push('', `Overall means over the 199 judgements: R3 **${means.R3.toFixed(2)}**, R1 ${means.R1.toFixed(2)}, R2 ${means.R2.toFixed(2)}, Claude judge ${means.claude.toFixed(2)}.`, '');

md.push('## A4 — R3 against R1\'s set-aside first pass (descriptive)', '');
md.push('| Dimension | κ R3–R1 pass 2 (record) | κ R3–R1 pass 1 |', '|---|---:|---:|');
for (const d of DIMS) md.push(`| ${d} | ${f3(A.R1R3[d]?.k)} | ${f3(A.R1p1R3[d]?.k)} |`);
md.push('');

md.push('## Conclusions re-checked (C1–C5, as §18.5 defines "holds")', '');
md.push('| Dimension | C1 human instrument | C2 failure is the judges\' | C3 Claude stricter |', '|---|---|---|---|');
for (const d of DIMS) md.push(`| ${d} | ${C1[d]} | ${C2[d]} | ${C3[d].verdict} (${C3[d].below} below / ${C3[d].above} above) |`);
md.push('');
md.push(`- **C3 overall** ("stricter than the raters on every dimension"): **${C3all ? 'holds' : 'does not hold'}**${C3all ? '' : ` — not on ${DIMS.filter((d) => C3[d].verdict !== 'holds').join(', ')}`}.`);
md.push(`- **C4** (human scores near the ceiling): **${C4}** — R3 mean ${means.R3.toFixed(2)} against the cut of ${C4_CUT}.`);
md.push(`- **C5** (R1's second pass is the record): **${C5}** — κ(R3, pass 2) > κ(R3, pass 1) on ${C5n} of 5 dimensions (${DIMS.filter((d) => C5dims[d]).join(', ') || 'none'}); a dimension that is not assessable counts against.`, '');
md.push('Per §18.5, a conclusion the results state for "every dimension" is restated in the report for the dimensions where it holds above, and not kept where it does not.', '');

md.push('## Expectations (X1–X7)', '', '| # | Expectation | Result | Verdict |', '|---|---|---|---|');
for (const [id, text, ok, detail] of X) md.push(`| ${id} | ${text} | ${detail} | **${ok ? 'supported' : 'not supported'}** |`);
md.push('');
writeFileSync(OUT, md.join('\n'));
console.log(`Wrote ${OUT}`);
console.log(`C1 ${DIMS.map((d) => `${d}: ${C1[d]}`).join('; ')}`);
console.log(`C2 ${DIMS.map((d) => `${d}: ${C2[d]}`).join('; ')}`);
console.log(`C3 ${C3all ? 'holds' : 'does not hold'}; C4 ${C4}; C5 ${C5}`);
