// Web twin of src/lib/tts/ttsService.ts + elevenLabsService.js.
//
// With the server pipeline on (VITE_TURN_ENDPOINT), speech comes from the
// server (POST /api/speak) with the visitor's session, and nothing else is
// tried: no key or code lives in the browser on that path.
//
// Otherwise, the older provider cascade (no Azure on web):
//   1. ElevenLabs REST /with-timestamps — char alignment → viseme timeline
//   2. OpenAI tts-1 — no alignment; the renderer falls back to RMS lipsync
// The lipsync stack (with its 660 KB G2P lexicon) is imported dynamically so
// it stays out of the initial bundle until the first spoken reply.
import { normalizeSpokenText } from '@core/tts/normalizeSpokenText';
import { timeoutSignal } from '@core/net/withTimeout';
import { TurnRequestError } from '@core/rag/client/turnStream.ts';
import { elevenTransport } from './transport.js';
import { apiUrl } from './apiBase.js';
import { openaiClient } from './openaiClient.js';
import { supabase } from './supabase.js';
import { serverPipelineEnabled } from './turnClient.js';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';
const DEFAULT_MODEL_ID = 'eleven_turbo_v2_5';
const REQUEST_TIMEOUT_MS = 10000;
const WARM_FEMALE_ELEVEN_VOICE = 'EXAVITQu4vr4xnSDxMaL'; // Bella

async function elevenTtsWithAlignment(text, voiceId, speechRate, visemeWeights) {
  const transport = elevenTransport();
  if (!transport) throw new Error('No ElevenLabs API key configured');

  // Proxied: model, format and voice settings are fixed server-side, so only the
  // text, voice and rate travel. Direct: the original request, unchanged.
  const url = transport.proxied
    ? apiUrl('/api/eleven-tts')
    : `${ELEVENLABS_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`;
  const body = transport.proxied
    ? { text, voiceId, speechRate }
    : {
        text,
        model_id: DEFAULT_MODEL_ID,
        output_format: 'mp3_44100_64',
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.75,
          style: 0.2,
          speed: speechRate,
        },
      };

  const t = timeoutSignal(REQUEST_TIMEOUT_MS);
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { ...transport.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: t.signal,
    });
  } finally {
    t.cancel();
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => `HTTP ${resp.status}`);
    throw new Error(`ElevenLabs TTS error: ${errText}`);
  }
  return speechFrom(await resp.json(), visemeWeights);
}

/** The audio and mouth timing in a speech response, direct or from either server route. */
async function speechFrom(data, visemeWeights) {
  if (!data.audio_base64) throw new Error('ElevenLabs response missing audio_base64');

  let visemeTimeline = null;
  if (data.alignment) {
    const { createVisemeTimeline } = await import('@core/lipsync/createVisemeTimeline');
    visemeTimeline = createVisemeTimeline(data.alignment, {
      visemeWeights: visemeWeights || undefined,
    });
  }
  return { audioBase64: data.audio_base64, visemeTimeline };
}

/**
 * Speech from the server, for the visitor's session. A refusal is thrown with
 * its status and reason code (the daily limit, speech switched off), so the
 * caller can carry on with captions.
 */
async function serverTtsWithAlignment(text, voiceId, speechRate, visemeWeights) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new TurnRequestError('no session', 401, 'no_session');

  const t = timeoutSignal(REQUEST_TIMEOUT_MS);
  let resp;
  try {
    resp = await fetch(apiUrl('/api/speak'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voiceId, speechRate }),
      signal: t.signal,
    });
  } finally {
    t.cancel();
  }
  if (!resp.ok) {
    const refusal = await resp.json().catch(() => null);
    throw new TurnRequestError(
      refusal?.error ?? `speech failed (${resp.status})`,
      resp.status,
      refusal?.code ?? null
    );
  }
  return speechFrom(await resp.json(), visemeWeights);
}

/**
 * tts(text, options) → { audio: dataUri, visemeTimeline, text, ... }
 * Same contract as the mobile ttsService.
 */
export async function tts(text, options = {}) {
  text = normalizeSpokenText(text);
  const speechRate = options.speechRate ?? 0.78;

  if (serverPipelineEnabled()) {
    const { audioBase64, visemeTimeline } = await serverTtsWithAlignment(
      text,
      options.elevenVoiceId ?? WARM_FEMALE_ELEVEN_VOICE,
      speechRate,
      options.visemeWeights ?? null
    );
    return { audio: `data:audio/mpeg;base64,${audioBase64}`, visemeTimeline };
  }

  if (elevenTransport()) {
    const elevenVoice = options.elevenVoiceId ?? WARM_FEMALE_ELEVEN_VOICE;
    try {
      const { audioBase64, visemeTimeline } = await elevenTtsWithAlignment(
        text,
        elevenVoice,
        speechRate,
        options.visemeWeights ?? null
      );
      return { audio: `data:audio/mpeg;base64,${audioBase64}`, visemeTimeline };
    } catch (err) {
      console.warn(`[TTS] elevenlabs failed: ${err?.message ?? err} — falling back to OpenAI TTS`);
    }
  }

  const OPENAI_VOICES = new Set([
    'nova',
    'shimmer',
    'echo',
    'onyx',
    'fable',
    'alloy',
    'ash',
    'sage',
    'coral',
  ]);
  const requested = options.openaiVoice ?? options.voice;
  const openaiVoice = requested && OPENAI_VOICES.has(requested) ? requested : 'nova';
  const dataUri = await openaiClient.tts(text, openaiVoice);
  return { audio: dataUri, visemeTimeline: null }; // RMS lipsync fallback
}
