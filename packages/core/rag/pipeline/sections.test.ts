import { createSectionSplitter, splitSections, SECTION_DELIMITER } from './sections.ts';
import type { SectionPiece } from './sections.ts';

/** Feed the chunks one by one and collect everything released, flush included. */
function run(chunks: string[]) {
  const splitter = createSectionSplitter();
  const perWrite: SectionPiece[][] = chunks.map((c) => splitter.write(c));
  const flushed = splitter.flush();
  const all = [...perWrite.flat(), ...flushed];
  const text = (section: 'lead' | 'detail') =>
    all
      .filter((p) => p.section === section)
      .map((p) => p.text)
      .join('');
  return { perWrite, flushed, lead: text('lead'), detail: text('detail') };
}

describe('createSectionSplitter', () => {
  it('treats an answer with no delimiter as all lead', () => {
    const r = run(['Keep the evening calm. ', 'Close the curtains before dusk.']);
    expect(r.lead).toBe('Keep the evening calm. Close the curtains before dusk.');
    expect(r.detail).toBe('');
  });

  it('splits on a line holding only the delimiter, dropping the blank lines around it', () => {
    const r = run([`Call 111 now.\n\n${SECTION_DELIMITER}\n\nWhile you wait, keep him still.`]);
    expect(r.lead).toBe('Call 111 now.');
    expect(r.detail).toBe('While you wait, keep him still.');
  });

  it('releases lead text at once when it cannot be the delimiter', () => {
    const r = run(['Keep the evening calm.']);
    expect(r.perWrite[0]).toEqual([{ section: 'lead', text: 'Keep the evening calm.' }]);
    expect(r.flushed).toEqual([]);
  });

  it('holds back a line that might be the delimiter, and never leaks it', () => {
    const r = run(['Short answer.\n', '---det', 'ail---', '\nLonger answer.']);
    expect(r.perWrite[1]).toEqual([]); // "---det" could still be the delimiter
    expect(r.perWrite[2]).toEqual([]); // complete, but its line has not ended
    expect(r.lead.trim()).toBe('Short answer.');
    expect(r.detail).toBe('Longer answer.');
    expect(r.lead + r.detail).not.toContain('---');
  });

  it('releases a held line, newlines included, when it turns out to be ordinary text', () => {
    const r = run(['First point.\n\n', '---', 'desserts are fine in moderation.']);
    expect(r.lead).toBe('First point.\n\n---desserts are fine in moderation.');
    expect(r.detail).toBe('');
  });

  it('does not lose a markdown list, whose items start like the delimiter', () => {
    const r = run(['Try this:\n', '-', ' close the curtains\n', '- ', 'put a lamp on']);
    expect(r.lead).toBe('Try this:\n- close the curtains\n- put a lamp on');
  });

  it('accepts the delimiter in any case, with spaces around it', () => {
    const r = run(['Lead.\n  ---DETAIL---  \nDetail.']);
    expect(r.lead).toBe('Lead.');
    expect(r.detail).toBe('Detail.');
  });

  it('recognises a delimiter that ends the stream with no newline after it', () => {
    const r = run(['Lead only.\n', SECTION_DELIMITER]);
    expect(r.lead.trim()).toBe('Lead only.');
    expect(r.detail).toBe('');
    expect(r.flushed).toEqual([]);
  });

  it('splits only once: a second delimiter line is part of the detail', () => {
    const r = run([`Lead.\n${SECTION_DELIMITER}\nOne.\n${SECTION_DELIMITER}\nTwo.`]);
    expect(r.lead).toBe('Lead.');
    expect(r.detail).toBe(`One.\n${SECTION_DELIMITER}\nTwo.`);
  });

  it('does not treat the delimiter inside a sentence as a split', () => {
    const r = run([`The marker ${SECTION_DELIMITER} must be on its own line.`]);
    expect(r.detail).toBe('');
    expect(r.lead).toContain(SECTION_DELIMITER);
  });

  it('streams the detail as it arrives once the split has happened', () => {
    const r = run([`Lead.\n${SECTION_DELIMITER}\n`, 'First ', 'second.']);
    expect(r.perWrite[1]).toEqual([{ section: 'detail', text: 'First ' }]);
    expect(r.perWrite[2]).toEqual([{ section: 'detail', text: 'second.' }]);
  });

  it('gives the same text whatever the chunk boundaries', () => {
    const answer = `Call your GP today.\n\n${SECTION_DELIMITER}\n\n1. Note the time.\n2. Keep a list.`;
    const whole = run([answer]);
    const byChar = run([...answer]);
    expect(byChar.lead.trim()).toBe(whole.lead.trim());
    expect(byChar.detail).toBe(whole.detail);
  });
});

describe('splitSections', () => {
  it('returns trimmed lead and detail from a complete answer', () => {
    expect(splitSections(`  Lead.  \n\n${SECTION_DELIMITER}\n\n  Detail.  \n`)).toEqual({
      lead: 'Lead.',
      detail: 'Detail.',
    });
  });

  it('returns everything as lead when there is no delimiter', () => {
    expect(splitSections('Just one part.')).toEqual({ lead: 'Just one part.', detail: '' });
  });
});
