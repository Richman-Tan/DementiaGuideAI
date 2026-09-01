import React, { useEffect, useState } from 'react';
import * as S from '../data/services.js';
import ArticleBody from '../components/ArticleBody.jsx';
import { loadBody } from '../data/articles/index.js';
import { useSettings } from '../state/SettingsContext.jsx';
import { useChat } from '../state/ChatContext.jsx';
import { go } from '../state/router.js';
import { catStyle } from '../lib/catStyle.js';

export default function Article({ artId }) {
  const { effDark } = useSettings();
  const { askNow } = useChat();
  const art = S.getArticle(artId);
  const [attempt, setAttempt] = useState(0);
  // Keyed by article id rather than cleared on navigation: resetting in the
  // effect body would set state during render, and the stale body would flash
  // on screen for a frame before it did.
  const [loaded, setLoaded] = useState({ id: null, body: null, failed: false });

  useEffect(() => {
    if (!art) return undefined;
    let live = true;
    loadBody(art.id, art.cat).then(
      (b) => { if (live) setLoaded({ id: art.id, body: b, failed: !b }); },
      () => { if (live) setLoaded({ id: art.id, body: null, failed: true }); }
    );
    return () => { live = false; };
  }, [art, attempt]);

  const settled = loaded.id === artId;
  const body = settled ? loaded.body : null;
  const failed = settled && loaded.failed;

  if (!art) {
    return (
      <section style={{ padding: '60px 0', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem' }}>We couldn't find that article</h1>
        <button onClick={go('#/app/library')} style={{ minHeight: '48px', padding: '0 22px', borderRadius: '14px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: '600', cursor: 'pointer' }} className="hv2">Back to Library</button>
      </section>
    );
  }

  const y = catStyle(art.cat, effDark);
  const catName = S.getCat(art.cat).name;
  const related = S.relatedTo(art);

  return (
    <section style={{ padding: '24px 0 48px' }}>
      <nav aria-label="Breadcrumb" style={{ marginBottom: '14px', color: 'var(--text2)', fontSize: '.92rem' }}><a href="#/app/library">Library</a> <span style={{ padding: '0 6px' }}>/</span> {catName}</nav>
      <header style={{ borderRadius: '20px', padding: '28px', marginBottom: '26px', background: y.bg }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '5px 14px', borderRadius: '999px', fontSize: '.85rem', fontWeight: '700', background: 'var(--surface)', color: y.fg, marginBottom: '14px' }}><span style={{ width: '9px', height: '9px', borderRadius: '50%', background: y.dot }} />{catName}</span>
        <h1 style={{ margin: '10px 0 12px', fontSize: '1.9rem', lineHeight: '1.2', letterSpacing: '-.01em', textWrap: 'pretty' }}>{art.title}</h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', color: 'var(--text)' }}>
          <span style={{ fontWeight: '600', fontSize: '.92rem' }}>{art.mins} min read</span>
          {S.tagsFor(art).map((t) => (
            <span key={t} style={{ padding: '3px 12px', borderRadius: '999px', background: 'var(--surface)', fontSize: '.82rem', fontWeight: '600', color: 'var(--text2)' }}>{t}</span>
          ))}
        </div>
      </header>
      <div style={{ maxWidth: '680px' }}>
        {body && <ArticleBody blocks={body.blocks} />}
        {!body && !failed && <p style={{ color: 'var(--text2)', margin: '0 0 16px' }}>Loading article…</p>}
        {failed && (
          <div style={{ background: 'var(--surface)', border: 'var(--bw) solid var(--border)', borderRadius: '16px', padding: '20px', margin: '0 0 16px' }}>
            <p style={{ margin: '0 0 12px', lineHeight: '1.65' }}>This article couldn't be loaded. Check your connection and try again.</p>
            <button onClick={() => setAttempt((n) => n + 1)} style={{ minHeight: '44px', padding: '0 18px', borderRadius: '12px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: '600', cursor: 'pointer' }} className="hv2">Try again</button>
          </div>
        )}
        <button onClick={() => askNow('Tell me more about ' + art.title.toLowerCase())} style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', minHeight: '52px', padding: '0 24px', borderRadius: '14px', border: 'none', background: 'var(--primary)', color: '#fff', fontSize: '1rem', fontWeight: '700', cursor: 'pointer', margin: '18px 0 30px' }} className="hv2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v11H9l-5 4z" /></svg>
          Ask Aria about this
        </button>
        <h2 style={{ fontSize: '1.2rem', margin: '0 0 12px' }}>Related articles</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '12px', marginBottom: '22px' }}>
          {related.map((r) => {
            const ry = catStyle(r.cat, effDark);
            return (
              <button key={r.id} onClick={go('#/app/library/' + r.id)} style={{ textAlign: 'left', background: 'var(--surface)', border: 'var(--bw) solid var(--border)', borderRadius: '16px', padding: '16px', cursor: 'pointer', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start', boxShadow: 'var(--shadow)' }} className="hv6">
                <span style={{ padding: '3px 11px', borderRadius: '999px', fontSize: '.78rem', fontWeight: '600', background: ry.bg, color: ry.fg }}>{S.getCat(r.cat).name}</span>
                <span style={{ fontWeight: '700', lineHeight: '1.35' }}>{r.title}</span>
                <span style={{ color: 'var(--text2)', fontSize: '.85rem' }}>{r.mins} min</span>
              </button>
            );
          })}
        </div>
        {body && body.sources && body.sources.length > 0 && (
          <div style={{ borderTop: 'var(--bw) solid var(--border)', paddingTop: '16px' }}>
            <h2 style={{ fontSize: '1.05rem', margin: '0 0 8px' }}>Sources</h2>
            <ul style={{ margin: '0 0 10px', paddingLeft: '22px', lineHeight: '1.7' }}>
              {body.sources.map((s, i) => (
                <li key={i} style={{ marginBottom: '4px', fontSize: '.92rem' }}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-d)' }}>{s.org} — {s.title}</a>
                </li>
              ))}
            </ul>
            <p style={{ color: 'var(--text2)', fontSize: '.88rem', margin: '0' }}>Adapted for Aotearoa New Zealand · Last updated {body.updated}</p>
          </div>
        )}
      </div>
    </section>
  );
}
