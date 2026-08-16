// Unity avatar controller — AvatarBridgeProtocol surface for renderer:'unity'
// profiles, mirroring the mobile UnityAvatarBridge: Unity never plays audio,
// it only renders blendshape timing. Audio plays through the shared Web Audio
// engine; the CC4 payload (built by the SAME blendshapeTranslator module as
// mobile) rides to Unity over SendMessage as `{type:'play', …}`.
// supportsStreamingAudio=false routes the voice pipeline to the REST cascade —
// exactly how mobile treats the Unity renderer.
import { segmentToCC4Payload } from '@core/avatar/blendshapeTranslator';
import { AvatarAudioEngine } from '../three/audio.js';
import { sendBridgeMessage, setCharacter } from './unityBridge.js';

let instance = null;

export class UnityAvatarControllerImpl {
  constructor(characterId) {
    this.characterId = characterId;
    this.supportsStreamingAudio = false;
    this._onAudioStart = null;
    this.engine = new AvatarAudioEngine({
      onAudioStart: () => {
        const cb = this._onAudioStart;
        this._onAudioStart = null;
        cb?.();
      },
      onAudioEnd: () => sendBridgeMessage({ type: 'stop' }),
    });
    setCharacter(characterId);
  }

  unlockAudio() { this.engine.unlock(); }
  setOnAudioStart(cb) { this._onAudioStart = cb; }

  async playAudio(segment) {
    // ensureCharacter-before-play (mobile parity): idempotent Unity-side, and
    // covers messages the runtime dropped while the scene was still booting.
    setCharacter(this.characterId);
    const cc4 = segmentToCC4Payload(segment, null);
    const duration = segment.visemeTimeline?.totalDuration ?? 0;
    const done = this.engine.waitForEnd();
    // No analyser path needed — Unity drives the mouth; the engine only plays.
    await this.engine.playAudioWithVisemeTimeline(segment.audio, segment.visemeTimeline ?? { frames: [], totalDuration: 0 }, segment.emotion);
    sendBridgeMessage({
      type: 'play',
      duration,
      visemes: cc4.visemes,
      blendshapes: cc4.blendshapes,
      emotion: cc4.emotion,
      text: cc4.text,
    });
    await done;
  }

  // Streaming unsupported (mobile parity) — no-ops keep the surface total.
  startStreamingPlayback() {}
  appendAudioChunk() {}
  async endStreamingPlayback() {}

  setSpeechEmotion() { /* carried inside the play payload */ }
  setAvatarState(state) { sendBridgeMessage({ type: 'setState', state }); }
  stopAudio() {
    this.engine.stopAudioLipSync();
    sendBridgeMessage({ type: 'stop' });
  }
}

export function getUnityAvatar(characterId) {
  if (instance && instance.characterId === characterId) return instance;
  if (instance) {
    // Character switch: silence the outgoing character (mobile setCharacter
    // semantics) and reuse the controller + its AudioContext — recreating the
    // engine per switch would leak a context each time.
    instance.stopAudio();
    instance.characterId = characterId;
    setCharacter(characterId);
    return instance;
  }
  instance = new UnityAvatarControllerImpl(characterId);
  return instance;
}

export function peekUnityAvatar() {
  return instance;
}
