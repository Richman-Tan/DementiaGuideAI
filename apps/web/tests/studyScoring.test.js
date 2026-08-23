// Inter-rater agreement on the rubric.
//
// Task success is the study's primary effectiveness measure and it is scored by
// hand, by the person whose project the result reflects on. Double-scoring part
// of the set is what separates a rubric from an assertion — but only if the
// statistic reported is right, including in the two cases that are easy to get
// wrong at this n: no second rater at all, and a second rater who used one label
// for everything.
import { describe, it, expect } from 'vitest';
import { interRater, susScore } from '../../../scripts/study/lib.mjs';

describe('interRater', () => {
  it('reports nothing when nobody double-scored', () => {
    const r = interRater([['complete', ''], ['partial', ''], ['complete', '']]);
    expect(r.n).toBe(0);
    // Not zero agreement — no agreement was measured. A 0 here would print as
    // "raters agreed on 0 %", which is a claim about data that does not exist.
    expect(r.agreement).toBeNull();
    expect(r.kappa).toBeNull();
  });

  it('scores only the pairs where both raters gave a label', () => {
    const r = interRater([
      ['complete', 'complete'],
      ['partial', ''],        // not double-scored
      ['complete', 'partial'],
      ['', 'complete'],       // second rater only — not a pair either
    ]);
    expect(r.n).toBe(2);
    expect(r.agreed).toBe(1);
    expect(r.agreement).toBe(0.5);
  });

  it('gives κ = 1 on perfect agreement across more than one label', () => {
    const r = interRater([
      ['complete', 'complete'],
      ['partial', 'partial'],
      ['failed', 'failed'],
      ['complete', 'complete'],
    ]);
    expect(r.agreement).toBe(1);
    expect(r.kappa).toBe(1);
  });

  it('gives κ ≈ 0 when the raters agree only as often as chance would predict', () => {
    // Each rater calls half complete and half partial, and they line up on half
    // of them — exactly what independent coin flips would produce.
    const r = interRater([
      ['complete', 'complete'],
      ['complete', 'partial'],
      ['partial', 'complete'],
      ['partial', 'partial'],
    ]);
    expect(r.agreement).toBe(0.5);
    expect(r.kappa).toBeCloseTo(0, 10);
  });

  it('goes negative when they agree less often than chance', () => {
    const r = interRater([
      ['complete', 'partial'],
      ['partial', 'complete'],
    ]);
    expect(r.kappa).toBeLessThan(0);
  });

  it('returns κ = null, not 0, when both raters used a single label', () => {
    // Genuinely reachable here: "every task the second rater looked at was
    // complete" is a plausible outcome at n ≈ 12. Expected agreement is 1, so
    // kappa divides by zero. Reporting 0 would say the raters did no better
    // than chance when in fact they agreed on everything.
    const r = interRater([
      ['complete', 'complete'],
      ['complete', 'complete'],
      ['complete', 'complete'],
    ]);
    expect(r.agreement).toBe(1);
    expect(r.kappa).toBeNull();
  });

  it('handles a label only one of the raters ever used', () => {
    const r = interRater([
      ['complete', 'complete'],
      ['complete', 'failed'],
      ['partial', 'partial'],
    ]);
    expect(r.n).toBe(3);
    expect(r.agreed).toBe(2);
    expect(Number.isFinite(r.kappa)).toBe(true);
  });
});

// Guards the neighbouring export: interRater lives in the same module and both
// are imported by analyse-study.mjs.
describe('susScore still refuses a partial instrument', () => {
  it('returns null rather than scoring nine items as ten', () => {
    const nine = {};
    for (let i = 1; i <= 9; i++) nine[`q${i}`] = 3;
    expect(susScore(nine)).toBeNull();
  });
});
