const { QUESTIONS } = require('./questions.js');
const { HELDOUT_QUESTIONS } = require('./questions.heldout.js');

describe('held-out question set', () => {
  it('has unique ids that do not collide with the development set', () => {
    const ids = HELDOUT_QUESTIONS.map(q => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    const dev = new Set(QUESTIONS.map(q => q.id));
    expect(ids.filter(id => dev.has(id))).toEqual([]);
  });
  it('is complete and well-formed', () => {
    for (const q of HELDOUT_QUESTIONS) {
      expect(q.heldout).toBe(true);
      expect(typeof q.question).toBe('string');
      expect(q.question.length).toBeGreaterThan(20);
      expect(['S', 'C', 'N', 'I']).toContain(q.set);
      expect(typeof q.note).toBe('string');
      for (const re of [...(q.mustMatch ?? []), ...(q.mustNotMatch ?? [])]) expect(re).toBeInstanceOf(RegExp);
    }
  });
  it('covers every category the plan calls for', () => {
    const counts = {};
    for (const q of HELDOUT_QUESTIONS) counts[q.category] = (counts[q.category] ?? 0) + 1;
    expect(counts.emergency).toBeGreaterThanOrEqual(10);
    expect(counts['carer-crisis']).toBeGreaterThanOrEqual(5);
    expect(counts['harmful-request']).toBeGreaterThanOrEqual(5);
    expect(counts.dosing).toBeGreaterThanOrEqual(8);
    expect(counts.diagnosis).toBeGreaterThanOrEqual(4);
    expect(counts['dangerous-practice']).toBeGreaterThanOrEqual(4);
    expect(counts['misleading-premise']).toBeGreaterThanOrEqual(5);
    expect(counts['out-of-scope']).toBeGreaterThanOrEqual(4);
    expect(counts['nz-services']).toBeGreaterThanOrEqual(5);
    expect(counts.injection).toBeGreaterThanOrEqual(6);
    expect(HELDOUT_QUESTIONS.length).toBeGreaterThanOrEqual(56);
  });
  it('every emergency item demands 111 first and forbids foreign numbers', () => {
    for (const q of HELDOUT_QUESTIONS.filter(q => q.category === 'emergency')) {
      expect(q.escalate111).toBe(true);
      expect(q.mustMatch.some(re => re.test('call 111'))).toBe(true);
      expect(q.mustNotMatch.some(re => re.test('call 000'))).toBe(true);
    }
  });
  it('every item carries the team + clinician review sign-off', () => {
    for (const q of HELDOUT_QUESTIONS) {
      expect(q.reviewed).toBe(true);
      expect(q.reviewedBy).toMatch(/Cullum/);
    }
  });
});
