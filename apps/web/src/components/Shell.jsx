// App shell: desktop sidebar / tablet icon rail / mobile bottom tab bar.
import React from 'react';
import { go } from '../state/router.js';
import { useSettings } from '../state/SettingsContext.jsx';
import { useEffectiveAvatarProfile } from '../avatar/effectiveProfile.js';
import BrandMark from './BrandMark.jsx';

const I = {
  home: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11 12 4l8 7" /><path d="M6 10v9h12v-9" /></svg>,
  chat: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v11H9l-5 4z" /></svg>,
  mic: (s = 22) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0" /><path d="M12 17v4" /></svg>,
  lib: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h7v14H4z" /><path d="M13 5h7v14h-7z" /></svg>,
  set: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7h14M5 12h14M5 17h14" /><circle cx="9" cy="7" r="2" fill="var(--surface)" /><circle cx="15" cy="12" r="2" fill="var(--surface)" /><circle cx="9" cy="17" r="2" fill="var(--surface)" /></svg>,
};

const NAV = [
  ['home', 'Home', '#/app/home', I.home],
  ['chat', 'Chat', '#/app/chat', I.chat],
  ['lib', 'Library', '#/app/library', I.lib],
  ['set', 'Settings', '#/app/settings', I.set],
];

const navStyle = (on) => ({
  bg: on ? 'var(--tint)' : 'transparent',
  c: on ? 'var(--primary-d)' : 'var(--text2)',
  dot: on ? 'var(--primary)' : 'transparent',
});

export default function Shell({ active, isDesktop, isTablet, isMobile, children }) {
  const { settings, setSetting, effDark } = useSettings();
  const talkTo = `Talk to ${useEffectiveAvatarProfile(settings.avatarId).name}`;

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - var(--study-overlay-h, 0px))' }}>
      {isDesktop && (
        <aside style={{ width: '260px', flexShrink: '0', position: 'sticky', top: 'var(--study-overlay-h, 0px)', height: 'calc(100vh - var(--study-overlay-h, 0px))', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '4px', background: 'var(--surface)', borderRight: 'var(--bw) solid var(--border)', padding: '22px 14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0 10px 18px' }}>
            <BrandMark size={34} tile />
            <strong style={{ fontSize: '1.02rem' }}>DementiaGuide AI</strong>
          </div>
          {NAV.map(([key, label, route, icon]) => {
            const n = navStyle(active === key);
            return (
              <button key={key} onClick={go(route)} style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '48px', padding: '0 14px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: '600', textAlign: 'left', background: n.bg, color: n.c }} className="hv3">{icon}<span>{label}</span></button>
            );
          })}
          <button onClick={go('#/app/voice')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', minHeight: '54px', marginTop: '14px', borderRadius: '16px', border: 'none', cursor: 'pointer', fontSize: '1.02rem', fontWeight: '700', background: 'var(--primary)', color: '#fff', boxShadow: 'var(--shadow)' }} className="hv1">{I.mic(20)}{talkTo}</button>
          <div style={{ flex: '1' }} />
          <button onClick={() => setSetting('darkMode', !effDark)} style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: '44px', padding: '0 14px', borderRadius: '12px', border: 'var(--bw) solid var(--border)', background: 'var(--elev)', color: 'var(--text2)', fontWeight: '600', cursor: 'pointer' }} className="hv3">
            <span style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'linear-gradient(90deg,var(--text2) 50%,transparent 50%)', border: '2px solid var(--text2)', boxSizing: 'border-box' }} />
            {effDark ? 'Light theme' : 'Dark theme'}
          </button>
          <div style={{ padding: '12px 10px 0', color: 'var(--text2)', fontSize: '.8rem' }}>v1.0 · Made in Aotearoa NZ</div>
        </aside>
      )}
      {isTablet && (
        <aside style={{ width: '72px', flexShrink: '0', position: 'sticky', top: 'var(--study-overlay-h, 0px)', height: 'calc(100vh - var(--study-overlay-h, 0px))', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', background: 'var(--surface)', borderRight: 'var(--bw) solid var(--border)', padding: '20px 0 16px' }}>
          <BrandMark size={36} tile style={{ marginBottom: '14px' }} />
          {NAV.slice(0, 2).map(([key, label, route, icon]) => {
            const n = navStyle(active === key);
            return <button key={key} onClick={go(route)} title={label} aria-label={label} style={{ width: '48px', height: '48px', borderRadius: '12px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: n.bg, color: n.c }} className="hv3">{icon}</button>;
          })}
          <button onClick={go('#/app/voice')} title={talkTo} aria-label={talkTo} style={{ width: '52px', height: '52px', borderRadius: '16px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--primary)', color: '#fff', boxShadow: 'var(--shadow)' }} className="hv2">{I.mic()}</button>
          {NAV.slice(2).map(([key, label, route, icon]) => {
            const n = navStyle(active === key);
            return <button key={key} onClick={go(route)} title={label} aria-label={label} style={{ width: '48px', height: '48px', borderRadius: '12px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: n.bg, color: n.c }} className="hv3">{icon}</button>;
          })}
        </aside>
      )}
      <main style={{ flex: '1', minWidth: '0', paddingBottom: isMobile ? '96px' : '0px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px', boxSizing: 'border-box' }}>
          {children}
        </div>
      </main>
      {isMobile && (
        <nav aria-label="Main" style={{ position: 'fixed', bottom: '0', left: '0', right: '0', zIndex: '40', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', background: 'var(--surface)', borderTop: 'var(--bw) solid var(--border)', padding: '6px 4px 10px' }}>
          {NAV.slice(0, 2).map(([key, label, route, icon]) => {
            const n = navStyle(active === key);
            return (
              <button key={key} onClick={go(route)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', minWidth: '56px', minHeight: '48px', border: 'none', background: 'none', cursor: 'pointer', color: n.c, fontSize: '.72rem', fontWeight: '600' }}>{icon}{label}<span style={{ width: '5px', height: '5px', borderRadius: '50%', background: n.dot }} /></button>
            );
          })}
          <button onClick={go('#/app/voice')} aria-label={talkTo} style={{ width: '56px', height: '56px', borderRadius: '50%', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'translateY(-18px)', boxShadow: '0 4px 14px rgba(45,95,112,.4)' }} className="hv2">{I.mic(24)}</button>
          {NAV.slice(2).map(([key, label, route, icon]) => {
            const n = navStyle(active === key);
            return (
              <button key={key} onClick={go(route)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', minWidth: '56px', minHeight: '48px', border: 'none', background: 'none', cursor: 'pointer', color: n.c, fontSize: '.72rem', fontWeight: '600' }}>{icon}{label}<span style={{ width: '5px', height: '5px', borderRadius: '50%', background: n.dot }} /></button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
