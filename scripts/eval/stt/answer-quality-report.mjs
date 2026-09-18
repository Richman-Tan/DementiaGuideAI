#!/usr/bin/env node
// E9 §2.5 — answer quality under dementia-speech ASR error.
//
// Pairs every perturbed variant (id "<sourceId>__<level>") with its clean
// source answer on the judge dimensions both were scored on, and runs the
// deterministic gates over the perturbed answers per level.
//
// Usage:
//   node scripts/eval/stt/answer-quality-report.mjs \
//     --perturbed-gen docs/report/eval/generation_8a92ecd_v2_perturbed.json \
//     --perturbed-judge docs/report/eval/judge_gpt-4o-mini_v2_perturbed.json \
//     --clean-judge docs/report/eval/judge_gpt-4o-mini_v2_final.json \
//     [--clean-judge-safety docs/report/eval/judge_gpt-4o-mini_v2_final_rubric20260914.json] \
//     [--questions-file scripts/eval/questions.perturbed.js] [--sha label] [--out-dir docs/report/eval/stt]
//
// Only aggregates and per-item scores are written; no answer text.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { wilcoxonSignedRank, wilson } = require(resolve(ROOT, 'scripts/eval/lib/stats.js'));
const { checkRow } = require(resolve(ROOT, 'scripts/eval/lib/checks.js'));
const { QUESTIONS } = require(resolve(ROOT, 'scripts/eval/questions.js'));
const { RUBRIC_VERSION } = require(resolve(ROOT, 'scripts/eval/judges/rubrics.js'));

const args = process.argv.slice(2);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const PGEN = argVal('--perturbed-gen');
const PJUDGE = argVal('--perturbed-judge');
const CJUDGE = argVal('--clean-judge');
const CJUDGE_SAFETY = argVal('--clean-judge-safety');
const QFILE = argVal('--questions-file') ?? 'scripts/eval/questions.perturbed.js';
const SHA = argVal('--sha') ?? 'unsha';
const OUT_DIR = resolve(ROOT, argVal('--out-dir') ?? 'docs/report/eval/stt');
if (!PGEN || !PJUDGE || !CJUDGE) { console.error('need --perturbed-gen, --perturbed-judge, --clean-judge'); process.exit(1); }

const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const pgen = readJson(PGEN);
const pjudge = readJson(PJUDGE);
const cjudge = readJson(CJUDGE);
const cjudgeSafety = CJUDGE_SAFETY ? readJson(CJUDGE_SAFETY) : null;
const pq = require(resolve(ROOT, QFILE));
const PERT = pq.PERTURBED_QUESTIONS ?? pq.QUESTIONS;
const byPid = Object.fromEntries(PERT.map(q => [q.id, q]));
const byCid = Object.fromEntries(QUESTIONS.map(q => [q.id, q]));

const LEVELS = ['disfluent', 'control', 'ad', 'ad150'];
const DIMS = ['correctness', 'groundedness', 'helpfulness', 'tone', 'safety'];

// Clean scores by source id and dimension. Safety comes from the rubric-matched
// file when given; the main clean file's safety column was scored under the
// older rubric wording and is not comparable.
const clean = {};
for (const r of cjudge.rows) {
  clean[r.id] = clean[r.id] ?? {};
  for (const [d, v] of Object.entries(r.scores ?? {})) if (d !== 'safety' && v?.score != null) clean[r.id][d] = v.score;
}
if (cjudgeSafety) for (const r of cjudgeSafety.rows) {
  clean[r.id] = clean[r.id] ?? {};
  if (r.scores?.safety?.score != null) clean[r.id].safety = r.scores.safety.score;
}
const pjRows = Object.fromEntries(pjudge.rows.map(r => [r.id, r]));
// The judge does not stamp the rubric version; the perturbed run was scored under the committed RUBRIC_VERSION at run time.
const perturbedRubric = pjudge.rubricVersion ?? RUBRIC_VERSION;

// ── Judge pairing ────────────────────────────────────────────────────────────
const pairs = []; // { level, sourceId, dim, clean, perturbed }
for (const r of pjudge.rows) {
  const q = byPid[r.id]; if (!q) continue;
  const src = clean[q.sourceId]; if (!src) continue;
  for (const [d, v] of Object.entries(r.scores ?? {})) {
    if (!DIMS.includes(d) || v?.score == null || src[d] == null) continue;
    if (d === 'safety' && !cjudgeSafety) continue;
    pairs.push({ level: q.level, sourceId: q.sourceId, dim: d, clean: src[d], perturbed: v.score });
  }
}
const fmt = (x, d = 2) => (x == null || Number.isNaN(x) ? '—' : x.toFixed(d));
const pct = (a, n) => (n ? `${(100 * a / n).toFixed(1)}%` : '—');

const judgeTable = [];
for (const level of LEVELS) for (const dim of DIMS) {
  const ps = pairs.filter(p => p.level === level && p.dim === dim);
  if (!ps.length) continue;
  const diffs = ps.map(p => p.perturbed - p.clean);
  const w = wilcoxonSignedRank(diffs);
  judgeTable.push({
    level, dim, n: ps.length,
    meanClean: ps.reduce((s, p) => s + p.clean, 0) / ps.length,
    meanPert: ps.reduce((s, p) => s + p.perturbed, 0) / ps.length,
    dropped: diffs.filter(d => d < 0).length, same: diffs.filter(d => d === 0).length, rose: diffs.filter(d => d > 0).length,
    p: w.p, r: w.rankBiserial, note: w.note ?? '',
  });
}

// ── Deterministic gates per level ────────────────────────────────────────────
let allowlist = null;
try { allowlist = readJson('scripts/eval/fixtures/phone-allowlist.json').numbers; } catch { /* optional */ }
const gateTable = [];
for (const level of LEVELS) {
  const rows = pgen.rows.filter(r => byPid[r.id]?.level === level);
  if (!rows.length) continue;
  const acc = { n: 0, pass: 0, refusal: 0, regionLeak: 0, foreignEmergency: 0, doseLeak: 0, promptLeak: 0, unknownPhones: 0, markers: 0, hallucinated: 0, empty: 0, words: 0 };
  for (const r of rows) {
    const q = byPid[r.id];
    // Gates are the source question's regexes (carried over by reference).
    const res = checkRow(q, r, { region: 'NZ', phoneAllowlist: allowlist });
    acc.n++; if (res.pass) acc.pass++;
    for (const k of ['refusal', 'regionLeak', 'foreignEmergency', 'doseLeak', 'promptLeak', 'empty']) if (res.flags[k]) acc[k]++;
    if ((res.flags.unknownPhones ?? []).length) acc.unknownPhones++;
    acc.markers += res.citedMarkers; acc.hallucinated += res.hallucinatedMarkers;
    acc.words += (r.answer ?? '').split(/\s+/).filter(Boolean).length;
  }
  gateTable.push({ level, ...acc });
}
// Clean baseline gates over the same 45 source items, from the clean generation file named in the clean judge header.
let cleanGates = null;
try {
  const cgen = readJson(cjudge.sourceFile.startsWith('docs/') ? cjudge.sourceFile : `docs/report/eval/${cjudge.sourceFile.split('/').pop()}`);
  const srcIds = new Set(PERT.map(q => q.sourceId));
  const rows = cgen.rows.filter(r => srcIds.has(r.id) && (r.sample ?? 0) === 0);
  const acc = { level: 'clean (source items)', n: 0, pass: 0, refusal: 0, regionLeak: 0, foreignEmergency: 0, doseLeak: 0, promptLeak: 0, unknownPhones: 0, markers: 0, hallucinated: 0, empty: 0, words: 0 };
  for (const r of rows) {
    const res = checkRow(byCid[r.id], r, { region: 'NZ', phoneAllowlist: allowlist });
    acc.n++; if (res.pass) acc.pass++;
    for (const k of ['refusal', 'regionLeak', 'foreignEmergency', 'doseLeak', 'promptLeak', 'empty']) if (res.flags[k]) acc[k]++;
    if ((res.flags.unknownPhones ?? []).length) acc.unknownPhones++;
    acc.markers += res.citedMarkers; acc.hallucinated += res.hallucinatedMarkers;
    acc.words += (r.answer ?? '').split(/\s+/).filter(Boolean).length;
  }
  cleanGates = acc;
} catch (e) { console.error(`clean gates skipped: ${e.message}`); }

// ── Output ───────────────────────────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });
const base = `answer-quality_under_asr-error_${SHA}`;
const csv = ['level,sourceId,dim,clean,perturbed,diff', ...pairs.map(p => `${p.level},${p.sourceId},${p.dim},${p.clean},${p.perturbed},${p.perturbed - p.clean}`)];
writeFileSync(resolve(OUT_DIR, `${base}.csv`), csv.join('\n') + '\n');

const L = [];
L.push(`# Answer quality under dementia-speech ASR error — snapshot ${SHA}`);
L.push('');
L.push(`Generated ${new Date().toISOString()} by \`scripts/eval/stt/answer-quality-report.mjs\`. Perturbed generation: \`${PGEN}\` (${pgen.rows.length} rows, model ${pgen.model}, temperature ${pgen.temperature}, seed ${pgen.seed}). Perturbed judge: \`${PJUDGE}\` (${pjudge.judgeModel}, rubric ${perturbedRubric}). Clean judge: \`${CJUDGE}\`${cjudgeSafety ? ` + \`${CJUDGE_SAFETY}\` (safety)` : ' (safety omitted: rubric versions differ)'}.`);
L.push('');
L.push('**Assumptions.** The perturbation is synthetic: substitution, deletion and insertion rates, confusion pairs and disfluency rates were measured on ADReSS-2020 dementia speakers (`error-profile_*.json`) and applied with a fixed seed to the development questions; no user produced these inputs and nothing here is a user result. Scores are from the gpt-4o-mini judge, which has a known ceiling effect on helpfulness and tone (κ ≈ 0 against two human raters on the matrix), so **correctness and the deterministic gates are the trustworthy columns**; helpfulness and tone are shown for completeness. Each variant is paired with the clean answer to its source question (same prompt, model, temperature and seed); Wilcoxon signed-rank over the paired differences with the matched-pairs rank-biserial as effect size; n < 10 flagged.');
L.push('');
L.push('## Judge scores, perturbed vs clean (paired by source question)');
L.push('');
L.push('| Level | Dimension | n | Mean clean | Mean perturbed | Dropped / same / rose | Wilcoxon p | rank-biserial r |');
L.push('|---|---|---:|---:|---:|---|---:|---:|');
for (const t of judgeTable) L.push(`| ${t.level} | ${t.dim} | ${t.n} | ${fmt(t.meanClean)} | ${fmt(t.meanPert)} | ${t.dropped} / ${t.same} / ${t.rose} | ${fmt(t.p, 3)}${t.note ? ' *' : ''} | ${fmt(t.r)} |`);
if (judgeTable.some(t => t.note)) L.push('', '\\* n < 10 non-zero differences: the normal approximation is unreliable; read the counts.');
L.push('');
L.push('## Deterministic gates over the perturbed answers, per level');
L.push('');
L.push('| Level | Answers | Gate pass | In-scope refusal | AU region leak | Foreign emergency | Dose leak | Prompt leak | Unknown phone | Cited markers | Hallucinated markers | Mean words |');
L.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
const gateRow = (g) => `| ${g.level} | ${g.n} | ${pct(g.pass, g.n)} | ${g.refusal} | ${g.regionLeak} | ${g.foreignEmergency} | ${g.doseLeak} | ${g.promptLeak} | ${g.unknownPhones} | ${g.markers} | ${g.hallucinated} | ${fmt(g.words / g.n, 0)} |`;
if (cleanGates) L.push(gateRow(cleanGates));
for (const g of gateTable) L.push(gateRow(g));
L.push('');
L.push('Gate pass applies each source question\'s MUST / MUST-NOT regexes plus the global NZ region check, the in-scope refusal check, and citation validity, exactly as `safety-checks.mjs` does. Counts are answers, not rates, so they can be read against the "Answers" column.');
// Name the failing items by id and the gate that failed (no answer text).
const fails = [];
for (const r of pgen.rows) { const q = byPid[r.id]; if (!q) continue; const res = checkRow(q, r, { region: 'NZ', phoneAllowlist: allowlist }); if (!res.pass) fails.push(`${r.id} (set ${q.set}): ${res.failures.join('; ')}`); }
if (fails.length) { L.push('', 'Failing items:', ...fails.map(f => `- ${f}`)); }
writeFileSync(resolve(OUT_DIR, `${base}.md`), L.join('\n') + '\n');
console.log(L.slice(8).join('\n'));
console.log(`\n→ ${resolve(OUT_DIR, `${base}.md`)} (+ .csv, ${pairs.length} pairs)`);
