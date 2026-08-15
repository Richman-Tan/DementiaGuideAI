// The avatar surface the voice pipeline talks to. Delegates per call to the
// loaded Three.js controller when one is mounted and healthy, otherwise to the
// headless audio engine — so voice works identically with the avatar visible,
// hidden, still loading, or failed. Streaming sessions pin their target for
// the whole stream (a model finishing to load mid-reply must not split one
// stream across two audio engines).
import { peekThreeAvatar } from './three/controller.js';
import { peekUnityAvatar } from './unity/UnityAvatarController.js';
import { getHeadlessAvatar } from './headlessAvatar.js';
import { getSettingSnapshot } from '../state/settingsSnapshot.js';
import { resolveEffectiveProfile } from './effectiveProfile.js';

const target = () => {
  const profile = resolveEffectiveProfile(getSettingSnapshot().avatarId);
  if (profile.renderer === 'unity') {
    const unity = peekUnityAvatar();
    if (unity && unity.characterId === profile.unityCharacterId) return unity;
    return getHeadlessAvatar();
  }
  const three = peekThreeAvatar();
  return three && three.loaded && !three.failed && three.renderer ? three : getHeadlessAvatar();
};

let sessionTarget = null; // pinned engine for the active streaming session

export const voiceAvatar = {
  // Unity renderer doesn't stream (mobile parity) — consult the live target.
  get supportsStreamingAudio() { return target().supportsStreamingAudio; },

  // Chrome's autoplay policy unblocks AudioContext.resume() after any user
  // gesture on the page (sticky activation) — the mic tap covers every engine
  // (the Unity controller owns its own AudioContext).
  unlockAudio() {
    getHeadlessAvatar().unlockAudio();
    peekUnityAvatar()?.unlockAudio();
  },

  setOnAudioStart(cb) { (sessionTarget ?? target()).setOnAudioStart(cb); },
  playAudio(segment) { return target().playAudio(segment); },

  startStreamingPlayback(sessionId, sampleRate, emotion) {
    sessionTarget = target();
    sessionTarget.startStreamingPlayback(sessionId, sampleRate, emotion);
  },
  appendAudioChunk(sessionId, pcmBase64, frames) {
    (sessionTarget ?? target()).appendAudioChunk(sessionId, pcmBase64, frames);
  },
  async endStreamingPlayback(sessionId) {
    const t = sessionTarget ?? target();
    try {
      return await t.endStreamingPlayback(sessionId);
    } finally {
      sessionTarget = null;
    }
  },

  setSpeechEmotion(emotion) { (sessionTarget ?? target()).setSpeechEmotion(emotion); },
  setAvatarState(state) { peekThreeAvatar()?.setAvatarState(state); },
  stopAudio() {
    // Broadcast — barge-in must silence whichever engine is playing.
    peekThreeAvatar()?.stopAudio();
    peekUnityAvatar()?.stopAudio();
    getHeadlessAvatar().stopAudio();
    sessionTarget = null;
  },
};
