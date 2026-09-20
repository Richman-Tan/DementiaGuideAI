const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { perturb } = require('./perturb.js');
const { mulberry32 } = require('../lib/stats.js');
const { wer } = require('../lib/wer.js');
const { QUESTIONS, questionText } = require('../questions.js');

const profile = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/error-profile.example.json'), 'utf8'));
const clean = QUESTIONS.filter(q => ['A', 'A-neighbour', 'B', 'N'].includes(q.set)).map(q => questionText(q, 'v2'));

function run(level, seed = 42) {
  const rnd = mulberry32(seed);
  return clean.map(c => perturb(c, profile, level, rnd, { vocabulary: clean }));
}

describe('perturb.js', () => {
  it('is deterministic under a seed and differs under another', () => {
    expect(run('ad', 42)).toEqual(run('ad', 42));
    expect(run('ad', 42)).not.toEqual(run('ad', 43));
  });
  it('achieves the target word error rate within tolerance over the set (fillers kept)', () => {
    for (const level of ['control', 'ad', 'ad150']) {
      const target = profile.levels[level].sub + profile.levels[level].del + profile.levels[level].ins;
      let errors = 0, N = 0;
      run(level).forEach((p, i) => { const a = wer(clean[i], p, { fillers: 'keep' }); errors += a.errors; N += a.N; });
      // Levenshtein finds the minimum edit path, so the achieved rate sits a little
      // under the injected rate; the report quotes the achieved rate, never the target.
      expect(errors / N).toBeGreaterThan(target - 0.08);
      expect(errors / N).toBeLessThan(target + 0.03);
    }
  });
  it('disfluent level only inserts — no substitutions or deletions against the clean wording', () => {
    let ins = 0;
    run('disfluent').forEach((p, i) => {
      const a = wer(clean[i], p, { fillers: 'keep' });
      expect(a.S).toBe(0);
      expect(a.D).toBe(0);
      ins += a.I;
    });
    expect(ins).toBeGreaterThan(0);
  });
  it('keeps sentences readable: no orphaned punctuation and no double spaces', () => {
    for (const p of [...run('ad'), ...run('disfluent')]) {
      expect(p).not.toMatch(/\s[.,?!]/);
      expect(p).not.toMatch(/\s{2}/);
      expect(p).not.toMatch(/[.,?!][A-Za-z]/);
    }
  });
  it('rejects an unknown level', () => {
    expect(() => perturb('hello there', profile, 'nope', mulberry32(1))).toThrow(/unknown level/);
  });
});
