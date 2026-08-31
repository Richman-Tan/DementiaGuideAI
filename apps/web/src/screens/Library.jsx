import React, { useEffect, useState } from 'react';
import * as S from '../data/services.js';
import { warmAll } from '../data/articles/index.js';
import { useSettings } from '../state/SettingsContext.jsx';
import { go } from '../state/router.js';
import { catStyle } from '../lib/catStyle.js';

export default function Library() {
  const { effDark } = useSettings();
  const [libQ, setLibQ] = useState('');
  const [libCat, setLibCat] = useState(null);
  const [, setWarmed] = useState(false);

  // Pre-load the article body chunks so search can match body text; the state
  // bump re-runs searchArticles once the text cache is populated.
  useEffect(() => { warmAll().then(() => setWarmed(true)); }, []);

  const filtered = S.searchArticles(libQ).filter((a) => !libCat || a.cat === libCat);
  const libCatName = libCat ? S.getCat(libCat).name : '';
  const resultLabel =
    filtered.length + (filtered.length === 1 ? ' article' : ' articles') +
    (libCatName ? ' in ' + libCatName : '') +
    (libQ.trim() ? ' matching “' + libQ.trim() + '”' : '');

  const cats = S.CATS.map((c) => {
    const sel = libCat === c.id;
    const y = catStyle(c.id, effDark);
    return {
      id: c.id, name: c.name, desc: c.desc,
      count: S.ARTICLES.filter((a) => a.cat === c.id).length + ' articles',
      bg: y.bg, fg: y.fg, dot: c.accent,
      bc: sel ? 'var(--primary)' : 'var(--border)',
      bw2: sel ? '2px' : 'var(--bw)',
      pick: () => setLibCat(sel ? null : c.id),
    };
  });

  return (
    <section style={{ padding: '28px 0 48px' }}>
      <h1 style={{ fontSize: '1.9rem', margin: '0 0 6px', letterSpacing: '-.01em' }}>Library</h1>
      <p style={{ margin: '0 0 22px', color: 'var(--text2)', fontSize: '1.05rem', textWrap: 'pretty' }}>Trusted, curated dementia-care guidance — the same knowledge Aria uses.</p>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: 'var(--surface)', border: 'var(--bw) solid var(--border)', borderRadius: '16px', padding: '6px 6px 6px 18px', boxShadow: 'var(--shadow)', maxWidth: '640px', marginBottom: '14px' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <input value={libQ} onChange={(e) => setLibQ(e.target.value)} placeholder="Search titles and topics…" aria-label="Search the library" style={{ flex: '1', minWidth: '0', minHeight: '48px', border: 'none', background: 'transparent', color: 'var(--text)', fontSize: '1rem' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', color: 'var(--text2)', fontSize: '.92rem', minHeight: '44px' }}>
        <span>{resultLabel}</span>
        {!!libCat && (
          <button onClick={() => { setLibCat(null); setLibQ(''); }} style={{ minHeight: '40px', padding: '0 14px', borderRadius: '999px', border: 'var(--bw) solid var(--border)', background: 'var(--tint)', color: 'var(--primary-d)', fontWeight: '600', cursor: 'pointer' }} className="hv7">{libCatName} ✕</button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: '14px', marginBottom: '30px' }}>
        {cats.map((c) => (
          <button key={c.id} onClick={c.pick} style={{ textAlign: 'left', borderRadius: '18px', padding: '18px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px', background: c.bg, border: `${c.bw2} solid ${c.bc}`, color: 'var(--text)' }} className="hv6">
            <span style={{ display: 'flex', alignItems: 'center', gap: '9px', fontWeight: '700', fontSize: '1.02rem', color: c.fg }}><span style={{ width: '12px', height: '12px', borderRadius: '4px', background: c.dot, flexShrink: '0' }} />{c.name}</span>
            <span style={{ fontSize: '.92rem', lineHeight: '1.45' }}>{c.desc}</span>
            <span style={{ fontSize: '.82rem', fontWeight: '600', color: c.fg }}>{c.count}</span>
          </button>
        ))}
      </div>
      {filtered.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '860px' }}>
          {filtered.map((a) => {
            const y = catStyle(a.cat, effDark);
            return (
              <button key={a.id} onClick={go('#/app/library/' + a.id)} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 16px', textAlign: 'left', background: 'var(--surface)', border: 'var(--bw) solid var(--border)', borderRadius: '16px', padding: '16px 18px', cursor: 'pointer', color: 'var(--text)', boxShadow: 'var(--shadow)' }} className="hv9">
                <span style={{ flex: '1', minWidth: '220px' }}>
                  <span style={{ display: 'block', fontWeight: '700', fontSize: '1.02rem' }}>{a.title}</span>
                  <span style={{ display: 'block', color: 'var(--text2)', fontSize: '.92rem', marginTop: '2px' }}>{a.sum}</span>
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '999px', fontSize: '.8rem', fontWeight: '600', background: y.bg, color: y.fg }}>{S.getCat(a.cat).name}</span>
                <span style={{ color: 'var(--text2)', fontSize: '.88rem', whiteSpace: 'nowrap' }}>{a.mins} min</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '40px 16px', textAlign: 'center', background: 'var(--surface)', border: 'var(--bw) solid var(--border)', borderRadius: '20px', maxWidth: '640px' }}>
          <div style={{ fontWeight: '700', fontSize: '1.1rem' }}>No matches</div>
          <p style={{ margin: '0', color: 'var(--text2)' }}>Try different words — or ask Aria in Chat instead; she can search the whole library for you.</p>
          <button onClick={go('#/app/chat')} style={{ minHeight: '48px', padding: '0 22px', borderRadius: '14px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: '600', cursor: 'pointer' }} className="hv2">Ask Aria in Chat</button>
        </div>
      )}
    </section>
  );
}
