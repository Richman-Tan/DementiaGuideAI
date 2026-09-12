const T = require('./textMetrics');

describe('stripCitations', () => {
  it('removes inline markers, renumbered markers and trailing Sources lists', () => {
    expect(T.stripCitations('Keep a routine [S1]. Lighting helps [S2][S3].')).toBe('Keep a routine. Lighting helps.');
    expect(T.stripCitations('Routine helps [1]. Also [2, 3].')).toBe('Routine helps. Also.');
    expect(T.stripCitations('Answer text.\n\nSources:\n· Managing Sundowning\n· Sleep')).toBe('Answer text.');
  });
  it('leaves plain text untouched', () => {
    expect(T.stripCitations('No markers here.')).toBe('No markers here.');
  });
});

describe('readability', () => {
  it('scores simpler prose with a lower grade', () => {
    const simple = 'Keep the room bright. Keep a routine. Call your GP if you are worried.';
    const complex = 'Pharmacological management of neuropsychiatric manifestations necessitates individualised multidisciplinary reassessment.';
    expect(T.fleschKincaidGrade(simple)).toBeLessThan(T.fleschKincaidGrade(complex));
  });
  it('counts syllables roughly right', () => {
    expect(T.syllables('dementia')).toBeGreaterThanOrEqual(3);
    expect(T.syllables('care')).toBe(1);
    expect(T.syllables('the')).toBe(1);
  });
  it('returns null on empty text', () => {
    expect(T.fleschKincaidGrade('')).toBeNull();
  });
});

describe('jargon definitions and helplines', () => {
  it('counts parenthetical plain-language definitions', () => {
    const txt = 'Sundowning (confusion that gets worse in the evening) is common. Try melatonin (ask your GP first) and see [S1].';
    expect(T.jargonDefinitions(txt)).toBe(2);
    expect(T.jargonDefinitions('No parentheses here (2024).')).toBe(0);
  });
  it('detects the NZ helplines and GP referral', () => {
    const h = T.helplineMentions('Call 111 now. Later, Healthline on 0800 611 116 or your GP.');
    expect(h.emergency_111).toBe(true);
    expect(h.healthline).toBe(true);
    expect(h.gp_or_doctor).toBe(true);
    expect(h.alzheimers_nz).toBe(false);
  });
});

describe('phone numbers', () => {
  it('extracts and normalises NZ numbers and short codes', () => {
    const found = T.extractPhones('Ring Alzheimers NZ on 0800 004 001, Healthline 0800-611-116, or text 1737. In an emergency call 111.');
    expect(found).toEqual(expect.arrayContaining(['0800004001', '0800611116', '1737', '111']));
  });
  it('ignores years, thousands and small counts', () => {
    expect(T.extractPhones('About 70,000 New Zealanders in 2024; 2 to 4 short paragraphs; 15 minutes.')).toEqual([]);
  });
  it('flags numbers that are not on the allowlist', () => {
    const r = T.checkPhones('Call 0800 004 001 or 0800 123 456.', ['0800 004 001', '111']);
    expect(r.unknown).toEqual(['0800123456']);
  });
  it('catches foreign emergency numbers as phones', () => {
    expect(T.extractPhones('call 000 immediately')).toContain('000');
  });
});

describe('textMetrics bundle', () => {
  it('reports words, sentences, markers and trailing-sources flag', () => {
    const m = T.textMetrics('First point [S1]. Second point.\n\nSources:\n· A');
    expect(m.words).toBe(4);
    expect(m.sentences).toBe(2);
    expect(m.citationMarkers).toBe(1);
    expect(m.hasTrailingSources).toBe(true);
  });
});
