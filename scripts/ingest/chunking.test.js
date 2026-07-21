const {
  normalise,
  stripPdfBoilerplate,
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

describe('stripPdfBoilerplate', () => {
  // 8 pages; "iSupport Manual" repeats on every page (running header), each page
  // has unique body text.
  const doc = Array.from({ length: 8 }, (_, i) =>
    `-- ${i + 1} of 8 --\niSupport Manual\nUnique body paragraph number ${i} with real content here.`,
  ).join('\n');

  it('removes lines that repeat on most pages', () => {
    const out = stripPdfBoilerplate(doc);
    expect(out).not.toContain('iSupport Manual');
    expect(out).toContain('Unique body paragraph number 3');
  });

  it('preserves content lines that do not repeat across pages', () => {
    const out = stripPdfBoilerplate(doc);
    for (let i = 0; i < 8; i++) expect(out).toContain(`number ${i}`);
  });

  it('strips page-separator markers even when nothing else repeats', () => {
    const unique = Array.from({ length: 6 }, (_, i) => `-- ${i + 1} of 6 --\nAll different ${i}`).join('\n');
    expect(stripPdfBoilerplate(unique)).not.toMatch(/-- \d+ of \d+ --/);
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
  const doc = `Welcome to the guide.\n\n## Understanding dementia\n\n${words(120, 'u')}\n\n## Daily care\n\n${words(600, 'd')}`;

  it('produces section-labelled titles and content-addressed ids', () => {
    const chunks = chunkDocument(doc, { idBase: 'guide', sourceTitle: 'Carer Guide' });
    // The tiny preamble merges into the first real section, which keeps its heading.
    expect(chunks[0].section).toBe('Understanding dementia');
    expect(chunks[0].title).toBe('Carer Guide — Understanding dementia');
    expect(chunks[0].content.startsWith('Welcome to the guide.')).toBe(true);
    const daily = chunks.filter(c => c.section === 'Daily care');
    expect(daily.length).toBeGreaterThan(1); // 600 words → split
    expect(daily[0].title).toBe('Carer Guide — Daily care (Part 1)');
    for (const c of chunks) {
      expect(c.id).toMatch(/^guide_[0-9a-f]{8}$/);
      expect(c.contentHash).toHaveLength(64);
    }
  });

  it('merges undersized sections forward (workbook-style documents)', () => {
    const workbook = `## Quiz A\n\n${words(20, 'q')}\n\n## Quiz B\n\n${words(20, 'r')}\n\n## Lesson\n\n${words(120, 'l')}`;
    const chunks = chunkDocument(workbook, { idBase: 'w', sourceTitle: 'W' });
    expect(chunks).toHaveLength(1); // 20+20+120 accumulate into one ≥100-word unit
    expect(chunks[0].section).toBe('Quiz A');
    expect(chunks[0].content).toContain('l119');
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
