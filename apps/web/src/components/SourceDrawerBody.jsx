// The source drawer's content, presentational so tests can render every shape
// it has to handle. In mock mode citations ARE library articles ({id,title,
// cat}); in real mode they are KB source objects ({title,org,excerpt,url,
// articleId?}) — both render truthfully here.
//
// Action rules, shaped by pilot feedback ("might want to say they open in a new
// tab… not all of them had links"):
//   - a matched library article gets the in-app button, AND the original
//     source link when one exists (it used to be suppressed by the match);
//   - every external link says it opens in a new tab — the ↗ glyph alone
//     wasn't read as that by an older tester;
//   - a source with no link says so quietly instead of offering nothing.
import React from 'react';
import * as S from '../data/services.js';
import { catStyle } from '../lib/catStyle.js';

export function SourceDrawerBody({ drawer, effDark, onOpenArticle }) {
  const art = drawer.id ? S.getArticle(drawer.id) : null;
  const articleId = drawer.articleId || (art ? art.id : null);
  const cat = art ? art.cat : drawer.cat;
  const y = cat ? catStyle(cat, effDark) : null;
  const chipLabel = art ? S.getCat(art.cat).name : drawer.org || 'Source';
  const title = drawer.title || (art ? art.title : '');
  const excerpt = art ? S.excerptFor(art) : drawer.excerpt || '';
  const metaLine = art ? `Reviewed content · ${art.mins} min read` : drawer.org ? `Source: ${drawer.org}` : 'Knowledge base source';

  const actionBase = { minHeight: '50px', borderRadius: '14px', fontWeight: '600', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' };
  const linkStyle = articleId
    ? { ...actionBase, border: 'var(--bw) solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }
    : { ...actionBase, border: 'none', background: 'var(--primary)', color: '#fff' };

  return (
    <>
      <span style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '999px', fontSize: '.82rem', fontWeight: '600', background: y ? y.bg : 'var(--tint)', color: y ? y.fg : 'var(--primary-d)' }}>
        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: y ? y.dot : 'var(--primary)' }} />{chipLabel}
      </span>
      <h2 style={{ margin: '0', fontSize: '1.35rem', lineHeight: '1.3' }}>{title}</h2>
      <p style={{ margin: '0', color: 'var(--text2)', lineHeight: '1.65' }}>{excerpt}</p>
      <p style={{ margin: '0', color: 'var(--text2)', fontSize: '.88rem' }}>{metaLine}</p>
      {articleId && (
        <button onClick={() => onOpenArticle(articleId)} style={{ ...actionBase, border: 'none', background: 'var(--primary)', color: '#fff' }} className="hv2">
          {art ? 'Read full article →' : 'Read related article →'}
        </button>
      )}
      {drawer.url && (
        <a
          href={drawer.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View original source — opens in a new tab"
          style={linkStyle}
          className="hv2"
        >
          View original source (opens in a new tab)
        </a>
      )}
      {!articleId && !drawer.url && (
        <p style={{ margin: '0', color: 'var(--text2)', fontSize: '.92rem', lineHeight: 1.6 }}>
          {drawer.org
            ? `This source doesn’t have a public link — it comes from ${drawer.org}’s materials.`
            : 'This source doesn’t have a public link.'}
        </p>
      )}
    </>
  );
}
