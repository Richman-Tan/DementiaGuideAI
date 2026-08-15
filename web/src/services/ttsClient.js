// Web twin of src/lib/tts/ttsService.ts + elevenLabsService.js.
// Provider cascade (no Azure on web):
//   1. ElevenLabs REST /with-timestamps — char alignment → viseme timeline
//   2. OpenAI tts-1 — no alignment; the renderer falls back to RMS lipsync
// The lipsync stack (with its 660 KB G2P lexicon) is imported dynamically so
// it stays out of the initial bundle until the first spoken reply.
import { normalizeSpokenText } from '@/lib/tts/normalizeSpokenText';
import { timeoutSignal } from '@/lib/net/withTimeout';
import { getElevenKey } from '../state/keysStore.js';
import { openaiClient } from './openaiClient.js';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';
const DEFAULT_MODEL_ID = 'eleven_turbo_v2_5';
const REQUEST_TIMEOUT_MS = 10000;
const WARM_FEMALE_ELEVEN_VOICE = 'EXAVITQu4vr4xnSDxMaL'; // Bella

async function elevenTtsWithAlignment(text, voiceId, speechRate, visemeWeights) {
  const apiKey = getElevenKey();
  if (!apiKey) throw new Error('No ElevenLabs API key configured');

  const t = timeoutSignal(REQUEST_TIMEOUT_MS);
  let resp;
  try {
    resp = await fetch(
      `${ELEVENLABS_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: DEFAULT_MODEL_ID,
          output_format: 'mp3_44100_64',
          voice_settings: {
            stability: 0.40,
            similarity_boost: 0.75,
            style: 0.20,
            speed: speechRate,
          },
        }),
        signal: t.signal,
      }
    );
  } finally {
    t.cancel();
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => `HTTP ${resp.status}`);
    throw new Error(`ElevenLabs TTS error: ${errText}`);
  }
  const data = await resp.json();
  if (!data.audio_base64) throw new Error('ElevenLabs response missing audio_base64');

  let visemeTimeline = null;
  if (data.alignment) {
    const { createVisemeTimeline } = await import('@/lib/lipsync/createVisemeTimeline');
    visemeTimeline = createVisemeTimeline(data.alignment, { visemeWeights: visemeWeights || undefined });
  }
  return { audioBase64: data.audio_base64, visemeTimeline };
}

/**
 * tts(text, options) → { audio: dataUri, visemeTimeline, text, ... }
 * Same contract as the mobile ttsService.
 */
export async function tts(text, options = {}) {
  text = normalizeSpokenText(text);
  const speechRate = options.speechRate ?? 0.78;

  if (getElevenKey()) {
    const elevenVoice = options.elevenVoiceId ?? WARM_FEMALE_ELEVEN_VOICE;
    try {
      const { audioBase64, visemeTimeline } = await elevenTtsWithAlignment(
        text, elevenVoice, speechRate, options.visemeWeights ?? null);
      return { audio: `data:audio/mpeg;base64,${audioBase64}`, visemeTimeline };
    } catch (err) {
      console.warn(`[TTS] elevenlabs failed: ${err?.message ?? err} — falling back to OpenAI TTS`);
    }
  }

  const OPENAI_VOICES = new Set(['nova', 'shimmer', 'echo', 'onyx', 'fable', 'alloy', 'ash', 'sage', 'coral']);
  const requested = options.openaiVoice ?? options.voice;
  const openaiVoice = requested && OPENAI_VOICES.has(requested) ? requested : 'nova';
  const dataUri = await openaiClient.tts(text, openaiVoice);
  return { audio: dataUri, visemeTimeline: null }; // RMS lipsync fallback
}
