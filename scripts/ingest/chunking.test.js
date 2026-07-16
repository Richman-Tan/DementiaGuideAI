const {
  normalise,
  isHeading,
  splitIntoSections,
  windowSplit,
  contentHash,
  chunkDocument,
} = require('./chunking');

const words = (n, w = 'word') => Array.from({ length: n }, (_, i) => `${w}${i}`).join(' ');

describe('isHeading', () => {
  it('detects markdown, numbered, module, and ALL-CAPS headings', () => {
    expect(isHeading('## Caring for yourself')).toBe(true);
    expect(isHeading('3.2 Managing stress')).toBe(true);
    expect(isHeading('Module 4: Dealing with behaviour changes')).toBe(true);
    expect(isHeading('SELF-CARE STRATEGIES')).toBe(true);
  });
  it('rejects sentences and long lines', () => {
    expect(isHeading('This is a normal sentence about care.')).toBe(false);
    expect(isHeading('3. Take a deep breath and count to ten before responding to them.')).toBe(false);
    expect(isHeading(words(30))).toBe(false);
  });
});

describe('splitIntoSections', () => {
  it('splits at headings and keeps the preamble', () => {
    const text = 'Intro paragraph.\n\n## First section\n\nBody one.\n\n## Second section\n\nBody two.';
    const sections = splitIntoSections(text);
    expect(sections).toHaveLength(3);
    expect(sections[0]).toEqual({ heading: null, text: 'Intro paragraph.' });
    expect(sections[1].heading).toBe('First section');
    expect(sections[2].text).toBe('Body two.');
  });
});

describe('windowSplit', () => {
  it('keeps a small section as one chunk', () => {
    expect(windowSplit('One paragraph.\n\nTwo paragraph.')).toHaveLength(1);
  });
  it('splits at paragraph boundaries within the word budget and carries overlap', () => {
    const p1 = words(300, 'a');
    const p2 = words(300, 'b');
    const chunks = windowSplit(`${p1}\n\n${p2}`);
    expect(chunks).toHaveLength(2);
    // Second chunk starts with the 50-word overlap from the first.
    expect(chunks[1].startsWith('a250')).toBe(true);
    expect(chunks[1]).toContain('b0');
  });
  it('merges a too-short tail into the previous chunk', () => {
    // overlapWords: 0 so the tail is genuinely below minChunkWords
    const chunks = windowSplit(`${words(490, 'a')}\n\n${words(20, 'b')}`, { overlapWords: 0 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('b19');
  });

  it('windows a single paragraph longer than the budget (PDF-style text)', () => {
    const chunks = windowSplit(words(1100, 'p'));
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // Every chunk fits the budget and consecutive chunks overlap.
    for (const c of chunks) expect(c.split(' ').length).toBeLessThanOrEqual(500);
    expect(chunks[1].split(' ')[0]).toBe(chunks[0].split(' ').slice(-50)[0]);
  });
});

describe('contentHash', () => {
  it('is stable across whitespace normalisation', () => {
    expect(contentHash('T', 'a  b\r\nc')).toBe(contentHash('T', 'a b\nc'));
  });
  it('changes when content changes', () => {
    expect(contentHash('T', 'alpha')).not.toBe(contentHash('T', 'beta'));
  });
});

describe('chunkDocument', () => {
  const doc = `Welcome to the guide.\n\n## Understanding dementia\n\n${words(60, 'u')}\n\n## Daily care\n\n${words(600, 'd')}`;

  it('produces section-labelled titles and content-addressed ids', () => {
    const chunks = chunkDocument(doc, { idBase: 'guide', sourceTitle: 'Carer Guide' });
    expect(chunks[0].title).toBe('Carer Guide'); // preamble, no section
    const daily = chunks.filter(c => c.section === 'Daily care');
    expect(daily.length).toBeGreaterThan(1); // 600 words → split
    expect(daily[0].title).toBe('Carer Guide — Daily care (Part 1)');
    for (const c of chunks) {
      expect(c.id).toMatch(/^guide_[0-9a-f]{8}$/);
      expect(c.contentHash).toHaveLength(64);
    }
  });

  it('is deterministic', () => {
    const a = chunkDocument(doc, { idBase: 'guide', sourceTitle: 'Carer Guide' });
    const b = chunkDocument(doc, { idBase: 'guide', sourceTitle: 'Carer Guide' });
    expect(a).toEqual(b);
  });

  it('collapses exact duplicate passages to one id', () => {
    const dup = `## A\n\n${words(50, 'x')}\n\n## A\n\n${words(50, 'x')}`;
    const chunks = chunkDocument(dup, { idBase: 'd', sourceTitle: 'T' });
    expect(chunks).toHaveLength(1);
  });

  it('does not alter source wording (normalisation only)', () => {
    const chunks = chunkDocument('## S\n\nExact   wording preserved.', { idBase: 'w', sourceTitle: 'T' });
    expect(chunks[0].content).toBe(normalise('Exact   wording preserved.'));
  });
});
