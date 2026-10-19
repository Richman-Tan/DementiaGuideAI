#!/usr/bin/env node
// Post hoc (not pre-specified): how well does the §19B whisper-1 error model reproduce
// whisper-1's real errors? Applies the committed model (error-model_5cde14f_s19b.json, w1) to the
// dementia group's ADReSS reference utterances (condition (a)) and compares, on the same
// utterances, with whisper-1's real transcripts. Reads the git-ignored data/dementiabank/ files
// locally and prints AGGREGATES ONLY: no reference or hypothesis text is written or printed.
//
//   node scripts/eval/s19j/validate-error-model.mjs --data <repo>/data/dementiabank [--seeds 5]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from '../lib.mjs';
const require = createRequire(import.meta.url);
const { parseCsv } = require('../lib/csv.js');
const { normalize, wer, spearman, FUNCTION_WORDS } = require('../lib/wer.js');
const { mulberry32 } = require('../lib/stats.js');
const { transcribe } = require('../stt/asrModel.js');
const args = process.argv.slice(2);
const argVal = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };
const DATA = resolve(argVal('--data') ?? join(ROOT, 'data/dementiabank'));
const SEEDS = Number(argVal('--seeds') ?? 5);
const rec = JSON.parse(readFileSync(join(ROOT, 'docs/report/eval/stt/error-model_5cde14f_s19b.json'), 'utf8')).recognisers.w1.model;
const refs = parseCsv(readFileSync(join(DATA, 'references.csv'), 'utf8')).filter(r => r.group === 'dementia');
const hyps = new Map(parseCsv(readFileSync(join(DATA, 'hyps_whisper-1.csv'), 'utf8')).filter(h => !h.error).map(h => [h.chunk_path, h.hyp_text ?? '']));
const utts = refs.filter(r => hyps.has(r.chunk_path)).map(r => ({ ref: normalize(r.ref_text), hypReal: normalize(hyps.get(r.chunk_path)) })).filter(u => u.ref.length > 0);

function stats(list) { // list of wer() results, aligned with utts
  let E = 0, N = 0, adjBoth = 0, adjFirst = 0, content = 0, contentKept = 0, perfect = 0, high = 0;
  const per = [];
  for (const a of list) {
    E += a.errors; N += a.N; per.push(a.wer); if (a.errors === 0) perfect++; if (a.wer >= 0.5) high++;
    const ops = a.pairs.map(p => p.op);
    for (let i = 0; i + 1 < ops.length; i++) if (ops[i] !== 'H') { adjFirst++; if (ops[i + 1] !== 'H') adjBoth++; }
    for (const p of a.pairs) if (p.ref && !FUNCTION_WORDS.has(p.ref)) { content++; if (p.op === 'H') contentKept++; }
  }
  const m = per.reduce((s, x) => s + x, 0) / per.length, sd = Math.sqrt(per.reduce((s, x) => s + (x - m) ** 2, 0) / (per.length - 1));
  return { pooled: E / N, meanUtt: m, sdUtt: sd, perfect: perfect / list.length, high: high / list.length, errAfterErr: adjBoth / adjFirst, errRate: E / (N + list.reduce((s, a) => s + a.I, 0)), contentKept: contentKept / content, per };
}
const real = stats(utts.map(u => wer(u.ref, u.hypReal)));
const sims = [];
for (let s = 0; s < SEEDS; s++) {
  const rnd = mulberry32(42 + s);
  sims.push(stats(utts.map(u => wer(u.ref, normalize(transcribe(u.ref.join(' '), rec, rnd).text)))));
}
const avg = (k) => sims.reduce((s, x) => s + x[k], 0) / sims.length;
const rng = (k) => `${Math.min(...sims.map(x => x[k])).toFixed(3)}–${Math.max(...sims.map(x => x[k])).toFixed(3)}`;
const rho = sims.map(x => spearman(real.per, x.per).rho ?? spearman(real.per, x.per));
const rows = [
  ['Pooled WER', 'pooled'], ['Mean per-utterance WER', 'meanUtt'], ['SD of per-utterance WER', 'sdUtt'],
  ['Utterances with no error', 'perfect'], ['Utterances with WER ≥ 50%', 'high'],
  ['P(error | previous position an error)', 'errAfterErr'], ['Error share of aligned positions', 'errRate'],
  ['Reference content words kept', 'contentKept'],
];
const L = ['# Post hoc check of the §19B whisper-1 error model against whisper-1\'s real transcripts', '',
  `Dementia group, condition (a): ${utts.length} utterances with a non-empty reference. Simulated: the committed w1 model applied to each reference, ${SEEDS} seeds (42 to ${41 + SEEDS}); mean over seeds, range in brackets. Aggregates only.`, '',
  '| Measure | whisper-1, real | Error model, simulated |', '|---|---|---|',
  ...rows.map(([lab, k]) => `| ${lab} | ${real[k].toFixed(3)} | ${avg(k).toFixed(3)} (${rng(k)}) |`),
  `| Spearman ρ, real vs simulated per-utterance WER | — | ${(rho.reduce((s, x) => s + x, 0) / rho.length).toFixed(3)} |`, ''];
const out = join(ROOT, 'docs/report/eval/stt/error-model-check_s19j.md');
writeFileSync(out, L.join('\n') + '\n'); console.log(L.join('\n')); console.log(`written ${out}`);
