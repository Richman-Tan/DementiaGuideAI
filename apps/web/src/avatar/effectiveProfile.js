// Availability-aware profile resolution. The stored avatarId can name a Unity
// profile while no WebGL build is installed (fresh dev checkout — the build is
// a git-ignored artifact), so every renderer/voice/copy decision resolves
// through here: Unity profiles degrade to the Three.js fallback TOGETHER
// (renderer, TTS voice, UI copy), and never persist the downgrade — dropping a
// build in later reactivates the stored Unity choice automatically.
import { useEffect, useState } from 'react';
import { getAvatarProfile } from './avatarProfiles.js';
import { getUnityAvailability, probeUnity } from './unity/unityBridge.js';

export const FALLBACK_AVATAR_ID = 'aria';

export function resolveEffectiveProfile(id) {
  const profile = getAvatarProfile(id);
  // Unprobed (null) stays optimistic — the Unity mount shows the bust until
  // the probe lands, and a false probe re-resolves everything to the fallback.
  if (profile.renderer === 'unity' && getUnityAvailability() === false) {
    return getAvatarProfile(FALLBACK_AVATAR_ID);
  }
  return profile;
}

// React flavour: re-renders once the probe resolves so consumers flip from
// the optimistic Unity profile to the fallback (or stay put) without a reload.
export function useEffectiveAvatarProfile(avatarId) {
  const [, setProbed] = useState(getUnityAvailability() !== null);
  useEffect(() => {
    let on = true;
    probeUnity().then(() => { if (on) setProbed(true); });
    return () => { on = false; };
  }, []);
  return resolveEffectiveProfile(avatarId);
}
