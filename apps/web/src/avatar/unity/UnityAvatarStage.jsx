// Mounts the Unity WebGL canvas for renderer:'unity' profiles. The boot is
// global and lazy: the first mount's effect probes for the build and starts the
// one-time download (later mounts await the same in-flight boot). The mount
// reparents the shared singleton canvas into its host (Unity's GL context is
// bound to that canvas for the page lifetime; a fresh canvas per mount would
// leave the live instance rendering into a detached element) and shows the
// load-progress states until the engine is up. With no build installed it
// shows the children (the bust) and a plain note; the character is unchanged.
import React, { useEffect, useRef, useState } from 'react';
import { probeUnity, mountUnity, getUnityCanvas, parkUnityCanvas } from './unityBridge.js';
import { useUnityLoadState } from './useUnityLoadState.js';
import { getUnityAvatar } from './UnityAvatarController.js';
import { AvatarLoadProgress } from '../AvatarLoadProgress.jsx';

export function UnityAvatarMount({ characterId, name = 'your avatar', compact = false, state = 'idle', children }) {
  const hostRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const { phase, pct } = useUnityLoadState();

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    host?.appendChild(getUnityCanvas());
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
      parkUnityCanvas(host); // never leave it inside a torn-down host (no-op if another mount took it)
    };
  }, [characterId, phase === 'ready']);

  // Conversational state drives IdleAnimator's six-way blend (listening nod,
  // brow raises, thinking gaze bias, head tilts). Only send once the engine is
  // up — messages before that are dropped by the runtime.
  useEffect(() => {
    if (ready) getUnityAvatar(characterId)?.setAvatarState(state);
  }, [ready, characterId, state]);

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
              The 3D view isn't available right now. {name} can still talk with you.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
