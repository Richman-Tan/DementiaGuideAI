// An answer as plain text (src/lib/answerPlain.js): what "Copy" puts on the
// clipboard, and what a screen reader is told about a turn.
import { describe, it, expect } from 'vitest';
import { announcement, answerForCopy, plainAnswer } from '../src/lib/answerPlain.js';

const ANSWER = [
  'Keep the **late afternoon** calm and *well lit* [1].',
  '',
  '### What to try',
  '3. Close the curtains at dusk [2].',
  '4. Keep a familiar routine.',
  '',
  '- Tea, not coffee',
  '- A short walk [1][2]',
  '',
  'Ring your GP if it gets worse.',
  'Healthline is 0800 611 116.',
].join('\n');

describe('an answer without its Markdown', () => {
  it('drops the emphasis and heading markers, and keeps paragraphs and lists as they are', () => {
    expect(plainAnswer(ANSWER)).toBe(
      [
        'Keep the late afternoon calm and well lit [1].',
        '',
        'What to try',
        '',
        '3. Close the curtains at dusk [2].',
        '4. Keep a familiar routine.',
        '',
        '- Tea, not coffee',
        '- A short walk [1][2]',
        '',
        'Ring your GP if it gets worse.',
        'Healthline is 0800 611 116.',
      ].join('\n')
    );
  });

  it('can leave the citation markers out, with the space before each', () => {
    const plain = plainAnswer(ANSWER, { citations: false });
    expect(plain).not.toMatch(/\[\d+\]/);
    expect(plain).toContain('calm and well lit.');
    expect(plain).toContain('- A short walk\n');
    // A number in brackets that is part of a line break is not eaten with it.
    expect(plain).toContain('3. Close the curtains at dusk.\n4. Keep a familiar routine.');
  });

  it('is an empty string for an empty answer', () => {
    expect(plainAnswer('')).toBe('');
  });
});

describe('what Copy puts on the clipboard', () => {
  it('is the answer, the sources its markers refer to, and what it is', () => {
    const copied = answerForCopy({
      text: 'Keep the late afternoon **calm** [1]. Carers NZ can help [2].',
      citations: [
        {
          num: 1,
          title: 'Managing evening restlessness',
          org: 'Alzheimers NZ',
          url: 'https://alzheimers.org.nz/sundowning',
        },
        { num: 2, title: 'Carer support', org: 'Carers NZ', url: null },
      ],
    });
    expect(copied).toBe(
      [
        'Keep the late afternoon calm [1]. Carers NZ can help [2].',
        '',
        'Sources:',
        '[1] Managing evening restlessness — Alzheimers NZ — https://alzheimers.org.nz/sundowning',
        '[2] Carer support — Carers NZ',
        '',
        'From DementiaGuide AI. General information only — not medical advice.',
      ].join('\n')
    );
  });

  it('numbers sources by their place when they carry no number (a library article)', () => {
    const copied = answerForCopy({
      text: 'Try a calm routine.',
      citations: [{ id: 'managing-sundowning', title: 'Managing Sundowning', cat: 'best' }],
    });
    expect(copied).toContain('Sources:\n[1] Managing Sundowning');
  });

  it('leaves out the markers and the list when there are no sources to point at', () => {
    for (const citations of [[], undefined]) {
      const copied = answerForCopy({ text: 'Call 111 now [1].', citations });
      expect(copied).toBe(
        'Call 111 now.\n\nFrom DementiaGuide AI. General information only — not medical advice.'
      );
    }
  });
});

describe('what a screen reader is told that is not on screen as words', () => {
  it('is nothing when nothing is happening', () => {
    expect(announcement(null, 'Aaron')).toBe('');
  });

  it('says an answer is on its way, by name', () => {
    expect(announcement({ kind: 'writing' }, 'Ariana')).toBe('Ariana is writing an answer.');
  });

  it('says when an answer was stopped', () => {
    expect(announcement({ kind: 'stopped' }, 'Aaron')).toBe(
      'Stopped. Aaron did not finish the answer.'
    );
  });
});
