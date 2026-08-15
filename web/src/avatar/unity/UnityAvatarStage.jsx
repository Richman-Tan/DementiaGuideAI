// Mounts the Unity WebGL canvas for renderer:'unity' profiles. Children (the
// SVG bust) show until the Unity instance is up — or permanently when no
// build is installed. The canvas itself is the bridge's shared singleton
// (Unity's GL context is bound to it for the page lifetime), reparented into
// whichever stage is on screen — a fresh canvas per mount would leave the
// live instance rendering into a detached element.
import React, { useEffect, useRef, useState } from 'react';
import { probeUnity, mountUnity, getUnityCanvas } from './unityBridge.js';
import { getUnityAvatar } from './UnityAvatarController.js';

export function UnityAvatarMount({ characterId, children }) {
  const hostRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    hostRef.current?.appendChild(getUnityCanvas());
    (async () => {
      if (!(await probeUnity())) {
        if (!cancelled) setUnavailable(true);
        return;
      }
      try {
        await mountUnity();
        if (cancelled) return;
        getUnityAvatar(characterId); // sends setCharacter (idempotent)
        setReady(true);
      } catch (err) {
        console.warn('[unity] mount failed:', err?.message ?? err);
        if (!cancelled) setUnavailable(true);
      }
    })();
    return () => { cancelled = true; };
  }, [characterId]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 'inherit', overflow: 'hidden' }}>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0, opacity: ready ? 1 : 0, transition: 'opacity .5s' }} />
      {!ready && (
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
