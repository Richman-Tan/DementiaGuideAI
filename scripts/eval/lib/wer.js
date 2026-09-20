// Word error rate for the speech-recognition evaluation (E9, DementiaBank).
// Normalisation, Levenshtein alignment with backtrace, per-speaker aggregation
// and the small non-parametric tests the report needs. Plain CommonJS so Jest
// and the .mjs runners can both load it. No network, no dependencies.
//
// The reference values in wer.test.js were cross-checked against jiwer
// (scripts/eval/stt/prepare-adress.py --jiwer-check).
const { mean, bootstrapCI, quantile } = require('./stats.js');

// Local copies of two stats.js internals (not exported there): average ranks
// with ties, and Φ(z) via Abramowitz–Stegun 7.1.26.
function rankWithTies(values) {
  const idx = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(values.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = avg;
    i = j + 1;
  }
  return ranks;
}

function normalCdf(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x);
  return z < 0 ? 0.5 * (1 - erf) : 0.5 * (1 + erf);
}

// ── Normalisation ─────────────────────────────────────────────────────────────
// Fillers: what whisper-1 drops by design, so they are stripped from BOTH sides
// under the primary policy. 'keep' is the secondary policy: whatever the
// recogniser returns goes into RAG untouched (packages/core/rag/prompt.js:154).
const FILLERS = new Set(['uh', 'um', 'er', 'ah', 'mm', 'hmm', 'mhm', 'uhm', 'umm', 'erm', 'eh', 'hm']);

const CONTRACTIONS = [
  [/\bwon't\b/g, 'will not'], [/\bcan't\b/g, 'can not'], [/\bshan't\b/g, 'shall not'],
  [/\bain't\b/g, 'is not'], [/n't\b/g, ' not'], // no leading \b: "don't" has no boundary before the n
  [/\b(\w+)'re\b/g, '$1 are'], [/\b(\w+)'ve\b/g, '$1 have'], [/\b(\w+)'ll\b/g, '$1 will'],
  [/\b(\w+)'d\b/g, '$1 would'], [/\bi'm\b/g, 'i am'], [/\b(it|he|she|that|there|what|who|where|here)'s\b/g, '$1 is'],
  [/\blet's\b/g, 'let us'],
];

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

// Small integers only (0–999). Larger numbers are left as digits: a WER on a
// picture-description task never sees them, and spelling "1990" is ambiguous.
function numberToWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + numberToWords(n % 100) : '');
  return String(n);
}

function normalize(text, { fillers = 'strip' } = {}) {
  let s = String(text ?? '').toLowerCase();
  s = s.replace(/[’‘`]/g, "'");
  for (const [re, rep] of CONTRACTIONS) s = s.replace(re, rep);
  // Apostrophes left inside a word after expansion are possessives or the
  // recogniser's spelling choice ("window's" vs "windows", "mother's" vs
  // "mothers"): drop them so the two are not scored as a substitution.
  s = s.replace(/(\w)'+(\w)/g, '$1$2');
  s = s.replace(/\b(\d{1,3})\b/g, (_, d) => numberToWords(Number(d)));
  s = s.replace(/-/g, ' ');
  s = s.replace(/[^a-z0-9' ]+/g, ' ');
  s = s.replace(/(^|\s)'+|'+(\s|$)/g, '$1$2'); // stray quotes
  let out = s.split(/\s+/).filter(Boolean);
  if (fillers === 'strip') out = out.filter(w => !FILLERS.has(w));
  return out;
}

// ── Alignment ─────────────────────────────────────────────────────────────────
// Standard Levenshtein over word arrays; the backtrace prefers substitution over
// insertion over deletion on ties, which is jiwer's convention and what makes
// the S/D/I decomposition comparable with the literature.
function align(ref, hyp) {
  const n = ref.length, m = hyp.length;
  const d = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sub = d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1);
      d[i][j] = Math.min(sub, d[i - 1][j] + 1, d[i][j - 1] + 1);
    }
  }
  const pairs = [];
  let i = n, j = m, S = 0, D = 0, I = 0, H = 0;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1)) {
      if (ref[i - 1] === hyp[j - 1]) { H++; pairs.push({ op: 'H', ref: ref[i - 1], hyp: hyp[j - 1] }); }
      else { S++; pairs.push({ op: 'S', ref: ref[i - 1], hyp: hyp[j - 1] }); }
      i--; j--;
    } else if (j > 0 && d[i][j] === d[i][j - 1] + 1) {
      I++; pairs.push({ op: 'I', ref: null, hyp: hyp[j - 1] }); j--;
    } else {
      D++; pairs.push({ op: 'D', ref: ref[i - 1], hyp: null }); i--;
    }
  }
  pairs.reverse();
  return { S, D, I, H, N: n, errors: S + D + I, pairs };
}

function wer(refText, hypText, opts = {}) {
  const ref = Array.isArray(refText) ? refText : normalize(refText, opts);
  const hyp = Array.isArray(hypText) ? hypText : normalize(hypText, opts);
  const a = align(ref, hyp);
  // An empty reference has no defined WER; report null rather than divide by zero.
  const rate = a.N === 0 ? (a.I === 0 ? 0 : null) : a.errors / a.N;
  return { ...a, wer: rate };
}

// ── Tests over speakers ───────────────────────────────────────────────────────
// Mann–Whitney U (normal approximation with tie correction) and Cliff's δ.
// The per-speaker sample sizes here (78 vs 78) make the approximation fine.
function mannWhitney(a, b) {
  const n1 = a.length, n2 = b.length;
  if (!n1 || !n2) return { U: null, z: null, p: null, delta: null, n1, n2 };
  const ranks = rankWithTies([...a, ...b]);
  const R1 = ranks.slice(0, n1).reduce((s, r) => s + r, 0);
  const U1 = R1 - n1 * (n1 + 1) / 2;
  const U2 = n1 * n2 - U1;
  const U = Math.min(U1, U2);
  const N = n1 + n2;
  // tie correction
  const counts = new Map();
  for (const v of [...a, ...b]) counts.set(v, (counts.get(v) ?? 0) + 1);
  let tieSum = 0;
  for (const t of counts.values()) tieSum += t * t * t - t;
  const sigma = Math.sqrt(n1 * n2 / 12 * ((N + 1) - tieSum / (N * (N - 1))));
  const mu = n1 * n2 / 2;
  const z = sigma === 0 ? 0 : (U1 - mu) / sigma;
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  // Cliff's δ: P(a > b) − P(a < b)
  let more = 0, less = 0;
  for (const x of a) for (const y of b) { if (x > y) more++; else if (x < y) less++; }
  const delta = (more - less) / (n1 * n2);
  return { U, U1, U2, z, p, delta, n1, n2 };
}

function spearman(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return { rho: null, p: null, n };
  const rx = rankWithTies(xs.slice(0, n));
  const ry = rankWithTies(ys.slice(0, n));
  const mx = mean(rx), my = mean(ry);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  const rho = dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy);
  // t approximation for the p-value
  const t = rho * Math.sqrt((n - 2) / Math.max(1e-12, 1 - rho * rho));
  const p = 2 * (1 - normalCdf(Math.abs(t))); // normal approx of t for n ≳ 30
  return { rho, p, n };
}

// ── Aggregation ───────────────────────────────────────────────────────────────
// rows: [{ speaker, group, mmse, ref, hyp }] (ref/hyp raw strings).
// Per-chunk WER is computed, then pooled per speaker (total errors / total
// reference words — the corpus-level definition, so long chunks weigh more),
// then summarised per group with a bootstrap CI over speakers. The speaker is
// the unit of analysis: 156 speakers, not 4,077 chunks.
function aggregate(rows, { fillers = 'strip', seed = 42 } = {}) {
  const bySpeaker = new Map();
  const confusions = new Map();
  const deleted = new Map();
  const perChunk = [];
  for (const r of rows) {
    const a = wer(r.ref, r.hyp, { fillers });
    perChunk.push({ ...r, ...a, pairs: undefined });
    const s = bySpeaker.get(r.speaker) ?? { speaker: r.speaker, group: r.group, mmse: r.mmse, N: 0, S: 0, D: 0, I: 0, chunks: 0 };
    s.N += a.N; s.S += a.S; s.D += a.D; s.I += a.I; s.chunks += 1;
    bySpeaker.set(r.speaker, s);
    for (const p of a.pairs) {
      if (p.op === 'S') { const k = `${p.ref}→${p.hyp}`; confusions.set(k, (confusions.get(k) ?? 0) + 1); }
      if (p.op === 'D') deleted.set(p.ref, (deleted.get(p.ref) ?? 0) + 1);
    }
  }
  const speakers = [...bySpeaker.values()].map(s => ({ ...s, wer: s.N ? (s.S + s.D + s.I) / s.N : null }));
  const groups = {};
  for (const g of new Set(speakers.map(s => s.group))) {
    const xs = speakers.filter(s => s.group === g && s.wer != null).map(s => s.wer);
    const tot = speakers.filter(s => s.group === g).reduce((acc, s) => ({ N: acc.N + s.N, S: acc.S + s.S, D: acc.D + s.D, I: acc.I + s.I }), { N: 0, S: 0, D: 0, I: 0 });
    groups[g] = {
      speakers: xs.length,
      meanWer: xs.length ? mean(xs) : null,
      medianWer: xs.length ? quantile(xs, 0.5) : null,
      ci: bootstrapCI(xs, mean, { seed }),
      pooledWer: tot.N ? (tot.S + tot.D + tot.I) / tot.N : null,
      subRate: tot.N ? tot.S / tot.N : null,
      delRate: tot.N ? tot.D / tot.N : null,
      insRate: tot.N ? tot.I / tot.N : null,
      refWords: tot.N,
    };
  }
  const topConfusions = [...confusions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, n]) => { const [ref, hyp] = k.split('→'); return { ref, hyp, n }; });
  const topDeleted = [...deleted.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([w, n]) => ({ word: w, n }));
  return { speakers, groups, topConfusions, topDeleted, perChunk };
}

const FUNCTION_WORDS = new Set(('a an the and or but of to in on at by for with from as is are was were be been being it its this that these those he she they them his her their we you i me my our your do does did not no yes so if then than there here what which who whom when where how up down out off over under into about'.split(' ')));

// Share of deletions that are function words vs content words — dementia
// speech recognisers tend to drop function words; if content words go missing
// the query the embedder sees loses its meaning, not just its grammar.
function deletionClasses(aggregated) {
  let fn = 0, content = 0;
  for (const chunk of aggregated.perChunk) {
    // perChunk had pairs stripped; recompute cheaply from the alignment
    const a = wer(chunk.ref, chunk.hyp, {});
    for (const p of a.pairs) if (p.op === 'D') { if (FUNCTION_WORDS.has(p.ref)) fn++; else content++; }
  }
  const total = fn + content;
  return { functionWordDeletions: fn, contentWordDeletions: content, functionShare: total ? fn / total : null };
}

module.exports = { normalize, align, wer, aggregate, mannWhitney, spearman, deletionClasses, FILLERS, FUNCTION_WORDS, numberToWords };
