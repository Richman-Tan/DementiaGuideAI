// The open microphone for a spoken conversation: one stream, kept open, with
// the browser's echo cancellation on, and a report each time someone starts or
// stops speaking.
//
// The samples come from a small audio worklet (pcmTap.worklet.js) and are
// judged here by the shared speech detector. Nothing from the microphone is
// played back or recorded.
import { createSpeechDetector } from '@core/voice/speechDetector.ts';

/**
 * Opens the microphone. Resolves once it is live; `close()` releases it.
 * Rejects with `code: 'permission-denied'` when the person or the browser says no.
 */
export async function openMicInput({ onSpeechStart, onSpeechEnd } = {}) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      // Echo cancellation is what keeps the avatar's own voice, coming out of
      // the speakers, from being taken for the person talking.
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
    const e = new Error(denied ? 'Microphone permission denied' : (err?.message ?? String(err)));
    if (denied) e.code = 'permission-denied';
    throw e;
  }

  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const release = () => {
    stream.getTracks().forEach((track) => track.stop());
    ctx.close().catch(() => {});
  };
  try {
    await ctx.audioWorklet.addModule(new URL('./pcmTap.worklet.js', import.meta.url));
    const source = ctx.createMediaStreamSource(stream);
    const tap = new AudioWorkletNode(ctx, 'pcm-tap');
    const detector = createSpeechDetector({ sampleRate: ctx.sampleRate });
    tap.port.onmessage = ({ data }) => {
      for (const event of detector.process(data)) {
        if (event.type === 'start') onSpeechStart?.();
        else onSpeechEnd?.();
      }
    };
    // A node is only run while it leads to the output, so the tap is wired to
    // it through a gain of zero: it keeps running and nothing is heard.
    const silent = ctx.createGain();
    silent.gain.value = 0;
    source.connect(tap);
    tap.connect(silent);
    silent.connect(ctx.destination);
    if (ctx.state === 'suspended') await ctx.resume();

    return {
      close() {
        tap.port.onmessage = null;
        source.disconnect();
        tap.disconnect();
        release();
      },
    };
  } catch (err) {
    release();
    throw err;
  }
}
