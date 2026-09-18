const S = require('./stats');

// Hand-computed expectations; do not regenerate from the implementation.

describe('descriptives', () => {
  it('quantile uses linear interpolation (type 7)', () => {
    expect(S.median([1, 2, 3, 4])).toBe(2.5);
    expect(S.quantile([1, 2, 3, 4], 0.9)).toBeCloseTo(3.7);
    expect(S.quantile([5], 0.95)).toBe(5);
  });
  it('summary reports n, mean, median, p90, p95, sd and drops non-numbers', () => {
    const s = S.summary([2, 4, 4, 4, 5, 5, 7, 9, null, 'x']);
    expect(s.n).toBe(8);
    expect(s.mean).toBe(5);
    expect(s.sd).toBeCloseTo(2.138, 3); // sample sd of the classic 2,4,4,4,5,5,7,9
    expect(s.min).toBe(2);
    expect(s.max).toBe(9);
  });
});

describe('wilson interval', () => {
  it('is [0.904, 1] for 36/36 at 95%', () => {
    const w = S.wilson(36, 36);
    expect(w.p).toBe(1);
    expect(w.lo).toBeCloseTo(0.9036, 3);
    expect(w.hi).toBe(1);
  });
  it('is symmetric-ish around 0.5 for 5/10', () => {
    const w = S.wilson(5, 10);
    expect(w.lo).toBeCloseTo(0.2366, 3);
    expect(w.hi).toBeCloseTo(0.7634, 3);
  });
  it('handles n = 0', () => {
    expect(S.wilson(0, 0).p).toBeNull();
  });
});

describe('exact binomial, sign test, McNemar', () => {
  it('two-sided p for 0 of 5 is 0.0625', () => {
    expect(S.binomialTwoSidedP(0, 5)).toBeCloseTo(0.0625, 6);
  });
  it('two-sided p for 2 of 4 is 1', () => {
    expect(S.binomialTwoSidedP(2, 4)).toBeCloseTo(1, 6);
  });
  it('McNemar exact p on 8 vs 0 discordant pairs is 2/256', () => {
    const m = S.mcnemar(8, 0);
    expect(m.exactP).toBeCloseTo(0.0078125, 6);
    expect(m.chi2).toBeCloseTo((7 ** 2) / 8, 6);
  });
  it('sign test wraps the binomial', () => {
    expect(S.signTest(7, 1).p).toBeCloseTo(S.binomialTwoSidedP(7, 8), 9);
  });
});

describe('Wilcoxon signed-rank', () => {
  it('all-positive differences give W- = 0 and rank-biserial 1', () => {
    const r = S.wilcoxonSignedRank([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(r.wPlus).toBe(55);
    expect(r.wMinus).toBe(0);
    expect(r.rankBiserial).toBe(1);
    // z = (0 − 27.5 + 0.5) / sqrt(96.25) = −2.752 → two-sided p ≈ 0.0059
    expect(r.p).toBeCloseTo(0.0059, 3);
  });
  it('ignores zero differences and flags n < 10', () => {
    const r = S.wilcoxonSignedRank([0, 0, 1, -1, 2]);
    expect(r.n).toBe(3);
    expect(r.note).toMatch(/n < 10/);
  });
  it('balanced differences give rank-biserial 0 and p 1', () => {
    const r = S.wilcoxonSignedRank([1, -1, 2, -2]);
    expect(r.rankBiserial).toBe(0);
    expect(r.p).toBeCloseTo(1, 1);
  });
});

describe("Cohen's kappa", () => {
  it('matches the textbook 2×2 example (po 0.70, pe 0.50 → κ 0.40)', () => {
    // Rater A vs B: 20 both yes, 15 both no, 5 A-yes/B-no, 10 A-no/B-yes.
    const a = [...Array(20).fill('y'), ...Array(5).fill('y'), ...Array(10).fill('n'), ...Array(15).fill('n')];
    const b = [...Array(20).fill('y'), ...Array(5).fill('n'), ...Array(10).fill('y'), ...Array(15).fill('n')];
    const k = S.cohenKappa(a, b);
    expect(k.n).toBe(50);
    expect(k.agreement).toBeCloseTo(0.7, 9);
    expect(k.kappa).toBeCloseTo(0.4, 9);
  });
  it('perfect agreement is κ = 1 under every weighting', () => {
    expect(S.cohenKappa([0, 1, 2, 2], [0, 1, 2, 2]).kappa).toBe(1);
    expect(S.cohenKappa([0, 1, 2, 2], [0, 1, 2, 2], { weights: 'quadratic' }).kappa).toBe(1);
  });
  it('quadratic weights penalise near-misses less than unweighted', () => {
    const a = [0, 1, 2, 0, 1, 2, 0, 1, 2];
    const b = [0, 1, 2, 1, 2, 2, 0, 0, 1];
    const plain = S.cohenKappa(a, b, { categories: [0, 1, 2] }).kappa;
    const quad = S.cohenKappa(a, b, { weights: 'quadratic', categories: [0, 1, 2] }).kappa;
    expect(quad).toBeGreaterThan(plain);
  });
  it('skips rows where either rating is missing', () => {
    expect(S.cohenKappa([1, 2, null], [1, 2, 2]).n).toBe(2);
  });
});

describe('bootstrap and shuffle are seeded', () => {
  it('bootstrap CI brackets the sample mean and is reproducible', () => {
    const xs = [3, 5, 7, 9, 11, 13];
    const a = S.bootstrapCI(xs, S.mean, { iters: 500, seed: 7 });
    const b = S.bootstrapCI(xs, S.mean, { iters: 500, seed: 7 });
    expect(a).toEqual(b);
    expect(a.lo).toBeLessThan(8);
    expect(a.hi).toBeGreaterThan(8);
  });
  it('seededShuffle is deterministic and a permutation', () => {
    const s1 = S.seededShuffle([1, 2, 3, 4, 5], 3);
    const s2 = S.seededShuffle([1, 2, 3, 4, 5], 3);
    expect(s1).toEqual(s2);
    expect([...s1].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('holm–bonferroni', () => {
  it('matches R p.adjust(method="holm") on a textbook vector', () => {
    // R: p.adjust(c(0.01, 0.02, 0.03, 0.04, 0.05), method = "holm")
    //    -> 0.05 0.08 0.09 0.09 0.09
    const adj = S.holm([0.01, 0.02, 0.03, 0.04, 0.05]);
    expect(adj[0]).toBeCloseTo(0.05, 10);
    expect(adj[1]).toBeCloseTo(0.08, 10);
    expect(adj[2]).toBeCloseTo(0.09, 10);
    expect(adj[3]).toBeCloseTo(0.09, 10);
    expect(adj[4]).toBeCloseTo(0.09, 10);
  });
  it('returns adjusted values in the caller\'s original order', () => {
    const adj = S.holm([0.05, 0.01, 0.03]);
    // sorted: 0.01 (x3) = 0.03, 0.03 (x2) = 0.06, 0.05 (x1) = 0.05 -> monotone 0.06
    expect(adj[1]).toBeCloseTo(0.03, 10);
    expect(adj[2]).toBeCloseTo(0.06, 10);
    expect(adj[0]).toBeCloseTo(0.06, 10);
  });
  it('is monotone non-decreasing in the sorted order and capped at 1', () => {
    const adj = S.holm([0.4, 0.5, 0.6]);
    expect(adj.every(v => v <= 1)).toBe(true);
    const sorted = [...adj].sort((a, b) => a - b);
    expect(sorted).toEqual([...adj].sort((a, b) => a - b));
    expect(Math.max(...adj)).toBe(1);
  });
  it('leaves a single test unchanged', () => {
    expect(S.holm([0.023])[0]).toBeCloseTo(0.023, 10);
  });
  it('passes non-finite entries through as null and excludes them from m', () => {
    const adj = S.holm([0.01, null, 0.02, undefined, NaN]);
    expect(adj[1]).toBeNull();
    expect(adj[3]).toBeNull();
    expect(adj[4]).toBeNull();
    expect(adj[0]).toBeCloseTo(0.02, 10); // m = 2, smallest x2
    expect(adj[2]).toBeCloseTo(0.02, 10);
  });
});
