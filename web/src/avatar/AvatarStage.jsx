// Avatar stage — the shared visual for Landing, Home, Voice and the Chat panel.
// When the selected profile is a Three.js one and the avatar is enabled, the
// real GLB renderer mounts here (one shared canvas, reparented between
// screens); the prototype's SVG bust is the loading/error/disabled fallback.
// Unity profiles get the same treatment in phase (e) via UnityAvatarStage.
import React, { useEffect, useRef, useState } from 'react';
import { useSettings } from '../state/SettingsContext.jsx';
import { useEffectiveAvatarProfile } from './effectiveProfile.js';
import { getThreeAvatar } from './three/controller.js';
import { UnityAvatarMount } from './unity/UnityAvatarStage.jsx';
import { warmUnityCache, isUnityBooted } from './unity/unityBridge.js';

export function AvatarBust({ size = 170 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="44" r="25" fill="var(--primary-l)" />
      <path d="M18 112c0-25 19-39 42-39s42 14 42 39z" fill="var(--primary)" />
    </svg>
  );
}

// Mounts the shared Three.js canvas; renders children (the bust fallback)
// until the model is ready. fill=true stretches to the parent box.
export function ThreeAvatarMount({ state = 'idle', children }) {
  const { settings } = useSettings();
  const profile = useEffectiveAvatarProfile(settings.avatarId);
  const mountRef = useRef(null);
  const [ready, setReady] = useState(false);

  const wantThree = settings.showAvatar && profile.renderer === 'threejs';
  const wantUnity = settings.showAvatar && profile.renderer === 'unity';

  useEffect(() => {
    if (!wantThree || !mountRef.current) { setReady(false); return undefined; }
    const controller = getThreeAvatar();
    if (!controller) { setReady(false); return undefined; }
    mountRef.current.appendChild(controller.host);
    setReady(controller.loaded && !controller.failed);
    const off = controller.onStatusChange((c) => setReady(c.loaded && !c.failed));
    return off;
  }, [wantThree, profile.id]);

  useEffect(() => {
    if (wantThree && ready) getThreeAvatar()?.setAvatarState(state);
  }, [wantThree, ready, state]);

  if (wantUnity) {
    return <UnityAvatarMount characterId={profile.unityCharacterId}>{children}</UnityAvatarMount>;
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 'inherit' }}>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', overflow: 'hidden', opacity: ready ? 1 : 0, transition: 'opacity .5s' }} />
      {!ready && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// The Voice screen's circular stage with full state chrome.
export function AvatarStage({ state = 'idle', size = 230, bust = 170 }) {
  const listening = state === 'listening';
  const thinking = state === 'thinking';
  const speaking = state === 'speaking';
  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {listening && <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid var(--primary)', animation: 'dgPulse 1.6s ease-out infinite', zIndex: 2 }} />}
      {thinking && <span style={{ position: 'absolute', inset: '8px', borderRadius: '50%', background: 'var(--tint)', animation: 'dgShimmer 1.4s ease-in-out infinite' }} />}
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden' }}>
        <ThreeAvatarMount state={state}>
          <div style={{ position: 'relative', animation: 'dgBreathe 5.5s ease-in-out infinite', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <AvatarBust size={bust} />
            {speaking && (
              <div style={{ position: 'absolute', bottom: '-6px', display: 'flex', alignItems: 'center', gap: '4px', height: '22px' }}>
                {[0, 0.12, 0.24, 0.36].map((d) => (
                  <span key={d} style={{ width: '4px', height: '18px', borderRadius: '2px', background: 'var(--primary-d)', animation: `dgBar .8s ease-in-out ${d}s infinite` }} />
                ))}
              </div>
            )}
          </div>
        </ThreeAvatarMount>
      </div>
    </div>
  );
}

// The framed "stage card" used on Landing (placeholder only — no model /
// Unity load before onboarding).
export function AvatarStageCard({ caption, maxWidth = 360 }) {
  const { settings } = useSettings();
  const profile = useEffectiveAvatarProfile(settings.avatarId);
  caption = caption ?? `avatar stage · ${profile.name} (3D, lip-synced)`;
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth, aspectRatio: '1/1.05', borderRadius: '26px', border: 'var(--bw) solid var(--border)', background: 'radial-gradient(circle at 50% 32%,var(--tint) 0%,transparent 72%),linear-gradient(165deg,var(--tint),var(--surface))', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px' }}>
      <div style={{ animation: 'dgBreathe 5.5s ease-in-out infinite' }}>
        <AvatarBust />
      </div>
      <div style={{ fontSize: '.85rem', color: 'var(--text2)', fontFamily: 'ui-monospace,Menlo,monospace', letterSpacing: '.03em' }}>{caption}</div>
    </div>
  );
}

// Home hero card. Three.js profiles host the real avatar (doubling as the
// model prefetch so the Voice screen opens warm). Unity profiles mount the
// live avatar only when the engine is ALREADY booted this session (a visit to
// Voice paid the cold-boot cost; the shared canvas just reparents here) —
// otherwise a static bust plus an idle-time HTTP cache warmer, because cold-
// booting a full Unity heap inside a 210px browsing-screen card would put
// ~a minute of decompression CPU on every fresh page load.
export function AvatarHomeStage() {
  const { settings } = useSettings();
  const profile = useEffectiveAvatarProfile(settings.avatarId);
  const isUnity = profile.renderer === 'unity';
  const unityWarm = isUnity && isUnityBooted();

  useEffect(() => {
    if (!isUnity || unityWarm) return undefined;
    const warm = () => { warmUnityCache(); };
    const idle = typeof requestIdleCallback === 'function';
    const id = idle ? requestIdleCallback(warm, { timeout: 8000 }) : setTimeout(warm, 2500);
    return () => { idle ? cancelIdleCallback(id) : clearTimeout(id); };
  }, [isUnity, unityWarm]);

  const bust = (
    <div style={{ animation: 'dgBreathe 5.5s ease-in-out infinite' }}>
      <AvatarBust size={130} />
    </div>
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: '210px', borderRadius: '18px', overflow: 'hidden' }}>
      {isUnity ? (
        unityWarm ? (
          <UnityAvatarMount characterId={profile.unityCharacterId}>{bust}</UnityAvatarMount>
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {bust}
          </div>
        )
      ) : (
        <ThreeAvatarMount state="waiting">{bust}</ThreeAvatarMount>
      )}
    </div>
  );
}
