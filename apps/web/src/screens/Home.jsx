// Home — a no-scroll, viewport-fit dashboard: full-height avatar tile on the
// left (video-call style), everything else in a flexible right column. Wide
// rows that can't fit (featured resources, mobile quick questions) scroll
// horizontally INSIDE their strip; the page itself never scrolls.
import React, { useState } from 'react';
import * as S from '../data/services.js';
import { useSettings } from '../state/SettingsContext.jsx';
import { useChat } from '../state/ChatContext.jsx';
import { go, useWidth } from '../state/router.js';
import { catStyle } from '../lib/catStyle.js';
import { AvatarBust, AvatarHomeStage } from '../avatar/AvatarStage.jsx';
import { useEffectiveAvatarProfile } from '../avatar/effectiveProfile.js';

const MicIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0" /><path d="M12 17v4" /></svg>
);

export default function Home() {
  const { settings, effDark } = useSettings();
  const { askNow } = useChat();
  const [homeQ, setHomeQ] = useState('');
  const who = useEffectiveAvatarProfile(settings.avatarId).name;
  const width = useWidth();
  const isMobile = width < 768;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const submit = () => {
    if (!homeQ.trim()) return;
    const q = homeQ;
    setHomeQ('');
    askNow(q);
  };
  const featured = S.FEATURED.map((f) => {
    const a = S.getArticle(f.id);
    const y = catStyle(a.cat, effDark);
    return { title: a.title, mins: f.mins + ' min', catName: S.getCat(a.cat).name, chipBg: y.bg, chipFg: y.fg, open: go('#/app/library/' + a.id) };
  });

  const card = { background: 'var(--surface)', border: 'var(--bw) solid var(--border)', borderRadius: '16px', boxShadow: 'var(--shadow)' };

  return (
    <section style={{ height: isMobile ? 'calc(100dvh - 96px - var(--study-overlay-h, 0px))' : 'calc(100dvh - var(--study-overlay-h, 0px))', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: isMobile ? '10px' : '14px', padding: isMobile ? '12px 0 4px' : '20px 0 18px', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0 }}>
        <h1 style={{ fontSize: 'clamp(1.25rem, 2.4vw, 1.8rem)', margin: 0, letterSpacing: '-.01em' }}>{greeting}</h1>
        {!isMobile && (
          <p style={{ margin: '4px 0 0', color: 'var(--text2)', fontSize: 'clamp(.9rem, 1.3vw, 1.02rem)', textWrap: 'pretty' }}>
            Ask a question, explore resources, or start a conversation about dementia care.
          </p>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '10px' : '18px' }}>
        {/* Avatar tile — full height on desktop, top band on mobile */}
        <div style={{ flex: isMobile ? '0 0 32%' : '0 0 clamp(250px, 26vw, 380px)', minHeight: 0, borderRadius: '22px', border: 'var(--bw) solid var(--border)', background: 'radial-gradient(circle at 50% 28%, var(--tint) 0%, transparent 75%), linear-gradient(160deg, var(--tint), var(--surface))', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
          {settings.showAvatar ? (
            <AvatarHomeStage />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ animation: 'dgBreathe 5.5s ease-in-out infinite' }}><AvatarBust size={110} /></div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: isMobile ? '10px' : '14px', overflowY: 'auto' }}>
          <div style={{ ...card, padding: isMobile ? '12px 14px' : '16px 18px', flexShrink: 0 }}>
            {!isMobile && <label htmlFor="dg-ask" style={{ display: 'block', fontWeight: 600, marginBottom: '10px' }}>What would you like to know?</label>}
            <div style={{ display: 'flex', gap: '10px' }}>
              <input id="dg-ask" value={homeQ} onChange={(e) => setHomeQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} placeholder="Type your question…" aria-label="What would you like to know?" style={{ flex: 1, minWidth: 0, minHeight: '48px', padding: '0 16px', borderRadius: '13px', border: 'var(--bw) solid var(--border)', background: 'var(--elev)', color: 'var(--text)', fontSize: '1rem', boxSizing: 'border-box' }} />
              <button onClick={submit} aria-label="Send question" style={{ width: '48px', height: '48px', flexShrink: 0, borderRadius: '13px', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="hv2"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h14" /><path d="M13 6l6 6-6 6" /></svg></button>
              <button onClick={go('#/app/voice')} aria-label={`Ask ${who} by voice`} style={{ width: '48px', height: '48px', flexShrink: 0, borderRadius: '13px', border: 'var(--bw) solid var(--border)', background: 'var(--tint)', color: 'var(--primary-d)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="hv7"><MicIcon /></button>
            </div>
          </div>

          <div style={{ flexShrink: 0 }}>
            <div style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--text2)', fontSize: '.82rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>Quick questions</div>
            <div style={isMobile
              ? { display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }
              : { display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {S.QUICK_QUESTIONS.map((q) => (
                <button key={q} onClick={() => askNow(q)} style={{ minHeight: '40px', padding: '6px 14px', borderRadius: '999px', border: 'var(--bw) solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', textAlign: 'left', fontSize: 'clamp(.85rem, 1.2vw, .95rem)', whiteSpace: isMobile ? 'nowrap' : 'normal', flexShrink: 0 }} className="hv8">{q}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, 1fr)`, gap: '10px', flexShrink: 0 }}>
            {[['Chat', 'Ask questions', '#/app/chat'], ['Voice', `Talk with ${who}`, '#/app/voice'], ['Library', '49 curated articles', '#/app/library'], ['Settings', 'Make it yours', '#/app/settings']].map(([t, sub, r]) => (
              <button key={t} onClick={go(r)} style={{ ...card, textAlign: 'left', padding: isMobile ? '10px 12px' : '12px 14px', cursor: 'pointer', color: 'var(--text)', minWidth: 0 }} className="hv9">
                <div style={{ fontWeight: 700, fontSize: 'clamp(.92rem, 1.3vw, 1.02rem)', marginBottom: '2px' }}>{t}</div>
                <div style={{ color: 'var(--text2)', fontSize: 'clamp(.78rem, 1.1vw, .9rem)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
              </button>
            ))}
          </div>

          <div style={{ flexShrink: 0, marginTop: 'auto', minHeight: 0 }}>
            <div style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--text2)', fontSize: '.82rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>Featured resources</div>
            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
              {featured.map((f) => (
                <button key={f.title} onClick={f.open} style={{ ...card, flex: '0 0 auto', width: isMobile ? '180px' : 'clamp(190px, 21vw, 250px)', textAlign: 'left', padding: '12px 14px', cursor: 'pointer', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }} className="hv6">
                  <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: '999px', fontSize: '.75rem', fontWeight: 600, background: f.chipBg, color: f.chipFg }}>{f.catName}</span>
                  <span style={{ fontWeight: 700, fontSize: 'clamp(.85rem, 1.2vw, .95rem)', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{f.title}</span>
                  <span style={{ color: 'var(--text2)', fontSize: '.8rem' }}>{f.mins} read</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
