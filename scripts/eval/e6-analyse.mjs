#!/usr/bin/env node
// E6 perceptual lip-sync test — analysis (docs/eval/evaluation-plan.md, E6).
//
// The plan's analysis, exactly: "Binomial test on preference, Wilcoxon on
// ratings, report medians" (§E6), "preference rate + binomial CI, rating
// medians" (§2 table). Concretely, for the ten engine-vs-legacy pairs:
//
//   1. Preference — share of trials where the rater chose the ENGINE clip as
//      more natural; Wilson 95% CI; exact two-sided binomial test against 0.5.
//      Trials are nested in raters, so the same question is also answered at
//      rater level (sign test on each rater's majority) as a robustness check.
//   2. Synchronisation ratings (1–5) — medians and IQR per condition; Wilcoxon
//      signed-rank on each rater's mean(engine) − mean(legacy), exact
//      permutation p for n ≤ 25 raters (normal approximation above), with the
//      matched-pairs rank-biserial r as effect size.
//   3. Naturalness ratings (1–5) — the same as 2 (the plan's table lists
//      "sync/naturalness").
//   Holm adjustment across these three tests.
//
// Descriptive extras: per-sentence preference, position (left/right) bias,
// choice–rating consistency, plays per clip. The static-mouth control pair is
// a manipulation check reported on its own and never pooled with the main pairs.
//
// Pre-specified exclusions (all reported): sessions not completed; raters who
// took part in the usability study (the plan wants raters who are NOT study
// participants); a repeated participant code keeps its first complete session;
// rows from a different stimuli set than the key.
//
//   node scripts/eval/e6-analyse.mjs --key <e6-key.json> <responses.csv|dir>… \
//        [--out report.md] [--json results.json] [--include-incomplete] [--include-study-participants]
//
// Response CSVs are participant data: keep them in docs/eval/human/private/ (git-ignored)
// or outside the repo, never in a tracked folder.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const { parseCsv } = require(resolve(ROOT, 'scripts/eval/lib/csv.js'));
const { wilson, binomialTwoSidedP, signTest, wilcoxonSignedRank, median, quantile, mean, holm } = require(resolve(ROOT, 'scripts/eval/lib/stats.js'));

// ── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const valued = new Set(['--key', '--out', '--json']);
const opts = {}; const inputs = [];
for (let i = 0; i < args.length; i++) {
  if (valued.has(args[i])) opts[args[i]] = args[++i];
  else if (args[i].startsWith('--')) opts[args[i]] = true;
  else inputs.push(args[i]);
}
const die = (m) => { console.error(`✖ ${m}`); process.exit(1); };
if (!opts['--key'] || !inputs.length) die('usage: e6-analyse.mjs --key <e6-key.json> <responses.csv|dir>… [--out report.md] [--json results.json]');
const INCLUDE_INCOMPLETE = !!opts['--include-incomplete'];
const INCLUDE_STUDY = !!opts['--include-study-participants'];

// ── Exact Wilcoxon signed-rank (permutation distribution of W+ given the ranks) ─
// Ranks with ties are multiples of 0.5, so W+ is tracked in half-units; the DP
// counts sign assignments, which is exact for any n we will see (≤ 25 here).
function wilcoxonExactP(diffs) {
  const nz = diffs.filter((d) => d !== 0);
  const n = nz.length;
  if (!n) return 1;
  const abs = nz.map(Math.abs);
  const order = abs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(n);
  for (let i = 0; i < n;) {
    let j = i;
    while (j + 1 < n && order[j + 1][0] === order[i][0]) j++;
    for (let k = i; k <= j; k++) ranks[order[k][1]] = (i + j + 2) / 2;
    i = j + 1;
  }
  const r2 = ranks.map((r) => Math.round(r * 2));
  const total = r2.reduce((a, b) => a + b, 0);
  let dist = new Map([[0, 1]]);
  for (const r of r2) {
    const next = new Map(dist);
    for (const [s, c] of dist) next.set(s + r, (next.get(s + r) ?? 0) + c);
    dist = next;
  }
  const wPlus2 = nz.reduce((s, d, i) => s + (d > 0 ? r2[i] : 0), 0);
  const centre = total / 2;
  const obsDev = Math.abs(wPlus2 - centre);
  let extreme = 0; let all = 0;
  for (const [s, c] of dist) { all += c; if (Math.abs(s - centre) >= obsDev - 1e-9) extreme += c; }
  return Math.min(1, extreme / all);
}

function wilcoxon(diffs) {
  const w = wilcoxonSignedRank(diffs);
  const exact = w.n > 0 && w.n <= 25;
  return { ...w, p: exact ? wilcoxonExactP(diffs) : w.p, method: exact ? 'exact permutation' : 'normal approximation' };
}

// ── Load ─────────────────────────────────────────────────────────────────────
const key = JSON.parse(readFileSync(resolve(opts['--key']), 'utf8'));
const clipInfo = key.clips;
const sentenceText = Object.fromEntries((key.sentences ?? []).map((s) => [s.id, s.text]));

const files = [];
for (const inp of inputs) {
  const p = resolve(inp);
  if (!existsSync(p)) die(`not found: ${p}`);
  if (statSync(p).isDirectory()) for (const f of readdirSync(p)) { if (f.endsWith('.csv')) files.push(join(p, f)); }
  else files.push(p);
}
if (!files.length) die('no CSV files found');

const REQUIRED = ['participant_code', 'session_id', 'stimuli_id', 'took_part_in_study', 'session_complete', 'trial_index',
  'pair_id', 'pair_role', 'clip_left', 'clip_right', 'sync_left', 'sync_right', 'natural_left', 'natural_right', 'choice', 'chosen_clip'];
let rows = [];
for (const f of files) {
  const rs = parseCsv(readFileSync(f, 'utf8'));
  if (!rs.length) continue;
  const missing = REQUIRED.filter((c) => !(c in rs[0]));
  if (missing.length) die(`${basename(f)} lacks columns: ${missing.join(', ')}`);
  rows.push(...rs.map((r) => ({ ...r, _file: basename(f) })));
}

const notes = [];
const exclusions = [];
// Duplicate rows (the same session downloaded by the rater AND exported by the researcher).
const seen = new Set();
rows = rows.filter((r) => { const k = `${r.session_id}#${r.trial_index}`; if (seen.has(k)) return false; seen.add(k); return true; });

const wrongSet = rows.filter((r) => r.stimuli_id !== key.stimuliId);
if (wrongSet.length) exclusions.push(`${new Set(wrongSet.map((r) => r.session_id)).size} session(s) rated a different stimuli set (${[...new Set(wrongSet.map((r) => r.stimuli_id))].join(', ')}) — excluded`);
rows = rows.filter((r) => r.stimuli_id === key.stimuliId);

for (const r of rows) {
  for (const c of [r.clip_left, r.clip_right, r.chosen_clip]) if (!clipInfo[c]) die(`clip ${c} (session ${r.session_id}) is not in the key — wrong key file?`);
  if (r.chosen_clip !== (r.choice === 'left' ? r.clip_left : r.clip_right)) die(`session ${r.session_id} trial ${r.trial_index}: chosen_clip does not match choice`);
}

// Sessions → exclusions.
const sessions = new Map();
for (const r of rows) { if (!sessions.has(r.session_id)) sessions.set(r.session_id, []); sessions.get(r.session_id).push(r); }
const nPairs = key.pairs.length;
const kept = [];
const byCode = new Map();
for (const [sid, rs] of [...sessions.entries()].sort((a, b) => (a[1][0].trial_started_at ?? '').localeCompare(b[1][0].trial_started_at ?? ''))) {
  const code = rs[0].participant_code;
  const complete = rs.every((r) => r.session_complete === 'yes') && rs.length === nPairs;
  const study = rs[0].took_part_in_study;
  if (!complete && !INCLUDE_INCOMPLETE) { exclusions.push(`${code} (${sid}): incomplete session, ${rs.length}/${nPairs} trials — excluded`); continue; }
  if (study === 'yes' && !INCLUDE_STUDY) { exclusions.push(`${code} (${sid}): took part in the usability study — excluded (plan: raters are not study participants)`); continue; }
  if (byCode.has(code)) { exclusions.push(`${code} (${sid}): repeated participant code — excluded, first complete session kept`); continue; }
  byCode.set(code, sid);
  kept.push(...rs);
}
const unsure = new Set(kept.filter((r) => r.took_part_in_study === 'unsure').map((r) => r.participant_code));
if (unsure.size) notes.push(`${unsure.size} rater(s) answered "not sure" to the study-participation question and are included: ${[...unsure].join(', ')}`);

// ── Trials in condition terms ────────────────────────────────────────────────
const trials = kept.map((r) => {
  const L = clipInfo[r.clip_left]; const R = clipInfo[r.clip_right];
  const side = (cond) => (L.condition === cond ? 'left' : R.condition === cond ? 'right' : null);
  const num = (v) => (v === '' || v == null ? null : Number(v));
  const ratings = { left: { sync: num(r.sync_left), natural: num(r.natural_left) }, right: { sync: num(r.sync_right), natural: num(r.natural_right) } };
  const other = r.pair_role === 'main' ? 'legacy' : 'static';
  const eSide = side('engine'); const oSide = side(other);
  if (!eSide || !oSide || L.sentenceId !== R.sentenceId) die(`pair ${r.pair_id} in session ${r.session_id} is not engine vs ${other} of one sentence — key mismatch`);
  return {
    rater: r.participant_code, role: r.pair_role, pairId: r.pair_id, sentenceId: L.sentenceId,
    engineChosen: clipInfo[r.chosen_clip].condition === 'engine', choseLeft: r.choice === 'left', engineLeft: eSide === 'left',
    syncE: ratings[eSide].sync, syncO: ratings[oSide].sync, natE: ratings[eSide].natural, natO: ratings[oSide].natural,
    playsE: num(r[eSide === 'left' ? 'plays_left' : 'plays_right']), playsO: num(r[oSide === 'left' ? 'plays_left' : 'plays_right']),
  };
});
const main = trials.filter((t) => t.role === 'main');
const control = trials.filter((t) => t.role === 'control');
const raters = [...new Set(main.map((t) => t.rater))].sort();

// ── Primary analyses ─────────────────────────────────────────────────────────
const fmt = (x, d = 2) => (x == null || Number.isNaN(x) ? '—' : Number(x).toFixed(d));
const fmtP = (p) => (p == null ? '—' : p < 0.001 ? '< 0.001' : p.toFixed(3));
const pEq = (p) => (p != null && p < 0.001 ? 'p < 0.001' : `p = ${fmtP(p)}`);
const iqr = (xs) => (xs.length ? `${fmt(quantile(xs, 0.25), 1)}–${fmt(quantile(xs, 0.75), 1)}` : '—');

function preference(ts) {
  const k = ts.filter((t) => t.engineChosen).length; const n = ts.length;
  return { k, n, ...wilson(k, n), p: n ? binomialTwoSidedP(k, n) : null };
}
function raterLevel(ts) {
  const per = raters.map((id) => { const mine = ts.filter((t) => t.rater === id); return { id, n: mine.length, share: mine.length ? mine.filter((t) => t.engineChosen).length / mine.length : null }; }).filter((x) => x.n);
  const pos = per.filter((x) => x.share > 0.5).length; const neg = per.filter((x) => x.share < 0.5).length; const ties = per.filter((x) => x.share === 0.5).length;
  return { per, ...signTest(pos, neg), ties, medianShare: median(per.map((x) => x.share)) };
}
function ratingTest(ts, field) {
  const [e, o] = field === 'sync' ? ['syncE', 'syncO'] : ['natE', 'natO'];
  const pooledE = ts.map((t) => t[e]).filter((x) => x != null);
  const pooledO = ts.map((t) => t[o]).filter((x) => x != null);
  const per = raters.map((id) => {
    const mine = ts.filter((t) => t.rater === id && t[e] != null && t[o] != null);
    return mine.length ? { id, meanE: mean(mine.map((t) => t[e])), meanO: mean(mine.map((t) => t[o])) } : null;
  }).filter(Boolean);
  // Round before ranking: means of 1–5 ratings differ in exact tenths, but float
  // subtraction gives 0.30000000000000004 vs 0.29999999999999993, which would
  // break genuine ties and turn a zero difference into a tiny non-zero one.
  const diffs = per.map((x) => Math.round((x.meanE - x.meanO) * 1e6) / 1e6);
  return {
    pooled: { medianE: median(pooledE), medianO: median(pooledO), iqrE: iqr(pooledE), iqrO: iqr(pooledO), nE: pooledE.length, nO: pooledO.length },
    raterMeans: { medianE: median(per.map((x) => x.meanE)), medianO: median(per.map((x) => x.meanO)), medianDiff: median(diffs) },
    wilcoxon: wilcoxon(diffs),
    perRater: per,
  };
}

const pref = preference(main);
const prefRater = raterLevel(main);
const sync = ratingTest(main, 'sync');
const nat = ratingTest(main, 'natural');
const [holmPref, holmSync, holmNat] = holm([pref.p, sync.wilcoxon.p, nat.wilcoxon.p]);

// ── Descriptives ─────────────────────────────────────────────────────────────
const sentences = [...new Set(main.map((t) => t.sentenceId))].sort();
const perSentence = sentences.map((sid) => {
  const ts = main.filter((t) => t.sentenceId === sid);
  return { sid, k: ts.filter((t) => t.engineChosen).length, n: ts.length, syncE: median(ts.map((t) => t.syncE)), syncO: median(ts.map((t) => t.syncO)), natE: median(ts.map((t) => t.natE)), natO: median(ts.map((t) => t.natO)) };
});
const leftK = main.filter((t) => t.choseLeft).length;
const position = { k: leftK, n: main.length, ...wilson(leftK, main.length), p: main.length ? binomialTwoSidedP(leftK, main.length) : null };
const consistent = main.filter((t) => (t.engineChosen ? t.natE >= t.natO : t.natO >= t.natE)).length;
const ctrl = control.length ? {
  pref: preference(control),
  syncE: median(control.map((t) => t.syncE)), syncO: median(control.map((t) => t.syncO)),
  natE: median(control.map((t) => t.natE)), natO: median(control.map((t) => t.natO)),
  chooseStatic: control.filter((t) => !t.engineChosen).map((t) => t.rater),
} : null;
const plays = main.flatMap((t) => [t.playsE, t.playsO]).filter((x) => x != null);

// ── Report ───────────────────────────────────────────────────────────────────
const L = [];
L.push(`# E6 perceptual lip-sync test: results`, '');
L.push(`Generated ${new Date().toISOString()} by \`scripts/eval/e6-analyse.mjs\` from ${files.length} CSV file(s); stimuli set \`${key.stimuliId}\` (Unity build ${key.unityBuild?.version ?? '?'}, ${key.capture?.fps ?? '?'} fps, recorded at ${key.gitSha ?? '?'}).`, '');
L.push(`**Raters analysed: ${raters.length}** · main trials: ${main.length} (engine vs legacy, ${sentences.length} sentences) · control trials: ${control.length} (engine vs static mouth).`, '');
if (exclusions.length) { L.push('**Exclusions (pre-specified):**', ''); for (const e of exclusions) L.push(`- ${e}`); L.push(''); }
for (const n of notes) L.push(`- ${n}`);
if (raters.length < 10) L.push('', `> Fewer than 10 raters: treat every test below as descriptive. The plan's target is about 15.`);
L.push('', '## Primary analyses (engine vs legacy)', '');
L.push('| Measure | Engine | Legacy | Test | Statistic | p | Holm p |');
L.push('|---|---|---|---|---|---|---|');
L.push(`| Chose as more natural (trials) | ${pref.k}/${pref.n} = ${fmt(pref.p != null ? pref.k / pref.n * 100 : null, 1)}% (95% CI ${fmt(pref.lo * 100, 1)}–${fmt(pref.hi * 100, 1)}%) | ${pref.n - pref.k}/${pref.n} | exact binomial vs 50% | k = ${pref.k} of ${pref.n} | ${fmtP(pref.p)} | ${fmtP(holmPref)} |`);
L.push(`| Synchronisation, 1–5: median (IQR) of all ratings | ${fmt(sync.pooled.medianE, 1)} (${sync.pooled.iqrE}) | ${fmt(sync.pooled.medianO, 1)} (${sync.pooled.iqrO}) | Wilcoxon signed-rank on rater means (${sync.wilcoxon.method}) | n = ${sync.wilcoxon.n}, W+ = ${fmt(sync.wilcoxon.wPlus, 1)}, r = ${fmt(sync.wilcoxon.rankBiserial)} | ${fmtP(sync.wilcoxon.p)} | ${fmtP(holmSync)} |`);
L.push(`| Naturalness, 1–5: median (IQR) of all ratings | ${fmt(nat.pooled.medianE, 1)} (${nat.pooled.iqrE}) | ${fmt(nat.pooled.medianO, 1)} (${nat.pooled.iqrO}) | Wilcoxon signed-rank on rater means (${nat.wilcoxon.method}) | n = ${nat.wilcoxon.n}, W+ = ${fmt(nat.wilcoxon.wPlus, 1)}, r = ${fmt(nat.wilcoxon.rankBiserial)} | ${fmtP(nat.wilcoxon.p)} | ${fmtP(holmNat)} |`);
L.push('');
L.push(`Median of rater means: synchronisation engine ${fmt(sync.raterMeans.medianE)} vs legacy ${fmt(sync.raterMeans.medianO)} (median difference ${fmt(sync.raterMeans.medianDiff)}); naturalness engine ${fmt(nat.raterMeans.medianE)} vs legacy ${fmt(nat.raterMeans.medianO)} (median difference ${fmt(nat.raterMeans.medianDiff)}). W+ sums the ranks of raters who rated the engine higher; r is the matched-pairs rank-biserial correlation (−1 to 1, positive favours the engine). Raters whose mean difference is exactly zero drop out of the Wilcoxon test, as is standard.`);
L.push('', `**Rater-level check on preference** (trials are nested in raters): ${prefRater.positives} rater(s) chose the engine in most pairs, ${prefRater.negatives} chose legacy in most, ${prefRater.ties} split evenly; sign test ${pEq(prefRater.p)}; median per-rater engine share ${fmt(prefRater.medianShare * 100, 0)}%.`);
L.push('', '## Per sentence (descriptive)', '');
L.push('| Sentence | Engine chosen | Sync median E / L | Naturalness median E / L | Text |');
L.push('|---|---|---|---|---|');
for (const s of perSentence) L.push(`| ${s.sid} | ${s.k}/${s.n} | ${fmt(s.syncE, 1)} / ${fmt(s.syncO, 1)} | ${fmt(s.natE, 1)} / ${fmt(s.natO, 1)} | ${sentenceText[s.sid] ?? ''} |`);
L.push('', '## Checks', '');
L.push(`- Position bias: the left clip was chosen in ${position.k}/${position.n} main trials (${fmt(position.k / position.n * 100, 1)}%, binomial ${pEq(position.p)}); left/right was randomised per participant and pair.`);
L.push(`- Choice–rating consistency: in ${consistent}/${main.length} main trials the chosen clip also had the higher or equal naturalness rating.`);
L.push(`- Exposure: plays per clip median ${fmt(median(plays), 0)} (range ${plays.length ? Math.min(...plays) : '—'}–${plays.length ? Math.max(...plays) : '—'}); the page required each clip to be watched to the end at least once.`);
if (ctrl) {
  L.push('', '## Control pair: engine vs static mouth (manipulation check, not pooled)', '');
  L.push(`Engine chosen in ${ctrl.pref.k}/${ctrl.pref.n} trials (${fmt(ctrl.pref.k / ctrl.pref.n * 100, 1)}%, 95% CI ${fmt(ctrl.pref.lo * 100, 1)}–${fmt(ctrl.pref.hi * 100, 1)}%, binomial ${pEq(ctrl.pref.p)}). Synchronisation median engine ${fmt(ctrl.syncE, 1)} vs static ${fmt(ctrl.syncO, 1)}; naturalness ${fmt(ctrl.natE, 1)} vs ${fmt(ctrl.natO, 1)}.`);
  L.push(ctrl.chooseStatic.length ? `Rater(s) who preferred the static mouth: ${ctrl.chooseStatic.join(', ')} — reported, not excluded (no exclusion rule was set on this check).` : 'Every rater preferred the moving mouth over the static one.');
}
L.push('', '## How to read this', '');
L.push('- The engine is the co-articulation engine the app ships; legacy is the keyframe track it replaced. Both use the same ElevenLabs audio, the same Unity build and the same recording method; only the lip-sync message differs.');
L.push('- By design the raters are colleagues and peers, blind to condition, not carers: the result is about perceived lip-sync quality, not about usefulness to carers.');
L.push('- A preference CI that excludes 50% means raters reliably told the conditions apart in the engine\'s favour (or against it). A CI that includes 50% is not evidence that the two are the same: with about 15 raters, small differences cannot be detected.');

const md = L.join('\n') + '\n';
const results = { stimuliId: key.stimuliId, files: files.map((f) => basename(f)), raters, exclusions, notes,
  preference: pref, preferenceRaterLevel: prefRater, sync, naturalness: nat, holm: { preference: holmPref, sync: holmSync, naturalness: holmNat },
  perSentence, position, consistency: { consistent, n: main.length }, control: ctrl };
if (opts['--out']) writeFileSync(resolve(opts['--out']), md);
if (opts['--json']) writeFileSync(resolve(opts['--json']), JSON.stringify(results, null, 1));
process.stdout.write(md);
