// Headless avatar: implements the renderer-agnostic AvatarBridgeProtocol
// surface (playAudio/stopAudio/setOnAudioStart/streaming trio) over the
// AvatarAudioEngine, with no 3D model. This is what the voice pipeline talks
// to until phase (d) replaces it with the Three.js AvatarController — the
// engine and its viseme clock carry over unchanged, so lipsync data is already
// flowing (just unrendered).
import { AvatarAudioEngine } from './three/audio.js';

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

    setOnAudioStart(cb) {
      onAudioStartCb = cb;
    },

    // segment: { audio: dataUri, visemeTimeline, emotion } — resolves on audioEnd.
    async playAudio(segment) {
      const done = engine.waitForEnd();
      if (segment.visemeTimeline) {
        await engine.playAudioWithVisemeTimeline(
          segment.audio,
          segment.visemeTimeline,
          segment.emotion
        );
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
    setSpeechEmotion(emotion) {
      engine.setSpeechEmotion(emotion);
    },
    stopAudio() {
      engine.stopAudioLipSync();
    },
    setAvatarState() {
      /* no visual — AvatarStage renders state separately */
    },
  };
  return singleton;
}
