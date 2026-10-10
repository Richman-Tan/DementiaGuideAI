const { splitSentences, displaySentence, pairsForRow, normaliseLabel, gateStats } = require('./citationPairs.js');

describe('citationPairs.splitSentences', () => {
  it('splits lines and sentences, strips list and bold markup, and keeps a trailing marker with its sentence', () => {
    const a = 'Intro sentence. Second one [S1].\n\n1. **Routine**: Keep a schedule [S2]. Also rest. [S3]\n- Bullet text';
    expect(splitSentences(a)).toEqual(['Intro sentence.', 'Second one [S1].', 'Routine: Keep a schedule [S2].', 'Also rest. [S3]', 'Bullet text']);
  });
  it('tidies the display sentence', () => {
    expect(displaySentence('Keep a schedule [S2][S3] .')).toBe('Keep a schedule.');
  });
});

describe('citationPairs.pairsForRow', () => {
  const row = { id: 'A9', set: 'A', question: 'Q?', answer: 'First [S1]. Second cites two [S1][S2]. Bad [S7]. Injected [S3].', retrieved: [{ id: 'c1' }, { id: 'c2' }, { id: 'INJECT:J1:0' }] };
  it('makes one pair per distinct cited passage and skips unsupplied and injected passages', () => {
    const { pairs, skipped } = pairsForRow(row, 'v2');
    expect(pairs.map(p => `${p.sentenceIndex}:${p.marker}:${p.chunkId}`)).toEqual(['0:S1:c1', '1:S1:c1', '1:S2:c2']);
    expect(skipped).toEqual({ hallucinated: 1, injected: 1 });
    expect(pairs[1].contextBefore).toBe('First.');
    expect(pairs[1].pairId).toBe('v2|A9|1|S1');
  });
});

describe('citationPairs.normaliseLabel', () => {
  it('accepts the three labels and common shorthands, flags anything else', () => {
    expect(normaliseLabel('Supported')).toBe('supported');
    expect(normaliseLabel('p')).toBe('partial');
    expect(normaliseLabel('not supported')).toBe('not_supported');
    expect(normaliseLabel('')).toBe(null);
    expect(normaliseLabel('maybe')).toBe(undefined);
  });
});

describe('citationPairs.gateStats', () => {
  const mk = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  it('passes on perfect agreement with both classes present', () => {
    const a = mk(40, i => (i % 3 === 0 ? 'partial' : 'supported'));
    const g = gateStats(a, a);
    expect(g.pass).toBe(true);
    expect(g.kappaPrimary).toBeCloseTo(1, 10);
  });
  it('fails when one side is degenerate, when too few pairs are labelled, or when kappa is low', () => {
    const allSup = mk(40, () => 'supported');
    expect(gateStats(allSup, allSup).pass).toBe(false);
    const a = mk(40, i => (i % 2 ? 'supported' : 'not_supported'));
    expect(gateStats(a.map((x, i) => (i < 10 ? null : x)), a).pass).toBe(false);
    const b = mk(40, i => (i % 4 < 2 ? 'supported' : 'partial'));
    expect(gateStats(a, b).pass).toBe(false);
  });
});
