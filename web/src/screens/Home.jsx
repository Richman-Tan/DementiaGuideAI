import React, { useState } from 'react';
import * as S from '../data/services.js';
import { useSettings } from '../state/SettingsContext.jsx';
import { useChat } from '../state/ChatContext.jsx';
import { go } from '../state/router.js';
import { catStyle } from '../lib/catStyle.js';
import { AvatarHomeStage } from '../avatar/AvatarStage.jsx';
import { useEffectiveAvatarProfile } from '../avatar/effectiveProfile.js';

const MicIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0" /><path d="M12 17v4" /></svg>
);

export default function Home() {
  const { settings, effDark } = useSettings();
  const { askNow } = useChat();
  const [homeQ, setHomeQ] = useState('');
  const who = useEffectiveAvatarProfile(settings.avatarId).name;

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

  return (
    <section style={{ padding: '28px 0 40px' }}>
      <h1 style={{ fontSize: '1.9rem', margin: '0 0 6px', letterSpacing: '-.01em' }}>{greeting}</h1>
      <p style={{ margin: '0 0 26px', color: 'var(--text2)', fontSize: '1.05rem', textWrap: 'pretty' }}>Ask a question, explore resources, or start a conversation about dementia care.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginBottom: '28px' }}>
        <div style={{ flex: '1 1 300px', minWidth: '270px', borderRadius: '22px', border: 'var(--bw) solid var(--border)', background: 'radial-gradient(circle at 50% 28%,var(--tint) 0%,transparent 75%),linear-gradient(160deg,var(--tint),var(--surface))', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '28px', boxSizing: 'border-box' }}>
          {settings.showAvatar && <AvatarHomeStage />}
          <div style={{ fontWeight: '600', fontSize: '1.1rem' }}>{who}</div>
          <div style={{ color: 'var(--text2)' }}>Ready when you are</div>
        </div>
        <div style={{ flex: '2 1 420px', minWidth: '280px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ background: 'var(--surface)', border: 'var(--bw) solid var(--border)', borderRadius: '20px', boxShadow: 'var(--shadow)', padding: '20px' }}>
            <label htmlFor="dg-ask" style={{ display: 'block', fontWeight: '600', marginBottom: '10px' }}>What would you like to know?</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input id="dg-ask" value={homeQ} onChange={(e) => setHomeQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} placeholder="Type your question…" style={{ flex: '1', minWidth: '0', minHeight: '52px', padding: '0 16px', borderRadius: '14px', border: 'var(--bw) solid var(--border)', background: 'var(--elev)', color: 'var(--text)', fontSize: '1rem', boxSizing: 'border-box' }} />
              <button onClick={submit} aria-label="Send question" style={{ width: '52px', height: '52px', flexShrink: '0', borderRadius: '14px', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="hv2"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h14" /><path d="M13 6l6 6-6 6" /></svg></button>
              <button onClick={go('#/app/voice')} aria-label="Ask by voice" style={{ width: '52px', height: '52px', flexShrink: '0', borderRadius: '14px', border: 'var(--bw) solid var(--border)', background: 'var(--tint)', color: 'var(--primary-d)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="hv7"><MicIcon /></button>
            </div>
          </div>
          <div>
            <div style={{ fontWeight: '600', marginBottom: '10px', color: 'var(--text2)', fontSize: '.92rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>Quick questions</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {S.QUICK_QUESTIONS.map((q) => (
                <button key={q} onClick={() => askNow(q)} style={{ minHeight: '44px', padding: '8px 16px', borderRadius: '999px', border: 'var(--bw) solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', textAlign: 'left' }} className="hv8">{q}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '14px', marginBottom: '32px' }}>
        {[['Chat', 'Ask questions', '#/app/chat'], ['Voice', `Talk with ${who}`, '#/app/voice'], ['Library', 'Browse 49 curated articles', '#/app/library'], ['Settings', 'Make it yours', '#/app/settings']].map(([t, sub, r]) => (
          <button key={t} onClick={go(r)} style={{ textAlign: 'left', background: 'var(--surface)', border: 'var(--bw) solid var(--border)', borderRadius: '18px', boxShadow: 'var(--shadow)', padding: '18px', cursor: 'pointer', color: 'var(--text)' }} className="hv9">
            <div style={{ fontWeight: '700', fontSize: '1.05rem', marginBottom: '4px' }}>{t}</div>
            <div style={{ color: 'var(--text2)' }}>{sub}</div>
          </button>
        ))}
      </div>
      <div style={{ fontWeight: '600', marginBottom: '12px', color: 'var(--text2)', fontSize: '.92rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>Featured resources</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: '14px' }}>
        {featured.map((f) => (
          <button key={f.title} onClick={f.open} style={{ textAlign: 'left', background: 'var(--surface)', border: 'var(--bw) solid var(--border)', borderRadius: '18px', boxShadow: 'var(--shadow)', padding: '18px', cursor: 'pointer', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }} className="hv6">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '999px', fontSize: '.82rem', fontWeight: '600', background: f.chipBg, color: f.chipFg }}>{f.catName}</span>
            <span style={{ fontWeight: '700', fontSize: '1.02rem', lineHeight: '1.35' }}>{f.title}</span>
            <span style={{ color: 'var(--text2)', fontSize: '.9rem' }}>{f.mins} read</span>
          </button>
        ))}
      </div>
    </section>
  );
}
