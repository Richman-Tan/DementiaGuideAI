const L = require('./lib');

describe('sequences', () => {
  it('collapses consecutive visemes and drops neutral/quiet frames', () => {
    const frames = [
      { time: 0, viseme: 'v_pp', weight: 0.7 }, { time: 0.05, viseme: 'v_pp', weight: 0.6 },
      { time: 0.1, viseme: 'neutral', weight: 0 }, { time: 0.15, viseme: 'aa', weight: 0.01 }, { time: 0.2, viseme: 'ee', weight: 0.6 },
    ];
    expect(L.visemeSequence(frames)).toEqual(['v_pp', 'ee']);
  });
  it('levenshtein and alignment agree', () => {
    const a = ['v_pp', 'ee', 'v_dd', 'v_rr'];
    const b = ['v_pp', 'ee', 'v_ss', 'v_rr', 'aa'];
    expect(L.levenshtein(a, b)).toBe(2);
    const ops = L.alignSequences(a, b);
    expect(ops.filter(o => o.op !== 'match')).toHaveLength(2);
    expect(ops.map(o => o.op)).toEqual(['match', 'match', 'sub', 'match', 'ins']);
  });
  it('builds a class confusion matrix', () => {
    const c = L.classConfusion(['v_pp', 'ee', 'v_th'], ['v_dd', 'ee', 'v_th']);
    expect(c.matrix.bilabial.tongue).toBe(1);
    expect(c.matrix.vowel.vowel).toBe(1);
    expect(c.substitutions).toBe(1);
    expect(c.matches).toBe(2);
  });
});

describe('closure coverage', () => {
  it('finds word spans and checks closures inside them', () => {
    const al = L.syntheticAlignment('put by', 0.1);
    const spans = L.wordSpans(al.characters, al.character_start_times_seconds, al.character_end_times_seconds);
    expect(spans).toEqual([{ word: 'put', start: 0, end: 0.3 }, { word: 'by', start: 0.4, end: 0.6 }]);
    const phones = (w) => ({ put: ['P', 'UH', 'T'], by: ['B', 'AY'] }[w] ?? null);
    const frames = [{ time: 0.0, viseme: 'v_pp', weight: 0.7 }, { time: 0.45, viseme: 'v_dd', weight: 0.3 }, { time: 0.5, viseme: 'v_ff', weight: 0.6 }];
    const cov = L.closureCoverage(spans, phones, frames);
    expect(cov.bilabial.expected).toBe(2);
    expect(cov.bilabial.produced).toBe(1);
    expect(cov.bilabial.missed).toEqual(['by']);
    expect(cov.labiodental.expected).toBe(0);
    // "by" has no F/V phone but a labiodental frame landed in its span → false positive.
    expect(cov.labiodental.notExpected).toBe(2);
    expect(cov.labiodental.falsePositive).toBe(1);
    expect(cov.labiodental.spurious).toEqual(['by']);
  });
});
