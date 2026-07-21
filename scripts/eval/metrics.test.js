const { recallAtK, precisionAtK, reciprocalRank, ndcgAtK, scoreQuestion, aggregate } = require('./metrics');

// Fixtures are hand-computed; do not regenerate them from the implementation.

describe('recallAtK', () => {
  it('is 1 when the single relevant id is inside top-k', () => {
    expect(recallAtK(['a', 'b', 'c'], ['b'], 3)).toBe(1);
  });
  it('is 0 when the relevant id is outside top-k', () => {
    expect(recallAtK(['a', 'b', 'c', 'd'], ['d'], 3)).toBe(0);
  });
  it('is fractional with multiple relevant ids', () => {
    expect(recallAtK(['a', 'x', 'b', 'y', 'z'], ['a', 'b', 'q'], 5)).toBeCloseTo(2 / 3);
  });
  it('is null with no relevant labels (excluded from means)', () => {
    expect(recallAtK(['a'], [], 5)).toBeNull();
  });
});

describe('precisionAtK', () => {
  it('counts relevant and acceptable ids against k', () => {
    // top-5 = [rel, acc, x, x, x] → 2/5
    expect(precisionAtK(['r', 'a', 'x1', 'x2', 'x3'], ['r'], ['a'], 5)).toBeCloseTo(0.4);
  });
  it('divides by k, not by retrieved length', () => {
    expect(precisionAtK(['r'], ['r'], [], 5)).toBeCloseTo(0.2);
  });
  it('is null when nothing is labelled', () => {
    expect(precisionAtK(['x'], [], [], 5)).toBeNull();
  });
});

describe('reciprocalRank', () => {
  it('uses the first useful id (relevant or acceptable)', () => {
    expect(reciprocalRank(['x', 'acc', 'rel'], ['rel'], ['acc'])).toBeCloseTo(1 / 2);
  });
  it('is 0 when no useful id was retrieved', () => {
    expect(reciprocalRank(['x', 'y'], ['rel'], [])).toBe(0);
  });
  it('is 1 for a rank-1 hit', () => {
    expect(reciprocalRank(['rel'], ['rel'], [])).toBe(1);
  });
});

describe('ndcgAtK', () => {
  it('is 1 for the ideal ordering', () => {
    // gains [2,1] in ideal order
    expect(ndcgAtK(['rel', 'acc'], ['rel'], ['acc'], 5)).toBeCloseTo(1);
  });
  it('penalises the relevant id appearing late', () => {
    // retrieved: [x, x, rel] → DCG = 2/log2(4) = 1 ; IDCG = 2/log2(2) = 2 → 0.5
    expect(ndcgAtK(['x1', 'x2', 'rel'], ['rel'], [], 5)).toBeCloseTo(0.5);
  });
  it('hand-computed graded case', () => {
    // labels: rel=[r] (gain 2), acc=[a] (gain 1)
    // retrieved: [a, r] → DCG = 1/log2(2) + 2/log2(3) = 1 + 1.2618595 = 2.2618595
    // IDCG      : [r, a] →  2/log2(2) + 1/log2(3) = 2 + 0.6309298 = 2.6309298
    expect(ndcgAtK(['a', 'r'], ['r'], ['a'], 5)).toBeCloseTo(2.2618595 / 2.6309298, 5);
  });
  it('is null with no labels', () => {
    expect(ndcgAtK(['x'], [], [], 5)).toBeNull();
  });
});

describe('scoreQuestion + aggregate', () => {
  it('aggregates means over non-null rows only', () => {
    const rows = [
      scoreQuestion({ retrieved: ['r', 'x', 'x2', 'x3', 'x4'], relevant: ['r'], acceptable: [] }),
      scoreQuestion({ retrieved: ['x', 'x2', 'x3', 'x4', 'x5'], relevant: [], acceptable: [] }), // unlabeled → nulls
    ];
    const agg = aggregate(rows);
    expect(agg['recall@5']).toBe(1);
    expect(agg['recall@5#n']).toBe(1); // the unlabeled row is excluded
    expect(agg['mrr']).toBe(1);
  });
});
