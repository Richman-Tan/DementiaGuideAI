#!/usr/bin/env node
// G2P vs character-heuristic ablation for the viseme timeline, JS-only.
//
// Loads the production createVisemeTimeline twice through the same regex ESM
// loader the Unity tools use: once as shipped (G2P lexicon on) and once with
// g2p.js overridden so wordToPhonemes() returns null for every word — which is
// exactly the pre-2026-07-12 behaviour (the char/digraph heuristics are still
// the out-of-vocabulary fallback in production, so no other code path changes).
// Both arms share an identical synthetic character alignment, so only the
// phonemiser differs.
//
// Metrics per sentence and aggregated:
//   * normalised viseme-sequence edit distance (how much the mouth-shape
//     sequence changed);
//   * articulator-class confusion (what the heuristic renders when the lexicon
//     says bilabial / labiodental / dental);
//   * closure coverage: share of words whose dictionary phones contain a
//     visible closure (P/B/M, F/V, TH/DH) for which each arm produced that
//     viseme inside the word span — the heuristic's miss rate is the finding;
//   * out-of-vocabulary rate (words where both arms are identical by design).
// Ground truth is the pruned CMUdict lexicon itself, so state the result as
// "divergence of the spelling heuristic from dictionary phonology", not as
// accuracy against recorded speech.
//
//   node scripts/lipsync/g2p-ablation.mjs [--sentences 50] [--seconds-per-char 0.055] [--source kb|path.txt] [--seed 42] [--tag t] [--out-dir docs/report/eval/lipsync]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const { loadModule } = require(resolve(ROOT, 'unity-avatar/tools/esm-loader.js'));
const L = require('./lib.js');
const { wilson, seededShuffle, summary } = require(resolve(ROOT, 'scripts/eval/lib/stats.js'));

const args = process.argv.slice(2);
const argVal = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };
const N = Number(argVal('--sentences') ?? 50);
const SPC = Number(argVal('--seconds-per-char') ?? 0.055);
const SOURCE = argVal('--source') ?? 'kb';
const SEED = Number(argVal('--seed') ?? 42);
const TAG = argVal('--tag') ?? 'kb';
const OUT_DIR = resolve(ROOT, argVal('--out-dir') ?? 'docs/report/eval/lipsync');

const LIPSYNC = resolve(ROOT, 'packages/core/lipsync');
const real = loadModule('createVisemeTimeline.js', LIPSYNC);
const ablated = loadModule('createVisemeTimeline.js', LIPSYNC, { overrides: { 'g2p.js': { wordToPhonemes: () => null } } });
const { wordToPhonemes } = loadModule('g2p/g2p.js', LIPSYNC);

function sentencesFromKb() {
  const { KNOWLEDGE_BASE } = loadModule(resolve(ROOT, 'apps/mobile/src/features/library/data/knowledgeBase.js'));
  const out = [];
  for (const chunk of KNOWLEDGE_BASE) {
    for (const s of chunk.content.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/)) {
      const words = s.match(/[A-Za-z']+/g) ?? [];
      if (words.length >= 6 && words.length <= 22 && !/\d/.test(s) && !/[()—:;"]/.test(s)) out.push(s.trim());
    }
  }
  return seededShuffle(out, SEED).slice(0, N);
}
const sentences = SOURCE === 'kb' ? sentencesFromKb() : readFileSync(resolve(ROOT, SOURCE), 'utf8').split('\n').map(s => s.trim()).filter(Boolean).slice(0, N);

const perSentence = [];
const agg = { words: 0, oov: 0, dist: 0, len: 0, changed: 0, confusion: {}, cov: { g2p: {}, heur: {} } };
const addCov = (target, cov) => { for (const [cls, v] of Object.entries(cov)) { target[cls] ??= { expected: 0, produced: 0, missed: [], notExpected: 0, falsePositive: 0, spurious: [] }; target[cls].expected += v.expected; target[cls].produced += v.produced; target[cls].missed.push(...v.missed); target[cls].notExpected += v.notExpected; target[cls].falsePositive += v.falsePositive; target[cls].spurious.push(...v.spurious); } };
let insertions = 0, deletions = 0, substitutions = 0, matches = 0;

for (const text of sentences) {
  const al = L.syntheticAlignment(text, SPC);
  const tG = real.createVisemeTimeline(al);
  const tH = ablated.createVisemeTimeline(al);
  const seqG = L.visemeSequence(tG.frames), seqH = L.visemeSequence(tH.frames);
  const dist = L.levenshtein(seqG, seqH);
  const conf = L.classConfusion(seqG, seqH);
  for (const [r, cols] of Object.entries(conf.matrix)) for (const [c, n] of Object.entries(cols)) { (agg.confusion[r] ??= {})[c] = (agg.confusion[r][c] ?? 0) + n; }
  insertions += conf.insertions; deletions += conf.deletions; substitutions += conf.substitutions; matches += conf.matches;
  const spans = L.wordSpans(al.characters, al.character_start_times_seconds, al.character_end_times_seconds);
  const oov = spans.filter(s => !wordToPhonemes(s.word)).length;
  const covG = L.closureCoverage(spans, wordToPhonemes, tG.frames);
  const covH = L.closureCoverage(spans, wordToPhonemes, tH.frames);
  addCov(agg.cov.g2p, covG); addCov(agg.cov.heur, covH);
  agg.words += spans.length; agg.oov += oov; agg.dist += dist; agg.len += Math.max(seqG.length, seqH.length); agg.changed += conf.substitutions + conf.insertions + conf.deletions;
  perSentence.push({ text, words: spans.length, oov, seqLenG2p: seqG.length, seqLenHeur: seqH.length, editDistance: dist, normalised: Math.max(seqG.length, seqH.length) ? dist / Math.max(seqG.length, seqH.length) : 0,
    bilabialExpected: covG.bilabial.expected, bilabialMissedHeur: covH.bilabial.missed.length, labiodentalExpected: covG.labiodental.expected, labiodentalMissedHeur: covH.labiodental.missed.length, dentalExpected: covG.tongue.expected, dentalMissedHeur: covH.tongue.missed.length });
}

const pct = (w) => `${(100 * w.p).toFixed(1)}% [${(100 * w.lo).toFixed(1)}–${(100 * w.hi).toFixed(1)}] (${w.k}/${w.n})`;
const norm = summary(perSentence.map(s => s.normalised));
const md = [`# G2P vs character-heuristic ablation — ${TAG}`, '',
  `${sentences.length} sentences from ${SOURCE === 'kb' ? 'the curated knowledge base (seeded sample)' : SOURCE}, synthetic alignment at ${SPC} s/char, both arms share the alignment. Ground truth = the pruned CMUdict lexicon; words outside it (OOV) are identical in both arms by construction.`, '',
  '| Measure | Value |', '|---|---|',
  `| Words | ${agg.words} (OOV ${pct(wilson(agg.oov, agg.words))}) |`,
  `| Viseme labels changed by G2P (edit ops / longer sequence) | ${(100 * agg.dist / Math.max(1, agg.len)).toFixed(1)}% |`,
  `| Normalised edit distance per sentence | median ${norm.median.toFixed(3)}, mean ${norm.mean.toFixed(3)}, p90 ${norm.p90.toFixed(3)} |`,
  `| Bilabial closures (P/B/M words) produced — G2P | ${pct(wilson(agg.cov.g2p.bilabial.produced, agg.cov.g2p.bilabial.expected))} |`,
  `| Bilabial closures produced — heuristic | ${pct(wilson(agg.cov.heur.bilabial.produced, agg.cov.heur.bilabial.expected))} |`,
  `| Labiodental (F/V) produced — G2P / heuristic | ${pct(wilson(agg.cov.g2p.labiodental.produced, agg.cov.g2p.labiodental.expected))} / ${pct(wilson(agg.cov.heur.labiodental.produced, agg.cov.heur.labiodental.expected))} |`,
  `| Dental (TH/DH) produced — G2P / heuristic | ${pct(wilson(agg.cov.g2p.tongue.produced, agg.cov.g2p.tongue.expected))} / ${pct(wilson(agg.cov.heur.tongue.produced, agg.cov.heur.tongue.expected))} |`,
  `| False bilabial closure in words with no P/B/M — G2P / heuristic | ${pct(wilson(agg.cov.g2p.bilabial.falsePositive, agg.cov.g2p.bilabial.notExpected))} / ${pct(wilson(agg.cov.heur.bilabial.falsePositive, agg.cov.heur.bilabial.notExpected))} |`,
  `| False labiodental in words with no F/V — G2P / heuristic | ${pct(wilson(agg.cov.g2p.labiodental.falsePositive, agg.cov.g2p.labiodental.notExpected))} / ${pct(wilson(agg.cov.heur.labiodental.falsePositive, agg.cov.heur.labiodental.notExpected))} |`,
  `| Heuristic mouth shapes with no phoneme counterpart (spurious, e.g. silent letters) | ${pct(wilson(insertions, matches + substitutions + insertions))} of heuristic shapes |`,
  `| Phoneme shapes the heuristic never produced (missing) | ${pct(wilson(deletions, matches + substitutions + deletions))} of G2P shapes |`,
  `| Shape substitutions (different viseme at the same position) | ${pct(wilson(substitutions, matches + substitutions))} of aligned shapes |`,
  '', '## Class confusion (rows = G2P arm, columns = heuristic arm; counts of aligned visemes)', ''];
const classes = [...new Set([...Object.keys(agg.confusion), ...Object.values(agg.confusion).flatMap(o => Object.keys(o))])].sort();
md.push(`| G2P \\ heuristic | ${classes.join(' | ')} |`, `|---|${classes.map(() => '---').join('|')}|`);
for (const r of classes) md.push(`| ${r} | ${classes.map(c => agg.confusion[r]?.[c] ?? 0).join(' | ')} |`);
const missedH = [...new Set(agg.cov.heur.bilabial.missed)].slice(0, 40);
const spuriousH = [...new Set([...agg.cov.heur.bilabial.spurious, ...agg.cov.heur.labiodental.spurious])].slice(0, 40);
md.push('', `Bilabial words the heuristic missed (first ${missedH.length}): ${missedH.join(', ') || '(none)'}`,
  `Words where the heuristic produced a closure the dictionary does not have (first ${spuriousH.length}): ${spuriousH.join(', ') || '(none)'}`, '');

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, `g2p-ablation_${TAG}.md`), md.join('\n') + '\n');
const cols = Object.keys(perSentence[0]);
writeFileSync(resolve(OUT_DIR, `g2p-ablation_${TAG}.csv`), [cols.join(','), ...perSentence.map(r => cols.map(c => /[",\n]/.test(String(r[c])) ? `"${String(r[c]).replace(/"/g, '""')}"` : r[c]).join(','))].join('\n') + '\n');
console.log(md.join('\n'));
console.log(`\nWrote ${OUT_DIR}/g2p-ablation_${TAG}.{md,csv}`);
