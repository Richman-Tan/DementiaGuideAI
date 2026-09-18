// Small, dependency-free statistics for the evaluation reports. Plain CommonJS
// so Jest and the .mjs runners share one implementation. Every function is
// documented with the situation it is meant for (docs/eval/evaluation-plan.md §14).
//
// Deliberately not a stats library: the report needs a handful of well-understood
// procedures, each hand-checked in stats.test.js against textbook values.

// ── Descriptives ─────────────────────────────────────────────────────────────
function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function sd(xs) {
  // Sample standard deviation (n − 1).
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

function quantile(xs, p) {
  // Linear interpolation between order statistics (type 7, the R/NumPy default).
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

function median(xs) {
  return quantile(xs, 0.5);
}

function summary(xs) {
  const clean = xs.filter(x => typeof x === 'number' && Number.isFinite(x));
  if (!clean.length) return { n: 0 };
  return {
    n: clean.length,
    mean: mean(clean),
    median: median(clean),
    p90: quantile(clean, 0.9),
    p95: quantile(clean, 0.95),
    min: Math.min(...clean),
    max: Math.max(...clean),
    sd: sd(clean),
  };
}

// ── Proportions ──────────────────────────────────────────────────────────────
// Wilson score interval — the right interval for small n and rates near 0 or 1
// (a normal approximation would give CIs outside [0, 1] for a 36/36 pass rate).
function wilson(k, n, z = 1.96) {
  if (!n) return { p: null, lo: null, hi: null, n: 0, k: 0 };
  const p = k / n;
  const denom = 1 + z * z / n;
  const centre = (p + z * z / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half), n, k };
}

// ── Exact binomial (two-sided) — sign test and McNemar for small discordant counts
function logChoose(n, k) {
  let r = 0;
  for (let i = 1; i <= k; i++) r += Math.log(n - k + i) - Math.log(i);
  return r;
}

function binomialTwoSidedP(k, n, p = 0.5) {
  if (n === 0) return 1;
  const pmf = (i) => Math.exp(logChoose(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p));
  const observed = pmf(k);
  // Two-sided: sum of all outcomes at most as likely as the observed one.
  let total = 0;
  for (let i = 0; i <= n; i++) {
    const pi = pmf(i);
    if (pi <= observed * (1 + 1e-9)) total += pi;
  }
  return Math.min(1, total);
}

function signTest(positives, negatives) {
  const n = positives + negatives;
  return { n, positives, negatives, p: binomialTwoSidedP(positives, n) };
}

// McNemar's test on paired binary outcomes. `b` = pass under A but fail under B,
// `c` = fail under A but pass under B. Exact binomial on the discordant pairs
// (the recommended form when b + c < 25) plus the continuity-corrected chi-square.
function mcnemar(b, c) {
  const n = b + c;
  const exactP = binomialTwoSidedP(b, n);
  const chi2 = n ? ((Math.abs(b - c) - 1) ** 2) / n : null;
  return { b, c, discordant: n, exactP, chi2 };
}

// ── Wilcoxon signed-rank (paired ordinal/continuous) ─────────────────────────
// Returns W+ / W−, the normal-approximation p (with tie correction and continuity
// correction), and the matched-pairs rank-biserial correlation as effect size.
// For n < 10 report the statistic and defer to exact tables — the protocol only
// admits the test at ≥ 10 pairs anyway.
function rankWithTies(values) {
  const idx = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(values.length);
  let i = 0;
  const tieGroups = [];
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j + 2) / 2; // ranks are 1-based
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = avg;
    if (j > i) tieGroups.push(j - i + 1);
    i = j + 1;
  }
  return { ranks, tieGroups };
}

function normalCdf(z) {
  // Φ(z) = ½(1 + erf(z/√2)); erf via Abramowitz–Stegun 7.1.26 (|error| < 1.5e-7).
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x);
  return z < 0 ? 0.5 * (1 - erf) : 0.5 * (1 + erf);
}

function wilcoxonSignedRank(diffs) {
  const nonZero = diffs.filter(d => d !== 0);
  const n = nonZero.length;
  if (n === 0) return { n: 0, wPlus: 0, wMinus: 0, p: 1, rankBiserial: 0, note: 'all differences zero' };
  const { ranks, tieGroups } = rankWithTies(nonZero.map(Math.abs));
  let wPlus = 0, wMinus = 0;
  nonZero.forEach((d, i) => { if (d > 0) wPlus += ranks[i]; else wMinus += ranks[i]; });
  const total = wPlus + wMinus;
  const rankBiserial = (wPlus - wMinus) / total; // matched-pairs rank-biserial r
  const meanW = n * (n + 1) / 4;
  const tieTerm = tieGroups.reduce((s, t) => s + (t ** 3 - t), 0) / 48;
  const varW = n * (n + 1) * (2 * n + 1) / 24 - tieTerm;
  const w = Math.min(wPlus, wMinus);
  const z = varW > 0 ? (w - meanW + 0.5) / Math.sqrt(varW) : 0;
  const p = Math.min(1, 2 * normalCdf(z));
  return { n, wPlus, wMinus, z, p, rankBiserial, approx: 'normal', note: n < 10 ? 'n < 10: use exact tables' : undefined };
}

// ── Inter-rater agreement ────────────────────────────────────────────────────
// Cohen's kappa with optional linear/quadratic weights for ordinal scales.
// Categories default to the sorted union of observed labels; pass them
// explicitly (e.g. [0,1,2]) so an unused category still shapes the weights.
function cohenKappa(a, b, { weights = 'none', categories } = {}) {
  const pairs = a.map((x, i) => [x, b[i]]).filter(([x, y]) => x != null && y != null && x !== '' && y !== '');
  const n = pairs.length;
  if (!n) return { n: 0, kappa: null, agreement: null };
  const cats = categories ?? [...new Set(pairs.flat())].sort((x, y) => (Number(x) - Number(y)) || String(x).localeCompare(String(y)));
  const k = cats.length;
  const index = new Map(cats.map((c, i) => [c, i]));
  const obs = Array.from({ length: k }, () => new Array(k).fill(0));
  for (const [x, y] of pairs) obs[index.get(x)][index.get(y)] += 1;
  const rowSum = obs.map(r => r.reduce((s, v) => s + v, 0));
  const colSum = cats.map((_, j) => obs.reduce((s, r) => s + r[j], 0));
  const w = (i, j) => {
    if (weights === 'none') return i === j ? 0 : 1;
    const d = Math.abs(i - j) / Math.max(1, k - 1);
    return weights === 'quadratic' ? d * d : d;
  };
  let disObs = 0, disExp = 0;
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      disObs += w(i, j) * obs[i][j] / n;
      disExp += w(i, j) * (rowSum[i] / n) * (colSum[j] / n);
    }
  }
  const agreement = pairs.filter(([x, y]) => x === y).length / n;
  const kappa = disExp === 0 ? null : 1 - disObs / disExp;
  return { n, kappa, agreement, weights, categories: cats };
}

// ── Bootstrap CI for any statistic (seeded, reproducible) ────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bootstrapCI(xs, stat = mean, { iters = 2000, seed = 42, alpha = 0.05 } = {}) {
  if (!xs.length) return { lo: null, hi: null };
  const rnd = mulberry32(seed);
  const stats = [];
  for (let i = 0; i < iters; i++) {
    const sample = xs.map(() => xs[Math.floor(rnd() * xs.length)]);
    stats.push(stat(sample));
  }
  return { lo: quantile(stats, alpha / 2), hi: quantile(stats, 1 - alpha / 2), iters, seed };
}

// Seeded Fisher–Yates — used for blinded sheet ordering and pairwise position swaps.
function seededShuffle(items, seed = 42) {
  const rnd = mulberry32(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Holm–Bonferroni step-down adjustment. Takes p-values in any order and returns
// adjusted p-values in the SAME order, so a caller can zip them back onto its
// rows. Adjusted values are monotone in the sorted order and capped at 1, which
// is what makes Holm uniformly more powerful than Bonferroni while controlling
// the family-wise error rate under arbitrary dependence.
//
// The family is the caller's choice and it is the part that matters: adjusting
// across an arbitrary pile of tests is as misleading as not adjusting at all.
// Non-finite entries are passed through as null and excluded from the family
// size, so a table with "—" cells adjusts over its real tests only.
function holm(pvalues) {
  const live = [];
  for (let i = 0; i < pvalues.length; i++) {
    const v = pvalues[i];
    if (typeof v === 'number' && Number.isFinite(v)) live.push([v, i]);
  }
  const m = live.length;
  const out = new Array(pvalues.length).fill(null);
  live.sort((a, b) => a[0] - b[0]);
  let running = 0;
  live.forEach(([v, idx], k) => {
    running = Math.max(running, Math.min(1, (m - k) * v));
    out[idx] = running;
  });
  return out;
}

module.exports = {
  mean, sd, quantile, median, summary,
  wilson, binomialTwoSidedP, signTest, mcnemar,
  wilcoxonSignedRank, cohenKappa, bootstrapCI, seededShuffle, mulberry32,
  holm,
};
