#!/usr/bin/env node
// Extract the Unity lip-sync harness results into small, committable JSON
// summaries. The raw TestResults/ folder is git-ignored (CSV traces + PNG
// captures, tens of MB per run) and exists only on the machine that ran the
// Editor — so the 37/85 baseline and 95/95 final evidence would otherwise be
// unrecoverable from a clone.
//
// Reads <run>/<fixture>_metrics.json (never summary.json — the baseline run's
// summary is malformed by a leaked format specifier) and flags sampler-starved
// runs (< 60 samples per fixture; the 2026-08-17 runs at 38/95 etc. are
// measurement artefacts of a 6 fps play mode, not regressions).
//
//   node scripts/lipsync/summarise-testresults.mjs                   # baseline + final
//   node scripts/lipsync/summarise-testresults.mjs --runs 20260817_144400
//   node scripts/lipsync/summarise-testresults.mjs --all [--out-dir docs/report/eval/lipsync]
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const argVal = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };
const RESULTS = resolve(ROOT, argVal('--results-dir') ?? 'unity-avatar/UnityAvatarProject/TestResults/lipsync');
const OUT_DIR = resolve(ROOT, argVal('--out-dir') ?? 'docs/report/eval/lipsync');
const MIN_SAMPLES = 60;
const DEFAULT_RUNS = ['20260711_231911', '20260712_000426'];

const runs = args.includes('--all')
  ? readdirSync(RESULTS).filter(d => /^\d{8}_\d{6}$/.test(d) && statSync(resolve(RESULTS, d)).isDirectory())
  : (argVal('--runs')?.split(',') ?? DEFAULT_RUNS);

mkdirSync(OUT_DIR, { recursive: true });
const summaries = [];
for (const run of runs) {
  const dir = resolve(RESULTS, run);
  if (!existsSync(dir)) { console.warn(`skip ${run}: not found`); continue; }
  const files = readdirSync(dir).filter(f => f.endsWith('_metrics.json')).sort();
  if (!files.length) { console.warn(`skip ${run}: no *_metrics.json`); continue; }
  const fixtures = files.map(f => {
    const m = JSON.parse(readFileSync(resolve(dir, f), 'utf8'));
    return {
      fixture: m.fixture ?? basename(f, '_metrics.json'), passed: m.passed, passedChecks: m.passedChecks, totalChecks: m.totalChecks,
      jitterRms: m.jitterRms, sampleCount: m.sampleCount,
      checks: (m.checks ?? []).map(c => ({ time: c.time, type: c.type, label: c.label, passed: c.passed, value: c.value, secondary: c.secondary, detail: c.detail })),
    };
  });
  const totals = fixtures.reduce((t, f) => ({ passed: t.passed + f.passedChecks, total: t.total + f.totalChecks }), { passed: 0, total: 0 });
  const minSamples = Math.min(...fixtures.map(f => f.sampleCount ?? 0));
  const byType = {};
  for (const f of fixtures) for (const c of f.checks) { byType[c.type] ??= { passed: 0, total: 0, values: [] }; byType[c.type].total++; if (c.passed) byType[c.type].passed++; if (typeof c.value === 'number') byType[c.type].values.push(c.value); }
  const summary = { runId: run, extractedAt: new Date().toISOString(), totals, minSamples, suspect: minSamples < MIN_SAMPLES, byType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, { passed: v.passed, total: v.total, min: Math.min(...v.values), max: Math.max(...v.values) }])), fixtures };
  writeFileSync(resolve(OUT_DIR, `${run}.json`), JSON.stringify(summary, null, 2));
  summaries.push(summary);
  console.log(`${run}: ${totals.passed}/${totals.total}${summary.suspect ? `  SUSPECT (min ${minSamples} samples — sampler-starved run, exclude)` : ''}`);
}

// Rebuild the index from every summary present in the out dir.
const all = readdirSync(OUT_DIR).filter(f => /^\d{8}_\d{6}\.json$/.test(f)).sort().map(f => JSON.parse(readFileSync(resolve(OUT_DIR, f), 'utf8')));
const fixtureNames = [...new Set(all.flatMap(s => s.fixtures.map(f => f.fixture)))].sort();
const md = ['# Unity lip-sync harness — extracted results', '',
  'Source: `unity-avatar/UnityAvatarProject/TestResults/lipsync/<run>/*_metrics.json` (git-ignored; extracted by `scripts/lipsync/summarise-testresults.mjs`). Checks: bilabial `V_Explosive ≥ 0.90` (open shapes ≤ 0.15, jaw ≤ 0.20) ±60 ms; labiodental `V_Dental_Lip ≥ 0.80`; tongue ≥ 0.30; vowel peak ≥ 0.35 ±80 ms; silence < 0.10; segment-end decay ≤ 250 ms. Jitter RMS is reported, not gated. Runs with fewer than 60 samples per fixture are marked suspect (sampler starvation, not lip-sync regressions).', '',
  `| Run | Total | ${fixtureNames.join(' | ')} | min samples | jitter range | suspect |`, `|---|---|${fixtureNames.map(() => '---').join('|')}|---|---|---|`];
for (const s of all) {
  const byName = Object.fromEntries(s.fixtures.map(f => [f.fixture, f]));
  const jit = s.fixtures.map(f => f.jitterRms).filter(x => typeof x === 'number');
  md.push(`| ${s.runId} | ${s.totals.passed}/${s.totals.total} | ${fixtureNames.map(n => byName[n] ? `${byName[n].passedChecks}/${byName[n].totalChecks}` : '—').join(' | ')} | ${s.minSamples} | ${jit.length ? `${Math.min(...jit).toFixed(4)}–${Math.max(...jit).toFixed(4)}` : '—'} | ${s.suspect ? 'yes' : ''} |`);
}
writeFileSync(resolve(OUT_DIR, 'README.md'), md.join('\n') + '\n');
console.log(`\nWrote ${OUT_DIR}/README.md (${all.length} runs indexed)`);
