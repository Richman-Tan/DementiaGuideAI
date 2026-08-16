// Web twin of src/lib/stt/sttService.js — same session contract:
//
//   const session = await startSttSession({ handsFree, onPartial, onEndOfSpeech, onError });
//   const { transcript, source } = await session.stop();   // or session.cancel()
//
// Providers:
//   1. Live — Web Speech API (Chrome/Edge; en-NZ, interim results). A parallel
//      MediaRecorder keeps the audio so an empty live result can be rescued
//      through Whisper (mobile parity). Hands-free endpointing runs on an
//      AnalyserNode RMS meter + transcript-stability timer (the web has no
//      volumechange event).
//   2. Whisper fallback — MediaRecorder (webm/opus, mp4 on Safari) → Whisper.
// Sticky degrade: one live start failure switches the session to Whisper.
import {
  STT_FINAL_TIMEOUT_MS,
  HANDS_FREE_SILENCE_MS,
  HANDS_FREE_MAX_LEAD_SILENCE_MS,
} from '@core/voice/voiceConfig';
import { openaiClient } from './openaiClient.js';

const RMS_SILENCE_THRESHOLD = 0.012; // normalized RMS below this ≈ inaudible
const RMS_INTERVAL_MS = 150;

let sttDegraded = false; // sticky for the app session

const SpeechRecognitionCtor = () =>
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

export const isLiveRecognitionAvailable = () => !!SpeechRecognitionCtor();

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

async function getMicStream() {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
    const e = new Error(denied ? 'Microphone permission denied' : (err?.message ?? String(err)));
    if (denied) e.code = 'permission-denied';
    throw e;
  }
}

function startRecorder(stream) {
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const parts = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) parts.push(e.data);
  };
  rec.start(250);
  return {
    async stopAndGetBlob() {
      if (rec.state !== 'inactive') {
        await new Promise((resolve) => {
          rec.onstop = resolve;
          rec.stop();
        });
      }
      return parts.length ? new Blob(parts, { type: mime || 'audio/webm' }) : null;
    },
    abort() {
      rec.onstop = null;
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    },
    ext: (mime || '').includes('mp4') ? 'mp4' : 'webm',
  };
}

// ─── Live provider ────────────────────────────────────────────────────────────
async function startLiveSession({ handsFree, onPartial, onEndOfSpeech, onError }) {
  const Ctor = SpeechRecognitionCtor();
  const stream = await getMicStream();
  const recorder = startRecorder(stream); // parallel capture for whisper-rescue

  // RMS meter for hands-free endpointing.
  let audioCtx = null;
  let rmsTimer = null;
  let lastRms = 1;
  if (handsFree) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const srcNode = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    srcNode.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    rmsTimer = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      lastRms = Math.sqrt(sum / buf.length);
    }, RMS_INTERVAL_MS);
  }

  const rec = new Ctor();
  rec.lang = 'en-NZ';
  rec.interimResults = true;
  rec.continuous = true;

  let latestTranscript = '';
  let lastChangeAt = Date.now();
  let finalized = false;
  let finalResolve = null;
  let endTimer = null;
  const startedAt = Date.now();

  rec.onresult = (event) => {
    let text = '';
    for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
    text = text.trim();
    if (text && text !== latestTranscript) {
      latestTranscript = text;
      lastChangeAt = Date.now();
      onPartial?.(text);
    }
  };
  rec.onerror = (event) => {
    // 'no-speech'/'aborted' are routine; real errors go to onError.
    if (event.error === 'not-allowed') {
      const e = new Error('Microphone permission denied');
      e.code = 'permission-denied';
      onError?.(e);
    } else if (event.error && event.error !== 'no-speech' && event.error !== 'aborted') {
      onError?.(new Error(`speech recognition error: ${event.error}`));
    }
  };
  rec.onend = () => {
    finalized = true;
    if (finalResolve) finalResolve();
  };
  rec.start();

  // Hands-free endpointing: no transcript change for HANDS_FREE_SILENCE_MS AND
  // low RMS → end of speech. Nothing at all for the lead window → give up.
  if (handsFree) {
    endTimer = setInterval(() => {
      const now = Date.now();
      if (!latestTranscript) {
        if (now - startedAt > HANDS_FREE_MAX_LEAD_SILENCE_MS) {
          clearInterval(endTimer);
          onEndOfSpeech?.({ reason: 'lead-silence' });
        }
        return;
      }
      if (now - lastChangeAt > HANDS_FREE_SILENCE_MS && lastRms < RMS_SILENCE_THRESHOLD) {
        clearInterval(endTimer);
        onEndOfSpeech?.({ reason: 'silence' });
      }
    }, RMS_INTERVAL_MS);
  }

  const teardown = () => {
    clearInterval(endTimer);
    clearInterval(rmsTimer);
    try {
      audioCtx?.close();
    } catch {
      /* closed */
    }
    stream.getTracks().forEach((t) => t.stop());
  };

  return {
    provider: 'web-speech',
    cancel: () => {
      try {
        rec.abort();
      } catch {
        /* not started */
      }
      recorder.abort();
      teardown();
    },
    stop: async () => {
      try {
        rec.stop();
      } catch {
        /* not started */
      }
      // Wait briefly for the recognizer's final result; the last partial is
      // almost always the complete utterance.
      if (!finalized) {
        await Promise.race([
          new Promise((r) => {
            finalResolve = r;
          }),
          new Promise((r) => setTimeout(r, STT_FINAL_TIMEOUT_MS)),
        ]);
      }
      const transcript = latestTranscript.trim();
      const blob = await recorder.stopAndGetBlob();
      teardown();

      if (transcript) return { transcript, source: 'live' };
      // Empty live result: rescue via Whisper with the parallel recording.
      if (blob && blob.size > 4096) {
        try {
          const rescued = await openaiClient.transcribe(blob, `recording.${recorder.ext}`);
          if (rescued) return { transcript: rescued, source: 'whisper-rescue' };
        } catch (err) {
          console.warn(`[STT] whisper rescue failed: ${err?.message ?? err}`);
        }
      }
      return { transcript: '', source: 'live' };
    },
  };
}

// ─── Whisper fallback provider ────────────────────────────────────────────────
async function startWhisperSession() {
  const stream = await getMicStream();
  const recorder = startRecorder(stream);
  const teardown = () => stream.getTracks().forEach((t) => t.stop());
  return {
    provider: 'whisper',
    cancel: () => {
      recorder.abort();
      teardown();
    },
    stop: async () => {
      const blob = await recorder.stopAndGetBlob();
      teardown();
      if (!blob || blob.size < 2048) return { transcript: '', source: 'whisper' };
      const transcript = await openaiClient.transcribe(blob, `recording.${recorder.ext}`);
      return { transcript: transcript ?? '', source: 'whisper' };
    },
  };
}

// ─── Facade (mobile-parity provider selection + sticky degrade) ──────────────
export async function startSttSession(opts = {}) {
  if (!sttDegraded && isLiveRecognitionAvailable()) {
    try {
      return await startLiveSession(opts);
    } catch (err) {
      if (err?.code === 'permission-denied') throw err;
      console.warn(
        `[STT] live recognition failed to start (${err?.message ?? err}) — using Whisper fallback from now on`
      );
      sttDegraded = true;
    }
  }
  return startWhisperSession(opts);
}
