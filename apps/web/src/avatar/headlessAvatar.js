// Headless avatar: implements the renderer-agnostic AvatarBridgeProtocol
// surface (playAudio/stopAudio/setOnAudioStart/streaming trio) over the
// AvatarAudioEngine, with no 3D model. This is what the voice pipeline talks
// to whenever no live Unity controller matches — the avatar is hidden, the 3D
// build is still loading, not installed, or failed — so the same character
// keeps speaking with the same voice.
import { AvatarAudioEngine } from './audioEngine.js';

let singleton = null;

export function getHeadlessAvatar() {
  if (singleton) return singleton;

  let onAudioStartCb = null;
  const engine = new AvatarAudioEngine({
    onAudioStart: () => {
      const cb = onAudioStartCb;
      onAudioStartCb = null; // one-shot, mobile parity
      cb?.();
    },
  });

  singleton = {
    engine,
    supportsStreamingAudio: true,
    unlockAudio: () => engine.unlock(),

    setOnAudioStart(cb) { onAudioStartCb = cb; },

    // segment: { audio: dataUri, visemeTimeline, emotion } — resolves on audioEnd.
    async playAudio(segment) {
      const done = engine.waitForEnd();
      if (segment.visemeTimeline) {
        await engine.playAudioWithVisemeTimeline(segment.audio, segment.visemeTimeline, segment.emotion);
      } else {
        await engine.playAudioWithLipSync(segment.audio);
      }
      await done;
    },

    startStreamingPlayback(sessionId, sampleRate, emotion) {
      engine.startStreamingPlayback(sessionId, sampleRate, emotion);
    },
    appendAudioChunk(sessionId, pcmBase64, frames) {
      engine.appendAudioChunk(sessionId, pcmBase64, frames);
    },
    endStreamingPlayback(sessionId) {
      return engine.endStreamingPlayback(sessionId);
    },
    setSpeechEmotion(emotion) { engine.setSpeechEmotion(emotion); },
    stopAudio() { engine.stopAudioLipSync(); },
    setAvatarState() { /* no visual — AvatarStage renders state separately */ },
  };
  return singleton;
}
