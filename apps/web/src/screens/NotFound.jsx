import React from 'react';
import { go } from '../state/router.js';
import { AvatarBust } from '../avatar/AvatarStage.jsx';

export default function NotFound() {
  return (
    <section
      style={{
        padding: '70px 0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        textAlign: 'center',
      }}
    >
      <div style={{ animation: 'dgBreathe 5.5s ease-in-out infinite' }}>
        <AvatarBust size={110} />
      </div>
      <h1 style={{ margin: '0', fontSize: '1.7rem' }}>We couldn't find that page</h1>
      <p style={{ margin: '0', color: 'var(--text2)', maxWidth: '28em', textWrap: 'pretty' }}>
        The link may be old or mistyped. No worries — everything is still here.
      </p>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={go('#/app/home')}
          style={{
            minHeight: '50px',
            padding: '0 24px',
            borderRadius: '14px',
            border: 'none',
            background: 'var(--primary)',
            color: '#fff',
            fontWeight: '700',
            cursor: 'pointer',
          }}
          className="hv2"
        >
          Home
        </button>
        <button
          onClick={go('#/app/library')}
          style={{
            minHeight: '50px',
            padding: '0 24px',
            borderRadius: '14px',
            border: 'var(--bw) solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            fontWeight: '700',
            cursor: 'pointer',
          }}
          className="hv3"
        >
          Library
        </button>
      </div>
    </section>
  );
}
