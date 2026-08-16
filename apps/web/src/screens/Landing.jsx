import React from 'react';
import { AvatarStageCard } from '../avatar/AvatarStage.jsx';
import BrandMark from '../components/BrandMark.jsx';

export default function Landing({ openApp, browseLibrary }) {
  return (
    <section style={{ maxWidth: '1160px', margin: '0 auto', padding: '0 24px 40px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <BrandMark size={36} tile />
          <strong style={{ fontSize: '1.1rem', letterSpacing: '.01em' }}>DementiaGuide AI</strong>
        </div>
        <button onClick={openApp} style={{ minHeight: '44px', padding: '0 20px', borderRadius: '12px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: '600', cursor: 'pointer' }} className="hv1">Open the app</button>
      </header>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '36px', alignItems: 'center', padding: '32px 0 44px' }}>
        <div style={{ flex: '1 1 380px', minWidth: '300px' }}>
          <h1 style={{ fontSize: '2.5rem', lineHeight: '1.15', margin: '0 0 16px', letterSpacing: '-.015em', textWrap: 'pretty' }}>Dementia care answers you can actually talk to.</h1>
          <p style={{ fontSize: '1.15rem', color: 'var(--text2)', margin: '0 0 26px', maxWidth: '34em', textWrap: 'pretty' }}>Aria is a caring AI guide who answers your questions with trusted, cited information — by text or voice.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <button onClick={openApp} style={{ minHeight: '52px', padding: '0 26px', borderRadius: '14px', border: 'none', background: 'var(--primary)', color: '#fff', fontSize: '1.05rem', fontWeight: '600', cursor: 'pointer' }} className="hv2">Open the app</button>
            <button onClick={browseLibrary} style={{ minHeight: '52px', padding: '0 26px', borderRadius: '14px', border: 'var(--bw) solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '1.05rem', fontWeight: '600', cursor: 'pointer' }} className="hv3">Browse the library</button>
          </div>
        </div>
        <div style={{ flex: '1 1 320px', minWidth: '280px', display: 'flex', justifyContent: 'center' }}>
          <AvatarStageCard />
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center', paddingBottom: '40px' }}>
        {['Grounded answers with sources', 'Private — conversations stay on your device', 'Designed with accessibility first'].map((t) => (
          <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minHeight: '44px', padding: '0 18px', borderRadius: '999px', border: 'var(--bw) solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', fontWeight: '500' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)' }} />{t}
          </span>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '18px', paddingBottom: '44px' }}>
        <div style={{ background: 'var(--surface)', border: 'var(--bw) solid var(--border)', borderRadius: '20px', boxShadow: 'var(--shadow)', padding: '24px' }}>
          <h3 style={{ margin: '0 0 6px', fontSize: '1.15rem' }}>Chat</h3>
          <p style={{ margin: '0 0 16px', color: 'var(--text2)' }}>Ask anything about dementia care and get plain-language answers with sources you can check.</p>
          <div style={{ background: 'var(--elev)', border: 'var(--bw) solid var(--border)', borderRadius: '14px', padding: '12px' }}>
            <div style={{ background: 'var(--surface)', border: 'var(--bw) solid var(--border)', borderRadius: '12px', padding: '10px 12px', fontSize: '.9rem' }}>Sundowning is very common — a calm afternoon routine helps most. <sup style={{ color: 'var(--primary-d)', fontWeight: '700' }}>[1]</sup></div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '8px', padding: '5px 10px', borderRadius: '999px', background: 'var(--tint)', fontSize: '.8rem', color: 'var(--text)' }}><span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#E8956D' }} />Managing Sundowning Behaviour</div>
          </div>
        </div>
        <div style={{ background: 'var(--surface)', border: 'var(--bw) solid var(--border)', borderRadius: '20px', boxShadow: 'var(--shadow)', padding: '24px' }}>
          <h3 style={{ margin: '0 0 6px', fontSize: '1.15rem' }}>Voice</h3>
          <p style={{ margin: '0 0 16px', color: 'var(--text2)' }}>Hands-free conversation — just talk, and Aria answers aloud with captions.</p>
          <div style={{ background: 'var(--elev)', border: 'var(--bw) solid var(--border)', borderRadius: '14px', padding: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', height: '56px', boxSizing: 'border-box' }}>
            {[['var(--primary)', 0], ['var(--primary)', 0.15], ['var(--primary-l)', 0.3], ['var(--primary)', 0.45], ['var(--primary-l)', 0.6]].map(([c, d], i) => (
              <span key={i} style={{ width: '5px', height: '26px', borderRadius: '3px', background: c, animation: `dgBar 1s ease-in-out ${d}s infinite` }} />
            ))}
          </div>
        </div>
        <div style={{ background: 'var(--surface)', border: 'var(--bw) solid var(--border)', borderRadius: '20px', boxShadow: 'var(--shadow)', padding: '24px' }}>
          <h3 style={{ margin: '0 0 6px', fontSize: '1.15rem' }}>Library</h3>
          <p style={{ margin: '0 0 16px', color: 'var(--text2)' }}>49 curated articles across 7 dementia-care categories — the same knowledge Aria uses.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '6px' }}>
            {['#E8956D', '#4A7C8E', '#F0C070', '#9B8DC4', '#D4756B', '#7FB5A0', '#5B9BD5'].map((c) => (
              <span key={c} style={{ height: '26px', borderRadius: '8px', background: c, opacity: '.75' }} />
            ))}
            <span style={{ height: '26px', borderRadius: '8px', border: 'var(--bw) dashed var(--border)' }} />
          </div>
        </div>
      </div>
      <div style={{ background: 'var(--surface)', border: 'var(--bw) solid var(--border)', borderRadius: '20px', padding: '28px', marginBottom: '44px' }}>
        <h2 style={{ margin: '0 0 20px', fontSize: '1.4rem', textAlign: 'center' }}>How it works</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '20px' }}>
          {[['1', 'Ask', 'Type or speak your question in everyday words.'], ['2', 'Aria checks the trusted library', 'Every answer is grounded in curated, reviewed articles.'], ['3', 'You get a clear answer', 'Plain language, with sources you can read in full.']].map(([n, t, d]) => (
            <div key={n} style={{ textAlign: 'center' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'var(--tint)', color: 'var(--primary-d)', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>{n}</div>
              <strong>{t}</strong>
              <p style={{ margin: '6px 0 0', color: 'var(--text2)' }}>{d}</p>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: 'var(--amber-bg)', border: 'var(--bw) solid var(--amber-bd)', borderRadius: '16px', padding: '18px 22px', textAlign: 'center', color: 'var(--text)', marginBottom: '28px' }}>
        <strong>DementiaGuide AI provides general information, not medical advice.</strong> Always consult a health professional for decisions about care.
      </div>
      <footer style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 22px', justifyContent: 'center', alignItems: 'center', padding: '8px 0 20px', color: 'var(--text2)', fontSize: '.9rem' }}>
        <a href="#/privacy">Privacy Policy</a><a href="#/disclaimer">Medical Disclaimer</a><span>University of Auckland · Part IV Software Engineering project</span>
      </footer>
    </section>
  );
}
