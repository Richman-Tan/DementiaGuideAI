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
    if (!wantThree || !mountRef.current) {
      setReady(false);
      return undefined;
    }
    const controller = getThreeAvatar();
    if (!controller) {
      setReady(false);
      return undefined;
    }
    mountRef.current.appendChild(controller.host);
    setReady(controller.loaded && !controller.failed);
    const off = controller.onStatusChange((c) => setReady(c.loaded && !c.failed));
    return off;
  }, [wantThree, profile.id]);

  useEffect(() => {
    if (wantThree && ready) getThreeAvatar()?.setAvatarState(state);
  }, [wantThree, ready, state]);

  if (wantUnity) {
    return (
      <UnityAvatarMount characterId={profile.unityCharacterId} name={profile.name} compact>
        {children}
      </UnityAvatarMount>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 'inherit' }}>
      <div
        ref={mountRef}
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          overflow: 'hidden',
          opacity: ready ? 1 : 0,
          transition: 'opacity .5s',
        }}
      />
      {!ready && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {children}
        </div>
      )}
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
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth,
        aspectRatio: '1/1.05',
        borderRadius: '26px',
        border: 'var(--bw) solid var(--border)',
        background:
          'radial-gradient(circle at 50% 32%,var(--tint) 0%,transparent 72%),linear-gradient(165deg,var(--tint),var(--surface))',
        boxShadow: 'var(--shadow)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '14px',
      }}
    >
      <div style={{ animation: 'dgBreathe 5.5s ease-in-out infinite' }}>
        <AvatarBust />
      </div>
      <div
        style={{
          fontSize: '.85rem',
          color: 'var(--text2)',
          fontFamily: 'ui-monospace,Menlo,monospace',
          letterSpacing: '.03em',
        }}
      >
        {caption}
      </div>
    </div>
  );
}

// Home hero tile — fills whatever box the parent gives it (Home makes it a
// full-height portrait tile). Boot is global and eager (main.jsx), so the
// Unity mount is unconditional: it attaches the shared canvas and shows
// compact download/preparing progress until the engine is live. The Unity
// camera fits horizontally, so the canvas sits in a centered portrait-aspect
// column — a wide canvas would crop the framing to mouth-only. A video-call
// style name tag sits in the corner.
export function AvatarHomeStage() {
  const { settings } = useSettings();
  const profile = useEffectiveAvatarProfile(settings.avatarId);

  const bust = (
    <div style={{ animation: 'dgBreathe 5.5s ease-in-out infinite' }}>
      <AvatarBust size={130} />
    </div>
  );

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        borderRadius: 'inherit',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {profile.renderer === 'unity' ? (
        <div
          style={{
            position: 'relative',
            height: '100%',
            aspectRatio: '3 / 4',
            maxWidth: '100%',
            flexShrink: 0,
          }}
        >
          <UnityAvatarMount characterId={profile.unityCharacterId} name={profile.name} compact>
            {bust}
          </UnityAvatarMount>
        </div>
      ) : (
        <ThreeAvatarMount state="waiting">{bust}</ThreeAvatarMount>
      )}
      <div
        style={{
          position: 'absolute',
          left: '12px',
          bottom: '12px',
          background: 'var(--surface)',
          border: 'var(--bw) solid var(--border)',
          borderRadius: '999px',
          padding: '4px 14px',
          fontWeight: 700,
          fontSize: '.92rem',
          boxShadow: 'var(--shadow)',
        }}
      >
        {profile.name}
      </div>
    </div>
  );
}
