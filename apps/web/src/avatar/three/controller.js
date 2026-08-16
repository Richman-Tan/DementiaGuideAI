// AvatarController — the web equivalent of the mobile AvatarVRM wrapper's
// imperative surface (AvatarVRM.js lines ~2159-2300), sitting on the extracted
// renderer. One shared singleton: the stage appears on several screens, and a
// single WebGL canvas is reparented between them instead of paying model +
// context cost per screen.
import { getSettingSnapshot } from '../../state/settingsSnapshot.js';
import { resolveEffectiveProfile } from '../effectiveProfile.js';
import { modelUrlFor } from './assets.js';

let instance = null; // { profileId, controller }

class ThreeAvatarController {
  constructor(profile) {
    this.profile = profile;
    this.supportsStreamingAudio = true;
    this.loaded = false;
    this.failed = false;
    this.renderer = null;
    this.host = document.createElement('div'); // stable parent for the canvas
    this.host.style.cssText = 'position:absolute;inset:0;overflow:hidden;border-radius:inherit';
    this._onAudioStart = null;
    this._audioEndResolvers = [];
    this._listeners = new Set(); // status listeners: (this) => void
    this._start(profile);
  }

  async _start(profile) {
    const { createAvatarRenderer } = await import('./renderer.js');
    const { BACKDROP_URL } = await import('./assets.js');
    this.renderer = createAvatarRenderer({
      container: this.host,
      modelUrl: modelUrlFor(profile.modelKey),
      backdropUrl: BACKDROP_URL,
      debug: false,
      onMessage: (msg) => this._handleMessage(msg),
    });
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'loaded':
        this.loaded = true;
        this._notify();
        break;
      case 'error':
        console.warn('[avatar] renderer error:', msg.message);
        this.failed = true;
        this._notify();
        break;
      case 'context_lost':
        console.warn('[avatar] WebGL context lost — falling back to the bust');
        this.failed = true;
        this._notify();
        break;
      case 'audioStart': {
        const cb = this._onAudioStart;
        this._onAudioStart = null; // one-shot (mobile parity)
        cb?.();
        break;
      }
      case 'audioEnd': {
        const resolvers = this._audioEndResolvers;
        this._audioEndResolvers = [];
        for (const r of resolvers) r(msg);
        break;
      }
      default:
        break;
    }
  }

  onStatusChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }
  _notify() { for (const fn of this._listeners) fn(this); }

  _waitAudioEnd() {
    return new Promise((r) => this._audioEndResolvers.push(r));
  }

  // ── AvatarBridgeProtocol surface ─────────────────────────────────────────
  unlockAudio() { /* renderer creates/resumes its ctx on play; nothing to do */ }
  setOnAudioStart(cb) { this._onAudioStart = cb; }

  async playAudio(segment) {
    if (!this.renderer) return;
    const done = this._waitAudioEnd();
    if (segment.visemeTimeline) {
      this.renderer.playAudioWithVisemeTimeline(segment.audio, segment.visemeTimeline, segment.emotion);
    } else {
      this.renderer.playAudioWithLipSync(segment.audio);
    }
    await done;
  }

  startStreamingPlayback(sessionId, sampleRate, emotion) {
    this.renderer?.startStreamingPlayback(sessionId, sampleRate, emotion);
  }
  appendAudioChunk(sessionId, pcmBase64, frames) {
    this.renderer?.appendAudioChunk(sessionId, pcmBase64, frames);
  }
  async endStreamingPlayback(sessionId) {
    if (!this.renderer) return;
    const done = this._waitAudioEnd();
    this.renderer.endStreamingPlayback(sessionId);
    await done;
  }
  setSpeechEmotion(emotion) { this.renderer?.setSpeechEmotion(emotion); }
  setAvatarState(state) { this.renderer?.setAvatarState(state); }
  setDebugMode(on) { this.renderer?.setDebugMode?.(on); }
  stopAudio() { this.renderer?.stopAudioLipSync(); }

  dispose() {
    this.renderer?.dispose();
    this.renderer = null;
  }
}

// Returns the shared controller for the currently-selected Three.js profile,
// (re)creating it on profile change. Callers mount controller.host in their
// stage element — appendChild reparents the one canvas.
export function getThreeAvatar() {
  const settings = getSettingSnapshot();
  // Effective, not stored: a Unity profile with no build installed resolves
  // to the Three.js fallback, and this controller mounts that model.
  const profile = resolveEffectiveProfile(settings.avatarId);
  if (profile.renderer !== 'threejs') return null;
  if (instance && instance.profileId === profile.id) return instance.controller;
  if (instance) instance.controller.dispose();
  instance = { profileId: profile.id, controller: new ThreeAvatarController(profile) };
  return instance.controller;
}

export function peekThreeAvatar() {
  return instance?.controller ?? null;
}
