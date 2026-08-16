// Mounts the Unity WebGL canvas for renderer:'unity' profiles. Boot is global
// and eager (unityBridge.ensureUnityBoot from main.jsx) — this mount just
// reparents the shared singleton canvas into its host (Unity's GL context is
// bound to that canvas for the page lifetime; a fresh canvas per mount would
// leave the live instance rendering into a detached element) and shows the
// load-progress states until the engine is up.
import React, { useEffect, useRef, useState } from 'react';
import { probeUnity, mountUnity, getUnityCanvas, parkUnityCanvas } from './unityBridge.js';
import { useUnityLoadState } from './useUnityLoadState.js';
import { getUnityAvatar } from './UnityAvatarController.js';
import { AvatarLoadProgress } from '../AvatarLoadProgress.jsx';

export function UnityAvatarMount({ characterId, name = 'your avatar', compact = false, children }) {
  const hostRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const { phase, pct } = useUnityLoadState();

  useEffect(() => {
    let cancelled = false;
    hostRef.current?.appendChild(getUnityCanvas());
    (async () => {
      if (!(await probeUnity())) {
        if (!cancelled) setUnavailable(true);
        return;
      }
      try {
        await mountUnity(); // awaits the already-in-flight global boot
        if (cancelled) return;
        getUnityAvatar(characterId); // sends setCharacter (idempotent)
        setReady(true);
      } catch (err) {
        console.warn('[unity] mount failed:', err?.message ?? err);
        // AvatarLoadProgress shows the 'failed' state with a retry button.
      }
    })();
    return () => {
      cancelled = true;
      parkUnityCanvas(); // never leave it inside a torn-down host
    };
  }, [characterId, phase === 'ready']);

  const showProgress = !ready && !unavailable && (phase === 'downloading' || phase === 'preparing' || phase === 'failed');

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 'inherit', overflow: 'hidden' }}>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0, opacity: ready ? 1 : 0, transition: 'opacity .5s' }} />
      {showProgress && <AvatarLoadProgress phase={phase} pct={pct} name={name} compact={compact} />}
      {!ready && !showProgress && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          {children}
          {unavailable && (
            <div style={{ fontSize: '.75rem', color: 'var(--text2)', textAlign: 'center', padding: '0 12px' }}>
              Unity build not installed
            </div>
          )}
        </div>
      )}
    </div>
  );
}
