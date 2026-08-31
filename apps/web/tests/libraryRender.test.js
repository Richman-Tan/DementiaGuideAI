// ArticleBody renderer contract: every block type in the content schema must
// produce visible markup (a typo'd type silently rendering nothing is exactly
// how content would vanish without anyone noticing).
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ArticleBody, { BLOCK_TYPES } from '../src/components/ArticleBody.jsx';

const render = (blocks) => renderToStaticMarkup(React.createElement(ArticleBody, { blocks }));

describe('ArticleBody', () => {
  it('renders headings and paragraphs', () => {
    const html = render([{ t: 'h', x: 'Heading' }, { t: 'p', x: 'Body text.' }]);
    expect(html).toContain('<h2');
    expect(html).toContain('Heading');
    expect(html).toContain('<p');
    expect(html).toContain('Body text.');
  });

  it('renders unordered and ordered lists with one li per item', () => {
    const html = render([{ t: 'ul', x: ['one', 'two'] }, { t: 'ol', x: ['first', 'second', 'third'] }]);
    expect(html).toContain('<ul');
    expect(html).toContain('<ol');
    expect(html.match(/<li/g)).toHaveLength(5);
    expect(html).toContain('two');
    expect(html).toContain('third');
  });

  it('renders tip and warn callouts', () => {
    const html = render([{ t: 'tip', x: 'A tip.' }, { t: 'warn', x: 'Call 111.' }]);
    expect(html).toContain('A tip.');
    expect(html).toContain('Call 111.');
    expect(html).toContain('--amber');
  });

  it('renders every declared block type non-emptily', () => {
    for (const t of BLOCK_TYPES) {
      const x = t === 'ul' || t === 'ol' ? ['item one', 'item two'] : 'sample text';
      const html = render([{ t, x }]);
      expect(html, `block type ${t} rendered nothing`).toMatch(/item one|sample text/);
    }
  });

  it('renders nothing for unknown block types', () => {
    expect(render([{ t: 'mystery', x: 'should not appear' }])).not.toContain('should not appear');
  });
});
