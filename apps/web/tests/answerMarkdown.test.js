// Answers keep the model's Markdown in the data but never show its markers:
// "**Overnight respite**" used to appear literally in the chat bubble. The
// parser, the inline runs, the speech strip and the rendered bubble.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseBlocks, parseInline, stripMarkdownForSpeech } from '../src/lib/markdown.js';
import { AnswerText } from '../src/components/AnswerText.jsx';

describe('parseBlocks', () => {
  it('splits paragraphs on blank lines and keeps line breaks inside one', () => {
    expect(parseBlocks('One.\nStill one.\n\nTwo.')).toEqual([
      { type: 'para', lines: ['One.', 'Still one.'] },
      { type: 'para', lines: ['Two.'] },
    ]);
  });

  it('reads headings, bullets of every kind, and numbered lists with their start', () => {
    const blocks = parseBlocks(
      '## Respite options\n- in-home\n* day programmes\n• residential\n· overnight\n\n3. Ask for a NASC assessment\n4) Plan ahead'
    );
    expect(blocks).toEqual([
      { type: 'heading', text: 'Respite options' },
      { type: 'ul', items: ['in-home', 'day programmes', 'residential', 'overnight'] },
      { type: 'ol', start: 3, items: ['Ask for a NASC assessment', 'Plan ahead'] },
    ]);
  });

  it('joins an indented line onto the list item above it, and ends the list at a plain line', () => {
    expect(
      parseBlocks(
        '1. **Overnight respite**: a short stay\n   in an aged-care facility.\nAfter the list.'
      )
    ).toEqual([
      {
        type: 'ol',
        start: 1,
        items: ['**Overnight respite**: a short stay in an aged-care facility.'],
      },
      { type: 'para', lines: ['After the list.'] },
    ]);
  });

  it('starts a new list when the kind changes, and a heading or paragraph ends one', () => {
    expect(parseBlocks('- a\n1. b\n# Title\nText\n- c').map((b) => b.type)).toEqual([
      'ul',
      'ol',
      'heading',
      'para',
      'ul',
    ]);
  });

  it('does not mistake bold at the start of a line for a bullet', () => {
    expect(parseBlocks('**Call 111** if he is not breathing.')).toEqual([
      { type: 'para', lines: ['**Call 111** if he is not breathing.'] },
    ]);
  });

  it('treats empty or missing text as no blocks', () => {
    expect(parseBlocks('')).toEqual([]);
    expect(parseBlocks(undefined)).toEqual([]);
    expect(parseBlocks('\n  \n')).toEqual([]);
  });
});

describe('parseInline', () => {
  it('marks bold and italic runs', () => {
    expect(parseInline('Try **respite care** for a *short* break.')).toEqual([
      { text: 'Try ', bold: false, italic: false },
      { text: 'respite care', bold: true, italic: false },
      { text: ' for a ', bold: false, italic: false },
      { text: 'short', bold: false, italic: true },
      { text: ' break.', bold: false, italic: false },
    ]);
  });

  it('finds italic inside bold', () => {
    expect(parseInline('**Never *ever* argue**')).toEqual([
      { text: 'Never ', bold: true, italic: false },
      { text: 'ever', bold: true, italic: true },
      { text: ' argue', bold: true, italic: false },
    ]);
  });

  it('drops a marker that has no partner yet, as while an answer streams in', () => {
    expect(parseInline('**Overnight res')).toEqual([
      { text: 'Overnight res', bold: false, italic: false },
    ]);
  });

  it('leaves a lone asterisk that is not emphasis', () => {
    expect(parseInline('5 * 3 = 15')).toEqual([{ text: '5 * 3 = 15', bold: false, italic: false }]);
  });

  it('keeps citation markers in the text for the badges', () => {
    expect(parseInline('**Plan early** [1].')).toEqual([
      { text: 'Plan early', bold: true, italic: false },
      { text: ' [1].', bold: false, italic: false },
    ]);
  });

  it('returns nothing for empty text', () => {
    expect(parseInline('')).toEqual([]);
    expect(parseInline(null)).toEqual([]);
  });
});

describe('stripMarkdownForSpeech', () => {
  it('removes emphasis and heading markers', () => {
    expect(stripMarkdownForSpeech('## Respite\n**Overnight** or *day* care')).toBe(
      ' Respite\nOvernight or day care'
    );
  });

  it('keeps a hash before a number', () => {
    expect(stripMarkdownForSpeech('Option #1 is in-home care.')).toBe('Option #1 is in-home care.');
  });

  it('copes with a lone marker chunk and missing text', () => {
    expect(stripMarkdownForSpeech('**')).toBe('');
    expect(stripMarkdownForSpeech(undefined)).toBe('');
  });
});

describe('AnswerText', () => {
  const render = (props) => renderToStaticMarkup(React.createElement(AnswerText, props));
  const citations = [
    { num: 1, title: 'Taking Breaks for Family Caregivers' },
    { num: 2, title: 'Support Resources' },
  ];

  it('renders the respite answer as a list with bold labels and no asterisks', () => {
    const html = render({
      text: 'Here are your options [1]:\n\n1. **In-home respite**: a carer comes to you.\n2. **Overnight respite**: a short stay [2].\n\nAsk for a NASC assessment.',
      citations,
      onCite: () => {},
    });
    expect(html).not.toContain('**');
    expect(html).toContain('<ol');
    expect(html).toContain('<strong>In-home respite</strong>');
    expect(html).toContain('<strong>Overnight respite</strong>');
    expect(html.match(/aria-label="Open source \d"/g)).toHaveLength(2);
    expect(html).toMatch(/<p style="margin:0 0 0">Ask for a NASC assessment\.<\/p>$/);
  });

  it('puts a citation badge inside a bold run', () => {
    const html = render({ text: '**Call 111 now [1]**', citations, onCite: () => {} });
    expect(html).toMatch(/<strong>Call 111 now <button[^>]*aria-label="Open source 1"/);
  });

  it('renders headings, bullets, italics, line breaks and a list that starts later', () => {
    const html = render({
      text: '### Day programmes\nOne line\nnext line\n\n- *Ask* your GP\n\n3. Third step',
    });
    expect(html).toContain('font-weight:700">Day programmes</p>');
    expect(html).toContain('One line<br/>next line');
    expect(html).toContain('<ul');
    expect(html).toContain('<em>Ask</em> your GP');
    expect(html).toContain('<ol start="3"');
  });

  it('shows plain text unchanged when there is no Markdown or citation', () => {
    expect(render({ text: 'Call 111 immediately.' })).toBe(
      '<p style="margin:0 0 0">Call 111 immediately.</p>'
    );
    expect(render({ text: '' })).toBe('');
  });
});
