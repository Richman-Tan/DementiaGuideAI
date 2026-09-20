// The source drawer's action rules — the part of citations the pilot tester
// hit: "The links to original sources were good (might want to say they open
// in a new tab?) but not all of them had links". Three shapes arrive here and
// each must offer the most it truthfully can.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SourceDrawerBody } from '../src/components/SourceDrawerBody.jsx';

const render = (drawer) =>
  renderToStaticMarkup(
    React.createElement(SourceDrawerBody, { drawer, effDark: false, onOpenArticle: () => {} }),
  );

describe('a KB source matched to a library article, with a URL', () => {
  const html = render({
    title: 'Sleep Disturbances', org: 'Alzheimers NZ',
    url: 'https://alzheimers.org.nz/', excerpt: '…', articleId: 'managing-sundowning',
  });

  it('offers the in-app article AND the original source', () => {
    // The article match used to suppress the external link entirely — a source
    // that WAS linkable showed no link, which read as "not all of them had links".
    expect(html).toContain('Read related article');
    expect(html).toContain('https://alzheimers.org.nz/');
  });

  it('says the link opens in a new tab, in words', () => {
    expect(html).toContain('(opens in a new tab)');
    expect(html).toContain('aria-label="View original source — opens in a new tab"');
  });

  it('opens safely', () => {
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});

describe('a KB source with a URL and no article match', () => {
  const html = render({ title: 'iSupport module', org: 'World Health Organization', url: 'https://iris.who.int/handle/10665/324794', excerpt: '…' });

  it('offers only the external link, with the new-tab wording', () => {
    expect(html).toContain('https://iris.who.int/handle/10665/324794');
    expect(html).toContain('(opens in a new tab)');
    expect(html).not.toContain('article');
  });
});

describe('a KB source with no URL at all', () => {
  const html = render({ title: 'Routines', org: 'Alzheimers NZ', url: null, excerpt: '…' });

  it('renders no dead-end anchor', () => {
    expect(html).not.toContain('<a ');
  });

  it('says quietly why there is no link, naming the organisation', () => {
    expect(html).toContain('doesn’t have a public link');
    expect(html).toContain('Alzheimers NZ’s materials');
  });

  it('still attributes the source', () => {
    expect(html).toContain('Source: Alzheimers NZ');
  });
});

describe('a mock-mode citation (a library article itself)', () => {
  const html = render({ id: 'managing-sundowning', title: 'Managing Sundowning Behaviour', cat: 'caregiving' });

  it('renders the article path with its reviewed-content meta', () => {
    expect(html).toContain('Read full article');
    expect(html).toContain('Reviewed content');
    // An article is not an unlinked KB source — no apology line.
    expect(html).not.toContain('public link');
  });
});
