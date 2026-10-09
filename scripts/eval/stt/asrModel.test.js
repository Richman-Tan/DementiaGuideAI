const { deriveRecogniser, transcribe, appBlankGuard, STOCK_PHRASES } = require('./asrModel.js');
const { perturb } = require('./perturb.js');
const { mulberry32 } = require('../lib/stats.js');
const { QUESTIONS, questionText } = require('../questions.js');

// Committed whisper-1 dementia aggregates (wer_57ad032_whisper-1.{csv,md}).
const W1 = {
  refWords: 7870, S: 1429, D: 1274, I: 597, utterances: 1018, phraseUtterances: 116, emptyUtterances: 31,
  fnDeleted: 1234, contentDeleted: 841,
  substitutions: [{ ref: 'the', hyp: 'a', n: 38 }, { ref: 'the', hyp: 'thank', n: 17 }, { ref: 'is', hyp: 'you', n: 9 }, { ref: 'is', hyp: 'was', n: 13 }],
};

describe('asrModel.deriveRecogniser', () => {
  const m = deriveRecogniser(W1);
  it('derives the non-empty rates by the pre-registered calibration rule', () => {
    const nonEmpty = 7870 * (1 - 31 / 1018);
    expect(m.pEmpty).toBeCloseTo(31 / 1018, 10);
    expect(m.rates.sub).toBeCloseTo(1429 / nonEmpty, 10);
    expect(m.rates.del).toBeCloseTo((1274 - (31 / 1018) * 7870) / nonEmpty, 10);
    expect(m.rates.ins).toBeCloseTo((597 - 116 * 1.75) / nonEmpty, 10);
    expect(m.pPhraseGivenNonEmpty).toBeCloseTo(116 / 987, 10);
    expect(m.meanPhraseWords).toBe(1.75);
    expect(m.functionWordDeletionShare).toBeCloseTo(1234 / 2075, 10);
  });
  it('implies the committed pooled rates', () => {
    expect(m.impliedPooled.wer).toBeCloseTo((1429 + 1274 + 597) / 7870, 10);
  });
  it('drops stock-phrase hypotheses from the confusions and weights insert words by count', () => {
    expect(m.confusions.map(c => c.hyp)).toEqual(['a', 'was']);
    expect(m.insertWords).toEqual([{ w: 'a', n: 38 }, { w: 'was', n: 13 }]);
  });
  it('refuses aggregates the calibration cannot represent', () => {
    expect(() => deriveRecogniser({ ...W1, I: 10 })).toThrow(/negative/);
  });
});

describe('asrModel.transcribe', () => {
  const m = deriveRecogniser(W1);
  const clean = QUESTIONS.filter(q => q.set === 'A').map(q => questionText(q, 'v2'));
  const run = (seed) => { const rnd = mulberry32(seed); return clean.map(c => transcribe(c, m, rnd, { vocabulary: clean })); };
  it('is deterministic under a seed', () => {
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
  });
  it('produces empty output and stock phrases at about the model rates', () => {
    const many = []; for (let s = 0; s < 60; s++) many.push(...run(s));
    const empty = many.filter(t => t.emptyOutput).length / many.length;
    const nonEmpty = many.filter(t => !t.emptyOutput);
    const phrase = nonEmpty.filter(t => t.phrase).length / nonEmpty.length;
    expect(empty).toBeGreaterThan(0.015); expect(empty).toBeLessThan(0.05);
    expect(phrase).toBeGreaterThan(0.09); expect(phrase).toBeLessThan(0.15);
    for (const t of nonEmpty.filter(x => x.phrase)) {
      expect(STOCK_PHRASES).toContain(t.phrase);
      expect(t.text.endsWith(t.phrase)).toBe(true);
    }
    for (const t of many.filter(x => x.emptyOutput)) expect(t.text).toBe('');
  });
  it('never inserts fillers when an insertion vocabulary is given', () => {
    for (const t of run(3)) expect(t.text).not.toMatch(/\b(um|uh)\b/);
  });
});

describe('perturb.js with and without insertWords', () => {
  it('leaves the original filler behaviour byte-identical when insertWords is omitted', () => {
    const { PERTURBED_QUESTIONS } = require('../questions.perturbed-whisper1.js');
    const profile = require('../../../docs/report/eval/stt/error-profile_57ad032_whisper-1.json');
    const src = QUESTIONS.filter(q => ['A', 'A-neighbour', 'B', 'N'].includes(q.set));
    const vocab = src.map(s => questionText(s, 'v2'));
    const rnd = mulberry32(42);
    let i = 0;
    for (const q of src.slice(0, 6)) for (const level of ['control', 'ad', 'ad150', 'disfluent']) {
      expect(perturb(questionText(q, 'v2'), profile, level, rnd, { vocabulary: vocab })).toBe(PERTURBED_QUESTIONS[i++].question);
    }
  });
});

describe('appBlankGuard mirrors the STT boundary check', () => {
  it('treats null, empty and whitespace as blank, anything else as a turn', () => {
    expect(appBlankGuard(null)).toBe(true);
    expect(appBlankGuard('')).toBe(true);
    expect(appBlankGuard('  \n')).toBe(true);
    expect(appBlankGuard('?')).toBe(false);
    expect(appBlankGuard('Thank you.')).toBe(false);
  });
});
