const { normalize, align, wer, aggregate, mannWhitney, spearman, deletionClasses, numberToWords } = require('./wer.js');

// Reference values below were produced by jiwer 3.x via
// `.venv/bin/python scripts/eval/stt/prepare-adress.py --jiwer-check`:
//   ref='the cat sat on the mat'              hyp='the cat sit on mat'                 wer=0.333333 S=1 D=1 I=0 H=4
//   ref='she is reaching for a cookie'        hyp='she is reaching up for a cookie jar' wer=0.333333 S=0 D=0 I=2 H=6
//   ref='well uh the boy is uh getting cookies' hyp='well the boy is getting cookies'  wer=0.250000 S=0 D=2 I=0 H=6
describe('wer.js — jiwer cross-check', () => {
  it('substitution + deletion', () => {
    const r = wer('the cat sat on the mat', 'the cat sit on mat');
    expect([r.S, r.D, r.I, r.H, r.N]).toEqual([1, 1, 0, 4, 6]);
    expect(r.wer).toBeCloseTo(0.333333, 5);
  });
  it('insertions only', () => {
    const r = wer('she is reaching for a cookie', 'she is reaching up for a cookie jar');
    expect([r.S, r.D, r.I, r.H]).toEqual([0, 0, 2, 6]);
    expect(r.wer).toBeCloseTo(0.333333, 5);
  });
  it('filler policy changes the score: kept → two deletions, stripped → zero', () => {
    const ref = 'well uh the boy is uh getting cookies';
    const hyp = 'well the boy is getting cookies';
    const kept = wer(ref, hyp, { fillers: 'keep' });
    expect([kept.S, kept.D, kept.I, kept.H]).toEqual([0, 2, 0, 6]);
    expect(kept.wer).toBeCloseTo(0.25, 6);
    const stripped = wer(ref, hyp, { fillers: 'strip' });
    expect(stripped.wer).toBe(0);
    expect(stripped.N).toBe(6);
  });
});

describe('wer.js — edge cases', () => {
  it('empty hypothesis is WER 1.0 with all deletions', () => {
    const r = wer('one two three', '');
    expect(r.wer).toBe(1);
    expect(r.D).toBe(3);
  });
  it('empty reference with empty hypothesis is 0; with content it is undefined (null)', () => {
    expect(wer('', '').wer).toBe(0);
    expect(wer('', 'hello').wer).toBeNull();
  });
  it('identical strings score 0 regardless of case and punctuation', () => {
    expect(wer("It's the Mother's, washing dishes!", "it is the mother's washing dishes").wer).toBe(0);
  });
  it('align backtrace prefers substitution on ties and reports pairs in order', () => {
    const a = align(['a', 'b', 'c'], ['a', 'x', 'c']);
    expect(a.pairs.map(p => p.op).join('')).toBe('HSH');
    expect(a.pairs[1]).toEqual({ op: 'S', ref: 'b', hyp: 'x' });
  });
});

describe('wer.js — normalisation', () => {
  it('lowercases, expands contractions, spells small numbers, strips punctuation and hyphens', () => {
    expect(normalize("I can't do 25 things — it's a 3-step plan.")).toEqual(
      ['i', 'can', 'not', 'do', 'twenty', 'five', 'things', 'it', 'is', 'a', 'three', 'step', 'plan'],
    );
  });
  it('strips fillers by default and keeps them on request', () => {
    expect(normalize('um so uh yes')).toEqual(['so', 'yes']);
    expect(normalize('um so uh yes', { fillers: 'keep' })).toEqual(['um', 'so', 'uh', 'yes']);
  });
  it('numberToWords covers 0–999 and leaves larger numbers as digits', () => {
    expect(numberToWords(0)).toBe('zero');
    expect(numberToWords(17)).toBe('seventeen');
    expect(numberToWords(40)).toBe('forty');
    expect(numberToWords(111)).toBe('one hundred eleven');
    expect(numberToWords(1990)).toBe('1990');
  });
});

describe('wer.js — tests over speakers', () => {
  it('Mann–Whitney U and Cliff\'s δ on a hand-computed example', () => {
    // a = 1..5, b = 3..7: ranks 1,2,3.5,5.5,7.5 | 3.5,5.5,7.5,9,10 → R1 = 19.5, U1 = 4.5, U2 = 20.5
    // pairs a>b: 3, a<b: 19 → δ = (3-19)/25 = -0.64
    const r = mannWhitney([1, 2, 3, 4, 5], [3, 4, 5, 6, 7]);
    expect(r.U1).toBeCloseTo(4.5, 9);
    expect(r.U2).toBeCloseTo(20.5, 9);
    expect(r.delta).toBeCloseTo(-0.64, 9);
    expect(r.p).toBeGreaterThan(0.05);
    expect(r.p).toBeLessThan(0.15);
  });
  it('Mann–Whitney detects a clear separation', () => {
    const a = Array.from({ length: 30 }, (_, i) => 0.1 + i * 0.001);
    const b = Array.from({ length: 30 }, (_, i) => 0.4 + i * 0.001);
    const r = mannWhitney(a, b);
    expect(r.delta).toBe(-1);
    expect(r.p).toBeLessThan(0.001);
  });
  it('Spearman ρ is 1 on a monotone relation, −1 on a reversed one, ~0 on noise', () => {
    expect(spearman([1, 2, 3, 4, 5], [10, 20, 30, 40, 50]).rho).toBeCloseTo(1, 9);
    expect(spearman([1, 2, 3, 4, 5], [50, 40, 30, 20, 10]).rho).toBeCloseTo(-1, 9);
    // hand-computed: x=1..5, y=5,6,7,8,7 → ranks y = 1,2,3.5,5,3.5; d = 0,0,-0.5,-1,1.5 → Σd²=3.5 → ρ=1-6·3.5/(5·24)=0.825 (tie-adjusted Pearson-on-ranks ≈ 0.8208)
    expect(spearman([1, 2, 3, 4, 5], [5, 6, 7, 8, 7]).rho).toBeCloseTo(0.8208, 3);
  });
});

describe('wer.js — aggregation', () => {
  const rows = [
    { speaker: 'S1', group: 'dementia', mmse: 18, ref: 'the boy is getting cookies', hyp: 'the boy is getting cookies' },
    { speaker: 'S1', group: 'dementia', mmse: 18, ref: 'the stool is falling over', hyp: 'the falling over' },
    { speaker: 'S2', group: 'control', mmse: 29, ref: 'the mother is washing dishes', hyp: 'the mother is washing dishes' },
    { speaker: 'S2', group: 'control', mmse: 29, ref: 'water is running over', hyp: 'water is running over the' },
  ];
  it('pools errors per speaker, summarises per group, and lists confusions/deletions', () => {
    const a = aggregate(rows);
    const s1 = a.speakers.find(s => s.speaker === 'S1');
    expect(s1.N).toBe(10);
    expect(s1.D).toBe(2);
    expect(s1.wer).toBeCloseTo(0.2, 9);
    const s2 = a.speakers.find(s => s.speaker === 'S2');
    expect(s2.I).toBe(1);
    expect(s2.wer).toBeCloseTo(1 / 9, 9);
    expect(a.groups.dementia.speakers).toBe(1);
    expect(a.groups.dementia.pooledWer).toBeCloseTo(0.2, 9);
    expect(a.groups.control.insRate).toBeCloseTo(1 / 9, 9);
    expect(a.topDeleted.map(d => d.word).sort()).toEqual(['is', 'stool']);
    expect(a.topConfusions).toEqual([]);
  });
  it('splits deletions into function vs content words', () => {
    const d = deletionClasses(aggregate(rows));
    expect(d.functionWordDeletions).toBe(1); // "is"
    expect(d.contentWordDeletions).toBe(1);  // "stool"
    expect(d.functionShare).toBeCloseTo(0.5, 9);
  });
});
