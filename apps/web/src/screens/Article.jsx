import React from 'react';
import * as S from '../data/services.js';
import { useSettings } from '../state/SettingsContext.jsx';
import { useChat } from '../state/ChatContext.jsx';
import { go } from '../state/router.js';
import { catStyle } from '../lib/catStyle.js';

export default function Article({ artId }) {
  const { effDark } = useSettings();
  const { askNow } = useChat();
  const art = S.getArticle(artId);

  if (!art) {
    return (
      <section style={{ padding: '60px 0', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem' }}>We couldn't find that article</h1>
        <button
          onClick={go('#/app/library')}
          style={{
            minHeight: '48px',
            padding: '0 22px',
            borderRadius: '14px',
            border: 'none',
            background: 'var(--primary)',
            color: '#fff',
            fontWeight: '600',
            cursor: 'pointer',
          }}
          className="hv2"
        >
          Back to Library
        </button>
      </section>
    );
  }

  const y = catStyle(art.cat, effDark);
  const catName = S.getCat(art.cat).name;
  const blocks = S.bodyFor(art);
  const related = S.relatedTo(art);

  return (
    <section style={{ padding: '24px 0 48px' }}>
      <nav
        aria-label="Breadcrumb"
        style={{ marginBottom: '14px', color: 'var(--text2)', fontSize: '.92rem' }}
      >
        <a href="#/app/library">Library</a> <span style={{ padding: '0 6px' }}>/</span> {catName}
      </nav>
      <header
        style={{ borderRadius: '20px', padding: '28px', marginBottom: '26px', background: y.bg }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '5px 14px',
            borderRadius: '999px',
            fontSize: '.85rem',
            fontWeight: '700',
            background: 'var(--surface)',
            color: y.fg,
            marginBottom: '14px',
          }}
        >
          <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: y.dot }} />
          {catName}
        </span>
        <h1
          style={{
            margin: '10px 0 12px',
            fontSize: '1.9rem',
            lineHeight: '1.2',
            letterSpacing: '-.01em',
            textWrap: 'pretty',
          }}
        >
          {art.title}
        </h1>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '10px',
            color: 'var(--text)',
          }}
        >
          <span style={{ fontWeight: '600', fontSize: '.92rem' }}>{art.mins} min read</span>
          {S.tagsFor(art).map((t) => (
            <span
              key={t}
              style={{
                padding: '3px 12px',
                borderRadius: '999px',
                background: 'var(--surface)',
                fontSize: '.82rem',
                fontWeight: '600',
                color: 'var(--text2)',
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </header>
      <div style={{ maxWidth: '680px' }}>
        {blocks.map((b, i) => (
          <div key={i}>
            {b.t === 'h' && <h2 style={{ fontSize: '1.35rem', margin: '30px 0 10px' }}>{b.x}</h2>}
            {b.t === 'p' && (
              <p style={{ margin: '0 0 16px', lineHeight: '1.7', textWrap: 'pretty' }}>{b.x}</p>
            )}
            {b.t === 'tip' && (
              <div
                style={{
                  background: 'var(--tint)',
                  border: 'var(--bw) solid var(--border)',
                  borderRadius: '14px',
                  padding: '16px 18px',
                  margin: '0 0 16px',
                  lineHeight: '1.65',
                }}
              >
                {b.x}
              </div>
            )}
            {b.t === 'warn' && (
              <div
                style={{
                  background: 'var(--amber-bg)',
                  border: 'var(--bw) solid var(--amber-bd)',
                  borderLeft: '4px solid var(--amber)',
                  borderRadius: '14px',
                  padding: '16px 18px',
                  margin: '0 0 16px',
                  lineHeight: '1.65',
                }}
              >
                {b.x}
              </div>
            )}
          </div>
        ))}
        <button
          onClick={() => askNow('Tell me more about ' + art.title.toLowerCase())}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            minHeight: '52px',
            padding: '0 24px',
            borderRadius: '14px',
            border: 'none',
            background: 'var(--primary)',
            color: '#fff',
            fontSize: '1rem',
            fontWeight: '700',
            cursor: 'pointer',
            margin: '18px 0 30px',
          }}
          className="hv2"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 5h16v11H9l-5 4z" />
          </svg>
          Ask Aria about this
        </button>
        <h2 style={{ fontSize: '1.2rem', margin: '0 0 12px' }}>Related articles</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))',
            gap: '12px',
            marginBottom: '22px',
          }}
        >
          {related.map((r) => {
            const ry = catStyle(r.cat, effDark);
            return (
              <button
                key={r.id}
                onClick={go('#/app/library/' + r.id)}
                style={{
                  textAlign: 'left',
                  background: 'var(--surface)',
                  border: 'var(--bw) solid var(--border)',
                  borderRadius: '16px',
                  padding: '16px',
                  cursor: 'pointer',
                  color: 'var(--text)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  alignItems: 'flex-start',
                  boxShadow: 'var(--shadow)',
                }}
                className="hv6"
              >
                <span
                  style={{
                    padding: '3px 11px',
                    borderRadius: '999px',
                    fontSize: '.78rem',
                    fontWeight: '600',
                    background: ry.bg,
                    color: ry.fg,
                  }}
                >
                  {S.getCat(r.cat).name}
                </span>
                <span style={{ fontWeight: '700', lineHeight: '1.35' }}>{r.title}</span>
                <span style={{ color: 'var(--text2)', fontSize: '.85rem' }}>{r.mins} min</span>
              </button>
            );
          })}
        </div>
        <p style={{ color: 'var(--text2)', fontSize: '.88rem', margin: '0' }}>
          Reviewed content · Last updated June 2026
        </p>
      </div>
    </section>
  );
}
