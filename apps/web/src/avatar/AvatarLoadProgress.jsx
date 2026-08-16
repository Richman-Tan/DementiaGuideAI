// Loading feedback for the one-time Unity avatar boot. Two honest phases:
// a real percentage while the ~234MB build downloads (byte-accurate), then an
// explicit "preparing" state for the wasm-compile/scene-boot stretch during
// which the loader reports nothing. The bar is width-driven (not keyframed) and every
// state carries its meaning in text, so prefers-reduced-motion and screen
// readers lose nothing.
import React from 'react';
import { AvatarBust } from './AvatarStage.jsx';
import { ensureUnityBoot } from './unity/unityBridge.js';

export function AvatarLoadProgress({ phase, pct, name, compact = false }) {
  const bustSize = compact ? 90 : 150;
  const titleSize = compact ? '.98rem' : '1.15rem';
  const subSize = compact ? '.82rem' : '.95rem';
  const percent = Math.round(pct * 100);

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: compact ? '10px' : '16px', padding: '0 20px', textAlign: 'center' }}>
      <div style={{ animation: phase === 'preparing' ? 'dgShimmer 1.4s ease-in-out infinite' : 'dgBreathe 5.5s ease-in-out infinite' }}>
        <AvatarBust size={bustSize} />
      </div>

      {phase === 'downloading' && (
        <>
          <div style={{ fontWeight: 700, fontSize: titleSize }}>
            {compact ? `Getting ${name} ready… ${percent}%` : `Getting ${name} ready`}
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={`Downloading ${name}`}
            style={{ width: compact ? '70%' : 'min(320px, 76%)', height: '8px', borderRadius: '999px', background: 'var(--border)', overflow: 'hidden' }}
          >
            <div style={{ width: `${percent}%`, height: '100%', borderRadius: '999px', background: 'var(--primary)', transition: 'width .3s ease' }} />
          </div>
          <div style={{ color: 'var(--text2)', fontSize: subSize }}>
            {compact ? 'One-time download' : `Downloading… ${percent}% — ${name} is a large one-time download (about 230 MB), saved for your next visit.`}
          </div>
        </>
      )}

      {phase === 'preparing' && (
        <>
          <div style={{ fontWeight: 700, fontSize: titleSize }}>Almost there — preparing {name}…</div>
          {!compact && (
            <div style={{ color: 'var(--text2)', fontSize: subSize }}>
              This only takes a few seconds. You can keep using the app.
            </div>
          )}
        </>
      )}

      {phase === 'failed' && (
        <>
          <div style={{ fontWeight: 700, fontSize: titleSize }}>We couldn't finish loading {name}.</div>
          {!compact && (
            <div style={{ color: 'var(--text2)', fontSize: subSize, maxWidth: '30em' }}>
              The download is large (about 230 MB), so a brief drop in connection can interrupt it. You can keep using the rest of the app either way.
            </div>
          )}
          <button
            onClick={ensureUnityBoot}
            className="hv2"
            style={{ minHeight: '46px', padding: '0 22px', borderRadius: '12px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
          >
            Try again
          </button>
        </>
      )}
    </div>
  );
}
