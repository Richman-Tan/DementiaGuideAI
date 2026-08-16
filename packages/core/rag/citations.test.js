const { extractCitations, createMarkerStripper } = require('./citations');

const chunks = [
  { id: 'c1', title: 'Sundowning', content: 'A'.repeat(300), source_org: 'WHO', source_url: 'https://who.int/x' },
  { id: 'c2', title: 'Sleep', content: 'Short body.', source_org: null, source_url: null },
  { id: 'c3', title: 'Routines', content: 'Routine body.', source_org: 'Alzheimers NZ', source_url: null },
];

describe('extractCitations', () => {
  it('renumbers used markers to contiguous [1]..[n] in first-use order', () => {
    const { text, sources } = extractCitations('Keep routines [S3]. Light helps [S1]. More [S3].', chunks);
    expect(text).toBe('Keep routines [1]. Light helps [2]. More [1].');
    expect(sources.map(s => s.id)).toEqual(['c3', 'c1']);
    expect(sources[0]).toMatchObject({ num: 1, title: 'Routines', org: 'Alzheimers NZ', url: null });
  });

  it('strips hallucinated markers instead of rendering them', () => {
    const { text, sources } = extractCitations('True [S1]. Fake [S9]. End.', chunks);
    expect(text).toBe('True [1]. Fake. End.');
    expect(sources).toHaveLength(1);
  });

  it('handles multi-reference brackets [S1, S2]', () => {
    const { text, sources } = extractCitations('Both help [S1, S2].', chunks);
    expect(text).toBe('Both help [1][2].');
    expect(sources).toHaveLength(2);
  });

  it('returns empty sources when the model cited nothing', () => {
    const { text, sources } = extractCitations('General advice only.', chunks);
    expect(text).toBe('General advice only.');
    expect(sources).toEqual([]);
  });

  it('truncates excerpts to ~200 chars', () => {
    const { sources } = extractCitations('X [S1].', chunks);
    expect(sources[0].excerpt.length).toBeLessThanOrEqual(201);
    expect(sources[0].excerpt.endsWith('…')).toBe(true);
  });

  it('is safe with no supplied chunks', () => {
    const { text, sources } = extractCitations('Answer [S1].', []);
    expect(text).toBe('Answer.');
    expect(sources).toEqual([]);
  });
});

describe('createMarkerStripper (streaming)', () => {
  it('strips markers split across stream chunks', () => {
    const s = createMarkerStripper();
    let out = '';
    out += s.write('Warm light helps [S');
    out += s.write('1] in the evening.');
    out += s.flush();
    expect(out).toBe('Warm light helps in the evening.');
  });

  it('does not swallow ordinary brackets forever', () => {
    const s = createMarkerStripper();
    let out = '';
    out += s.write('Lists [like this one] are fine.');
    out += s.flush();
    expect(out).toBe('Lists [like this one] are fine.');
  });

  it('drops an unclosed citation fragment at end of stream, keeps ordinary brackets', () => {
    const s = createMarkerStripper();
    expect(s.write('End with [S2')).toBe('End with ');
    expect(s.flush()).toBe(''); // citation fragment dropped

    const t = createMarkerStripper();
    expect(t.write('See [note')).toBe('See ');
    expect(t.flush()).toBe('[note'); // ordinary bracket text released
  });
});
