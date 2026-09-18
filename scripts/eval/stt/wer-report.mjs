#!/usr/bin/env node
// Word-error-rate report for the DementiaBank/ADReSS speech-recognition
// evaluation (E9). Joins references.csv with one or more hyps_<model>.csv
// files and writes AGGREGATES ONLY to docs/report/eval/stt/ — per-group WER
// with bootstrap CIs over speakers, S/D/I decomposition, Mann–Whitney
// dementia vs control with Cliff's δ, Spearman ρ against MMSE, paired Wilcoxon
// between models over speakers, the top-30 confusions (single word pairs) and
// the function-word share of deletions. No transcript or hypothesis string is
// ever written outside data/dementiabank/.
//
// Usage:
//   node scripts/eval/stt/wer-report.mjs                                  # every hyps_*.csv in data/dementiabank/
//   node scripts/eval/stt/wer-report.mjs --hyps data/dementiabank/hyps_whisper-1.csv,data/dementiabank/hyps_gpt-4o-mini-transcribe.csv
//   node scripts/eval/stt/wer-report.mjs --profile-out data/dementiabank/error-profile_whisper-1.json   # for perturb-questions.mjs
//   node scripts/eval/stt/wer-report.mjs --self-test                      # synthetic references + injected errors
//   flags: --references <csv>  --out-dir docs/report/eval/stt  --sha <label>
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { createRequire } from 'node:module';

import { ROOT, gitSha, csvEscape } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { parseCsv } = require('../lib/csv.js');
const { wer, aggregate, mannWhitney, spearman, deletionClasses, normalize, FUNCTION_WORDS } = require('../lib/wer.js');
const { wilcoxonSignedRank, mulberry32, mean } = require('../lib/stats.js');

const args = process.argv.slice(2);
const has = (n) => args.includes(n);
const argVal = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };

const DATA_DIR = resolve(ROOT, 'data/dementiabank');
const REFERENCES = resolve(ROOT, argVal('--references') ?? 'data/dementiabank/references.csv');
const OUT_DIR = resolve(ROOT, argVal('--out-dir') ?? 'docs/report/eval/stt');
const SHA = argVal('--sha') ?? gitSha();
const PROFILE_OUT = argVal('--profile-out');
const SELF_TEST = has('--self-test');

const fmt = (x, d = 3) => (x == null || Number.isNaN(x) ? '—' : Number(x).toFixed(d));
const pct = (x) => (x == null ? '—' : `${(100 * x).toFixed(1)}%`);
const pfmt = (p) => (p == null ? '—' : p < 0.001 ? '<0.001' : p.toFixed(3));

// Merge ADReSS VAD sub-chunks back into utterances. references.csv may carry
// `sub_index`/`sub_count`: every sub-chunk row repeats the whole utterance
// reference, so the hypotheses of one utterance are concatenated in sub_index
// order and scored once. Rows without those columns (or sub_count 1) pass
// through unchanged. An utterance with any sub-chunk lacking a hypothesis is
// counted as missing rather than scored on a partial transcript.
export function mergeSubChunks(refs, hyps) {
  const groups = new Map();
  for (const r of refs) {
    const count = Number(r.sub_count) || 1;
    const key = count > 1 ? `${r.speaker_id}|${r.t0}|${r.t1}` : r.chunk_path;
    const g = groups.get(key) ?? { ref: r, count, parts: [] };
    const h = hyps.get(r.chunk_path);
    g.parts.push({ idx: Number(r.sub_index) || 0, hyp: h ? h.hyp_text : null, ms: h ? Number(h.ms) || 0 : 0, dur: Number(r.duration_s) || 0 });
    groups.set(key, g);
  }
  const rows = [];
  let missing = 0, utterances = 0, subChunks = 0;
  for (const g of groups.values()) {
    utterances++;
    subChunks += g.parts.length;
    if (g.parts.some(p => p.hyp == null)) { missing++; continue; }
    g.parts.sort((a, b) => a.idx - b.idx);
    const r = g.ref;
    rows.push({
      speaker: r.speaker_id, group: r.group, mmse: r.mmse === '' ? null : Number(r.mmse), split: r.split,
      ref: r.ref_text_fillers_kept || r.ref_text,
      hyp: g.parts.map(p => p.hyp).join(' ').trim(),
      ms: g.parts.reduce((a, p) => a + p.ms, 0) || null,
      durationS: g.parts.reduce((a, p) => a + p.dur, 0) || null,
    });
  }
  return { rows, missing, utterances, subChunks };
}

function loadRows(refPath, hypPath) {
  const refs = parseCsv(readFileSync(refPath, 'utf8'));
  const hypRows = parseCsv(readFileSync(hypPath, 'utf8')).filter(h => !h.error);
  const hyps = new Map(hypRows.map(h => [h.chunk_path, h]));
  const modelLabel = hypRows.find(h => h.model)?.model ?? null;
  const merged = mergeSubChunks(refs, hyps);
  return { ...merged, chunks: refs.length, modelLabel };
}

// ── Hallucination / runaway decoding ─────────────────────────────────────────
// Whisper-family decoders emit stock phrases on very short or silent audio and
// can loop on pause-heavy speech. Both inflate insertions, and pause-heavy
// speech is exactly what the dementia group produces, so the report shows how
// much of the group gap survives when those utterances are set aside. They are
// REPORTED, not removed from the headline: the deployed model does this too.
const HALLUCINATION_PHRASES = ['thank you', 'thanks for watching', 'subscribe', 'bye'];

function hasRepeatedTrigram(words, minRepeats = 3) {
  if (words.length < 3 * minRepeats) return false;
  const seen = new Map();
  for (let i = 0; i + 3 <= words.length; i++) {
    const k = words.slice(i, i + 3).join(' ');
    const n = (seen.get(k) ?? 0) + 1;
    if (n >= minRepeats) return true;
    seen.set(k, n);
  }
  return false;
}

export function classifyUtterance(refText, hypText, fillers = 'strip') {
  const ref = normalize(refText, { fillers });
  const hyp = normalize(hypText, { fillers });
  const refJ = ` ${ref.join(' ')} `, hypJ = ` ${hyp.join(' ')} `;
  const runaway = hyp.length >= 2 * ref.length && hyp.length >= ref.length + 5;
  const phrase = HALLUCINATION_PHRASES.some(p => hypJ.includes(` ${p} `) && !refJ.includes(` ${p} `));
  const repetition = hasRepeatedTrigram(hyp);
  const empty = hyp.length === 0 && ref.length > 0;
  return { runaway, phrase, repetition, empty, hallucinated: runaway || phrase };
}

function hallucinationStats(rows, fillers, seed) {
  const byGroup = {};
  const kept = [];
  for (const r of rows) {
    const c = classifyUtterance(r.ref, r.hyp, fillers);
    const g = byGroup[r.group] ?? (byGroup[r.group] = { utterances: 0, runaway: 0, phrase: 0, repetition: 0, empty: 0, hallucinated: 0 });
    g.utterances++;
    if (c.runaway) g.runaway++;
    if (c.phrase) g.phrase++;
    if (c.repetition) g.repetition++;
    if (c.empty) g.empty++;
    if (c.hallucinated) g.hallucinated++; else kept.push(r);
  }
  const excl = aggregate(kept, { fillers, seed });
  for (const [g, x] of Object.entries(byGroup)) {
    const rate = (n) => (x.utterances ? n / x.utterances : null);
    x.runawayRate = rate(x.runaway); x.phraseRate = rate(x.phrase); x.repetitionRate = rate(x.repetition);
    x.emptyRate = rate(x.empty); x.hallucinatedRate = rate(x.hallucinated);
    x.exclMeanWer = excl.groups[g]?.meanWer ?? null;
    x.exclCi = excl.groups[g]?.ci ?? null;
    x.exclPooledWer = excl.groups[g]?.pooledWer ?? null;
    x.exclInsRate = excl.groups[g]?.insRate ?? null;
  }
  return { byGroup, phrases: HALLUCINATION_PHRASES };
}

function analyse(rows, { seed = 42 } = {}) {
  const out = {};
  for (const fillers of ['strip', 'keep']) {
    const a = aggregate(rows, { fillers, seed });
    const groups = Object.keys(a.groups).sort();
    const dem = a.speakers.filter(s => s.group === 'dementia' && s.wer != null).map(s => s.wer);
    const con = a.speakers.filter(s => s.group === 'control' && s.wer != null).map(s => s.wer);
    const withMmse = a.speakers.filter(s => s.wer != null && s.mmse != null && Number.isFinite(s.mmse));
    out[fillers] = {
      hallucination: hallucinationStats(rows, fillers, seed),
      groups: a.groups,
      groupOrder: groups,
      mw: dem.length && con.length ? mannWhitney(dem, con) : null,
      rho: withMmse.length >= 3 ? spearman(withMmse.map(s => s.wer), withMmse.map(s => s.mmse)) : null,
      speakers: a.speakers,
      topConfusions: a.topConfusions,
      topDeleted: a.topDeleted,
      deletions: deletionClasses(a),
      allSpeakerWer: a.speakers.filter(s => s.wer != null).map(s => s.wer),
    };
  }
  const lat = rows.map(r => r.ms).filter(x => x != null);
  out.latency = lat.length ? { n: lat.length, median: lat.sort((x, y) => x - y)[Math.floor(lat.length / 2)], mean: mean(lat) } : null;
  out.rtf = rows.filter(r => r.ms && r.durationS).length
    ? mean(rows.filter(r => r.ms && r.durationS).map(r => (r.ms / 1000) / r.durationS)) : null;
  return out;
}

function groupTable(res) {
  const lines = ['| Group | Speakers | Ref words | Mean WER (95% CI over speakers) | Median WER | Pooled WER | Sub | Del | Ins |', '|---|---:|---:|---|---:|---:|---:|---:|---:|'];
  for (const g of res.groupOrder) {
    const x = res.groups[g];
    lines.push(`| ${g} | ${x.speakers} | ${x.refWords} | ${pct(x.meanWer)} (${pct(x.ci.lo)}–${pct(x.ci.hi)}) | ${pct(x.medianWer)} | ${pct(x.pooledWer)} | ${pct(x.subRate)} | ${pct(x.delRate)} | ${pct(x.insRate)} |`);
  }
  return lines.join('\n');
}

function reportMarkdown(model, meta, res, paired) {
  const s = res.strip, k = res.keep;
  const md = [];
  md.push(`# Speech recognition on dementia speech — ${model} — snapshot ${SHA}`);
  md.push('');
  md.push(`Generated ${new Date().toISOString()} by \`scripts/eval/stt/wer-report.mjs\`. Corpus: DementiaBank ADReSS-2020 (Cookie Theft, participant utterances only). ${meta.chunks} rows in references (${meta.utterances ?? meta.chunks} utterances, ${meta.subChunks ?? meta.chunks} audio chunks — sub-chunks of one utterance are merged before scoring), ${meta.rows.length} scored, ${meta.missing} without a hypothesis. Unit of analysis: speaker (${s.allSpeakerWer.length}). Reference cleaning per \`prepare-adress.py\`; normalisation per \`scripts/eval/lib/wer.js\` (lowercase, punctuation, small numbers, contractions).`);
  md.push('');
  md.push('Data use: DementiaBank membership; cite Becker et al. (1994) and acknowledge NIA AG03705 and AG05133. Only aggregates are recorded here; audio, transcripts and hypotheses stay in the git-ignored data directory.');
  md.push('');
  md.push('## Primary policy — fillers stripped from both sides (what `whisper-1` drops by design)');
  md.push('');
  md.push(groupTable(s));
  md.push('');
  if (s.mw) md.push(`Dementia vs control (per-speaker WER): Mann–Whitney U = ${fmt(s.mw.U, 1)}, z = ${fmt(s.mw.z, 2)}, p = ${pfmt(s.mw.p)}, Cliff's δ = ${fmt(s.mw.delta, 2)} (n = ${s.mw.n1} vs ${s.mw.n2}).`);
  if (s.rho) md.push(`WER vs MMSE (per speaker): Spearman ρ = ${fmt(s.rho.rho, 3)}, p = ${pfmt(s.rho.p)}, n = ${s.rho.n}.`);
  md.push('');
  md.push('## Hallucination and runaway decoding');
  md.push('');
  md.push('Whisper-family decoders emit stock phrases on very short or near-silent audio and can loop on pause-heavy speech; pause-heavy speech is what the dementia group produces, so part of any group gap can be decoder behaviour rather than misrecognition. The deployed model family behaves the same way, so these cases are reported here rather than filtered out of the headline above. Runaway = hypothesis at least twice the reference length and at least five words longer; phrase = a fixed stock phrase (' + s.hallucination.phrases.map(p => `"${p}"`).join(', ') + ') present in the hypothesis but not the reference; repetition = some trigram repeated three or more times; empty = no words returned for a non-empty reference. "Excluding" sets aside runaway and phrase utterances.');
  md.push('');
  md.push('| Group | Utterances | Runaway | Phrase | Repetition | Empty | Mean WER excl. (95% CI) | Pooled WER excl. | Ins excl. |');
  md.push('|---|---:|---:|---:|---:|---:|---|---:|---:|');
  for (const g of s.groupOrder) {
    const h = s.hallucination.byGroup[g];
    if (!h) continue;
    md.push(`| ${g} | ${h.utterances} | ${pct(h.runawayRate)} (${h.runaway}) | ${pct(h.phraseRate)} (${h.phrase}) | ${pct(h.repetitionRate)} (${h.repetition}) | ${pct(h.emptyRate)} (${h.empty}) | ${pct(h.exclMeanWer)} (${pct(h.exclCi?.lo)}–${pct(h.exclCi?.hi)}) | ${pct(h.exclPooledWer)} | ${pct(h.exclInsRate)} |`);
  }
  md.push('');
  md.push('## Secondary policy — fillers kept (what reaches the retriever untouched)');
  md.push('');
  md.push(groupTable(k));
  md.push('');
  if (k.mw) md.push(`Dementia vs control: U = ${fmt(k.mw.U, 1)}, p = ${pfmt(k.mw.p)}, δ = ${fmt(k.mw.delta, 2)}.`);
  md.push('');
  md.push('## Error character (fillers stripped)');
  md.push('');
  md.push(`Function-word share of deletions: ${pct(s.deletions.functionShare)} (${s.deletions.functionWordDeletions} function, ${s.deletions.contentWordDeletions} content). A high share means the recogniser drops grammar rather than meaning; content-word deletions are the ones that change a retrieval query.`);
  md.push('');
  md.push('Top substitutions (reference → hypothesis, count):');
  md.push('');
  md.push(s.topConfusions.length ? s.topConfusions.map(c => `- ${c.ref} → ${c.hyp} (${c.n})`).join('\n') : '- none');
  md.push('');
  md.push('Most-deleted words:');
  md.push('');
  md.push(s.topDeleted.length ? s.topDeleted.slice(0, 15).map(d => `- ${d.word} (${d.n})${FUNCTION_WORDS.has(d.word) ? '' : ' [content]'}`).join('\n') : '- none');
  md.push('');
  if (res.latency) {
    md.push('## Latency');
    md.push('');
    md.push(`API round trip per chunk: median ${res.latency.median} ms, mean ${fmt(res.latency.mean, 0)} ms (n = ${res.latency.n})${res.rtf != null ? `; real-time factor ${fmt(res.rtf, 2)}` : ''}. Measured from this machine; report alongside E4.`);
    md.push('');
  }
  if (paired?.length) {
    md.push('## Paired comparison against other models (per-speaker WER, fillers stripped)');
    md.push('');
    md.push('| Comparison | Speakers | Mean Δ WER (this − other) | Wilcoxon p | Rank-biserial |');
    md.push('|---|---:|---:|---:|---:|');
    for (const p of paired) md.push(`| ${model} vs ${p.other} | ${p.n} | ${p.delta >= 0 ? '+' : ''}${(100 * p.delta).toFixed(1)} pp | ${pfmt(p.w.p)} | ${fmt(p.w.rankBiserial, 2)} |`);
    md.push('');
  }
  md.push('## Threats');
  md.push('');
  md.push('- Cookie Theft picture descriptions, US English, clinical recordings from the 1980s–2000s (denoised in this release). This bounds robustness to impaired speech, not to New Zealand accent or to caregiver vocabulary.');
  md.push('- The production-primary recogniser on the web (browser Web Speech API, en-NZ) is not measured here; see the live-harness subset if run.');
  md.push('- Reference transcripts follow CHAT conventions; retraced words are kept because they were spoken, and omitted sounds are scored as the full word.');
  return md.join('\n') + '\n';
}

function speakerCsv(res) {
  const cols = ['speaker', 'group', 'mmse', 'chunks', 'refWords', 'S', 'D', 'I', 'wer_strip', 'wer_keep'];
  const keep = new Map(res.keep.speakers.map(s => [s.speaker, s.wer]));
  const lines = [cols.join(',')];
  for (const s of res.strip.speakers) lines.push([s.speaker, s.group, s.mmse ?? '', s.chunks, s.N, s.S, s.D, s.I, s.wer ?? '', keep.get(s.speaker) ?? ''].map(csvEscape).join(','));
  return lines.join('\n') + '\n';
}

// Error profile for perturb-questions.mjs: rates from the dementia speakers
// (fillers kept, so the filler/insertion behaviour of the recogniser is in it).
function errorProfile(model, rows, res) {
  const dem = rows.filter(r => r.group === 'dementia');
  const con = rows.filter(r => r.group === 'control');
  const rates = (rs) => {
    let N = 0, S = 0, D = 0, I = 0;
    for (const r of rs) { const a = wer(r.ref, r.hyp, { fillers: 'strip' }); N += a.N; S += a.S; D += a.D; I += a.I; }
    return N ? { sub: S / N, del: D / N, ins: I / N } : { sub: 0, del: 0, ins: 0 };
  };
  const ad = rates(dem), control = rates(con);
  // Disfluency rates from the references themselves (per 100 words): fillers,
  // immediate repetitions, and (as a proxy for retracing) repeated bigrams.
  let words = 0, fillers = 0, reps = 0;
  for (const r of dem) {
    const kept = normalize(r.ref, { fillers: 'keep' });
    const stripped = normalize(r.ref, { fillers: 'strip' });
    words += stripped.length; fillers += kept.length - stripped.length;
    for (let i = 1; i < stripped.length; i++) if (stripped[i] === stripped[i - 1]) reps++;
  }
  return {
    source: `measured — ${model}, ADReSS-2020 dementia speakers, snapshot ${SHA}`,
    levels: { control, ad, ad150: { sub: ad.sub * 1.5, del: ad.del * 1.5, ins: ad.ins * 1.5 } },
    disfluencyPer100Words: { filler: words ? 100 * fillers / words : 0, repetition: words ? 100 * reps / words : 0, retracing: words ? 100 * reps / words / 2 : 0 },
    fillers: ['um', 'uh', 'er'],
    functionWordDeletionShare: res.strip.deletions.functionShare ?? 0.5,
    confusions: res.strip.topConfusions,
  };
}

function selfTest() {
  // Build synthetic references (30 speakers × 8 chunks) and hypotheses with a
  // known injected error rate, then check the recovered rates.
  const rnd = mulberry32(7);
  const vocab = 'the boy is getting cookies from the jar while the stool falls over and his mother washes dishes as the water runs onto the floor and the girl reaches for a cookie'.split(' ');
  const rows = [];
  const target = { dementia: 0.30, control: 0.15 };
  for (let s = 0; s < 30; s++) {
    const group = s < 15 ? 'dementia' : 'control';
    const mmse = group === 'dementia' ? 15 + Math.floor(rnd() * 10) : 26 + Math.floor(rnd() * 4);
    for (let c = 0; c < 8; c++) {
      const n = 8 + Math.floor(rnd() * 8);
      const ref = Array.from({ length: n }, () => vocab[Math.floor(rnd() * vocab.length)]);
      const hyp = [];
      for (const w of ref) {
        const u = rnd();
        if (u < target[group] / 2) continue;                              // deletion
        if (u < target[group]) { hyp.push('zzz'); continue; }             // substitution
        hyp.push(w);
      }
      rows.push({ speaker: `S${s}`, group, mmse, ref: ref.join(' '), hyp: hyp.join(' '), ms: 300 + Math.floor(rnd() * 200), durationS: 3 });
    }
  }
  // Inject decoder hallucinations with known rates: every 10th dementia
  // utterance becomes a runaway loop (10%), every 20th control utterance a stock
  // phrase (5%). The WER targets are then asserted on the "excluding" figures.
  const injected = { dementiaRunaway: 0, controlPhrase: 0, dementiaN: 0, controlN: 0 };
  rows.forEach((r, i) => {
    if (r.group === 'dementia') { injected.dementiaN++; if (i % 10 === 0) { r.hyp = `${r.hyp} ${'the boy is '.repeat(12)}`.trim(); injected.dementiaRunaway++; } }
    else { injected.controlN++; if (i % 20 === 0) { r.hyp = 'thank you'; injected.controlPhrase++; } }
  });
  const res = analyse(rows);
  const hd = res.strip.hallucination.byGroup.dementia, hc = res.strip.hallucination.byGroup.control;
  const d = hd.exclPooledWer, c = hc.exclPooledWer;
  const ok = Math.abs(d - 0.30) < 0.04 && Math.abs(c - 0.15) < 0.04 && res.strip.mw.p < 0.001 && res.strip.mw.delta > 0.8 && res.strip.rho.rho < -0.5;
  console.log(`self-test: dementia pooled WER excl. ${pct(d)} (target 30%), control ${pct(c)} (target 15%), full ${pct(res.strip.groups.dementia.pooledWer)} / ${pct(res.strip.groups.control.pooledWer)}, MW p=${pfmt(res.strip.mw.p)} δ=${fmt(res.strip.mw.delta, 2)}, ρ(WER,MMSE)=${fmt(res.strip.rho.rho, 2)} → ${ok ? 'OK' : 'FAILED'}`);
  const wantR = injected.dementiaRunaway / injected.dementiaN, wantP = injected.controlPhrase / injected.controlN;
  const hallOk = Math.abs(hd.runawayRate - wantR) < 0.01 && hd.repetitionRate >= wantR - 0.01 && Math.abs(hc.phraseRate - wantP) < 0.01
    && hc.runawayRate === 0 && res.strip.groups.dementia.pooledWer > d + 0.05;
  console.log(`self-test: hallucination rates recovered — dementia runaway ${pct(hd.runawayRate)} (injected ${pct(wantR)}), repetition ${pct(hd.repetitionRate)}, control phrase ${pct(hc.phraseRate)} (injected ${pct(wantP)}) → ${hallOk ? 'OK' : 'FAILED'}`);
  if (!hallOk) process.exit(1);
  // Sub-chunk merge: two VAD chunks of one utterance are concatenated in
  // sub_index order and scored once; a missing part makes the utterance missing.
  const refsM = [
    { chunk_path: 'a-0.wav', speaker_id: 'X', split: 't', group: 'control', mmse: '29', t0: '0', t1: '5000', duration_s: '2', ref_text: 'the boy takes a cookie', ref_text_fillers_kept: 'the boy takes a cookie', sub_index: '1', sub_count: '2' },
    { chunk_path: 'a-1.wav', speaker_id: 'X', split: 't', group: 'control', mmse: '29', t0: '0', t1: '5000', duration_s: '2', ref_text: 'the boy takes a cookie', ref_text_fillers_kept: 'the boy takes a cookie', sub_index: '0', sub_count: '2' },
    { chunk_path: 'b-0.wav', speaker_id: 'X', split: 't', group: 'control', mmse: '29', t0: '6000', t1: '9000', duration_s: '3', ref_text: 'the stool tips', ref_text_fillers_kept: 'the stool tips', sub_index: '0', sub_count: '1' },
    { chunk_path: 'c-0.wav', speaker_id: 'X', split: 't', group: 'control', mmse: '29', t0: '9000', t1: '12000', duration_s: '3', ref_text: 'water runs', ref_text_fillers_kept: 'water runs', sub_index: '0', sub_count: '2' },
    { chunk_path: 'c-1.wav', speaker_id: 'X', split: 't', group: 'control', mmse: '29', t0: '9000', t1: '12000', duration_s: '3', ref_text: 'water runs', ref_text_fillers_kept: 'water runs', sub_index: '1', sub_count: '2' },
  ];
  const hypsM = new Map([['a-0.wav', { hyp_text: 'a cookie', ms: '100' }], ['a-1.wav', { hyp_text: 'the boy takes', ms: '150' }], ['b-0.wav', { hyp_text: 'the stool tips', ms: '90' }], ['c-0.wav', { hyp_text: 'water', ms: '50' }]]);
  const m = mergeSubChunks(refsM, hypsM);
  const mergeOk = m.utterances === 3 && m.subChunks === 5 && m.missing === 1 && m.rows.length === 2
    && m.rows[0].hyp === 'the boy takes a cookie' && m.rows[0].ms === 250 && m.rows[0].durationS === 4 && wer(m.rows[0].ref, m.rows[0].hyp).wer === 0;
  console.log(`self-test: sub-chunk merge (3 utterances from 5 chunks, 1 missing, hypothesis order by sub_index) → ${mergeOk ? 'OK' : 'FAILED'}`);
  if (!mergeOk) process.exit(1);
  const md = reportMarkdown('synthetic', { chunks: rows.length, rows, missing: 0 }, res, []);
  // Single confusion word pairs are allowed; no run of three consecutive
  // reference words may appear anywhere in the report.
  let leaked = null;
  for (const r of rows) { const w = r.ref.split(' '); for (let i = 0; i + 3 <= w.length && !leaked; i++) { const t = w.slice(i, i + 3).join(' '); if (md.includes(t)) leaked = t; } if (leaked) break; }
  if (!leaked) console.log('self-test: report contains no transcript text (no 3-word reference run) → OK');
  else { console.log(`self-test: report leaked transcript text ("${leaked}") → FAILED`); process.exit(1); }
  const prof = errorProfile('synthetic', rows, res);
  if (Math.abs(prof.levels.ad.sub + prof.levels.ad.del - 0.30) > 0.04) { console.log('self-test: error profile mismatch → FAILED'); process.exit(1); }
  console.log(`self-test: error profile ad sub=${fmt(prof.levels.ad.sub)} del=${fmt(prof.levels.ad.del)} → OK`);
  if (!ok) process.exit(1);
}

function main() {
  if (SELF_TEST) return selfTest();
  if (!existsSync(REFERENCES)) { console.error(`references not found: ${REFERENCES}`); process.exit(1); }
  const hypFiles = argVal('--hyps')
    ? argVal('--hyps').split(',').map(p => resolve(ROOT, p))
    : readdirSync(DATA_DIR).filter(f => /^hyps_.*\.csv$/.test(f)).map(f => resolve(DATA_DIR, f));
  if (!hypFiles.length) { console.error('no hyps_*.csv found (run transcribe.mjs first)'); process.exit(1); }
  mkdirSync(OUT_DIR, { recursive: true });

  const perModel = [];
  for (const hp of hypFiles) {
    // Label from the CSV's own `model` column when it has one (the local path
    // writes `local:<name>`, the API path the OpenAI model id); the file name
    // is the fallback. File names never carry the colon.
    const fromFile = basename(hp).replace(/^hyps_|\.csv$/g, '');
    const meta = loadRows(REFERENCES, hp);
    const model = meta.modelLabel || fromFile;
    const res = analyse(meta.rows);
    perModel.push({ model, fileTag: model.replace(/[^A-Za-z0-9._-]+/g, '-'), meta, res });
  }
  for (const m of perModel) {
    const paired = [];
    for (const o of perModel) {
      if (o === m) continue;
      const mine = new Map(m.res.strip.speakers.map(s => [s.speaker, s.wer]));
      const diffs = o.res.strip.speakers.filter(s => mine.has(s.speaker) && s.wer != null && mine.get(s.speaker) != null).map(s => mine.get(s.speaker) - s.wer);
      if (diffs.length) paired.push({ other: o.model, n: diffs.length, delta: mean(diffs), w: wilcoxonSignedRank(diffs) });
    }
    const mdPath = resolve(OUT_DIR, `wer_${SHA}_${m.fileTag}.md`);
    const csvPath = resolve(OUT_DIR, `wer_${SHA}_${m.fileTag}.csv`);
    writeFileSync(mdPath, reportMarkdown(m.model, m.meta, m.res, paired));
    writeFileSync(csvPath, speakerCsv(m.res));
    const g = m.res.strip.groups;
    console.log(`${m.model.padEnd(26)} dementia ${pct(g.dementia?.meanWer)}  control ${pct(g.control?.meanWer)}  → ${mdPath}`);
    if (PROFILE_OUT && perModel.length && m === perModel[0]) {
      writeFileSync(resolve(ROOT, PROFILE_OUT), JSON.stringify(errorProfile(m.model, m.meta.rows, m.res), null, 2));
      console.log(`error profile (${m.model}) → ${PROFILE_OUT}`);
    }
  }
}

main();
