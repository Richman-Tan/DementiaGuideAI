// POST /api/speak — a piece of the assistant's reply, as speech.
//
// The app sends a sentence or two and gets back audio with the timing of each
// character, which is what moves the avatar's mouth. The voice provider's key
// stays here. Like the turn endpoint it needs a verified session and passes
// through the daily cap before anything is spent, and it answers 503 until it
// is switched on.
//
// The reply is the provider's JSON unchanged (`audio_base64` and `alignment`),
// the shape the apps already read from the older access-code proxy.
import { applyCors } from '../api/_lib/guard.js';
import type { Admission } from './admission.ts';
import { bearerToken } from './http.ts';
import type { Handler } from './http.ts';
import type { SessionVerifier } from './session.ts';

const MODEL_ID = 'eleven_turbo_v2_5';

/** The two roster voices: Aaron and Ariana. No other voice can be asked for. */
export const VOICES = ['nPczCjzI2devNBz1zQrb', 'EXAVITQu4vr4xnSDxMaL'];

export const SPEAK_LIMITS = {
  /** A spoken lead is a sentence or two; this bounds what one request can cost. */
  textChars: 600,
  minRate: 0.5,
  maxRate: 1.2,
  defaultRate: 0.78,
};

const UPSTREAM_TIMEOUT_MS = 15000;

export interface SpeakRequest {
  text: string;
  voiceId: string;
  speechRate: number;
}

export type ParsedSpeak = { ok: true; value: SpeakRequest } | { ok: false; error: string };

export function parseSpeakRequest(raw: unknown): ParsedSpeak {
  let body = raw;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return { ok: false, error: 'the request body is not valid JSON' };
    }
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'the request body must be a JSON object' };
  }
  const { text, voiceId, speechRate } = body as Record<string, unknown>;
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'text is required' };
  if (text.trim().length > SPEAK_LIMITS.textChars) {
    return { ok: false, error: `text is longer than ${SPEAK_LIMITS.textChars} characters` };
  }
  if (typeof voiceId !== 'string' || !VOICES.includes(voiceId)) {
    return { ok: false, error: 'voiceId is not one of the available voices' };
  }
  if (
    speechRate !== undefined &&
    (typeof speechRate !== 'number' || !Number.isFinite(speechRate))
  ) {
    return { ok: false, error: 'speechRate must be a number' };
  }
  const rate = speechRate ?? SPEAK_LIMITS.defaultRate;
  return {
    ok: true,
    value: {
      text: text.trim(),
      voiceId,
      speechRate: Math.min(Math.max(rate, SPEAK_LIMITS.minRate), SPEAK_LIMITS.maxRate),
    },
  };
}

export interface SpeakDeps {
  /** The voice provider's key, or null while the endpoint is switched off. */
  apiKey: string | null;
  verifySession: SessionVerifier;
  /** The spending guard. Required, as on the turn endpoint. */
  admit(userId: string): Promise<Admission>;
  /** Called after speech was produced, for metering. Must not throw. */
  onSpoken?(reading: { userId: string; chars: number; model: string }): void;
  fetch?: typeof globalThis.fetch;
}

export function createSpeakHandler(deps: SpeakDeps): Handler {
  const fetchFn = deps.fetch ?? globalThis.fetch;
  return async function speak(req, res) {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ error: 'method not allowed' });
      return;
    }
    const apiKey = deps.apiKey;
    if (!apiKey) {
      res.status(503).json({ error: 'speech is not available yet' });
      return;
    }

    const userId = await deps.verifySession(bearerToken(req));
    if (!userId) {
      res.status(401).json({ error: 'sign-in required' });
      return;
    }

    let body: unknown;
    try {
      body = req.body;
    } catch {
      res.status(400).json({ error: 'the request body is not valid JSON' });
      return;
    }
    const parsed = parseSpeakRequest(body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const { text, voiceId, speechRate } = parsed.value;

    const admission = await deps.admit(userId);
    if (!admission.ok) {
      res.status(admission.status).json({ error: admission.error, code: admission.code });
      return;
    }

    let upstream: Response;
    try {
      upstream = await fetchFn(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
        {
          method: 'POST',
          headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            model_id: MODEL_ID,
            output_format: 'mp3_44100_64',
            voice_settings: {
              stability: 0.4,
              similarity_boost: 0.75,
              style: 0.2,
              speed: speechRate,
            },
          }),
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        }
      );
    } catch (err) {
      console.error(
        `[speak] upstream request failed: ${err instanceof Error ? err.message : String(err)}`
      );
      res.status(502).json({ error: 'speech could not be produced', code: 'unavailable' });
      return;
    }
    if (!upstream.ok) {
      // The provider's own words can name the account and its quota: log, do not forward.
      const detail = await upstream.text().catch(() => '');
      console.error(`[speak] upstream ${upstream.status}: ${detail.slice(0, 300)}`);
      res
        .status(upstream.status === 429 ? 429 : 502)
        .json({ error: 'speech could not be produced', code: 'unavailable' });
      return;
    }

    const audio = (await upstream.json()) as unknown;
    deps.onSpoken?.({ userId, chars: text.length, model: MODEL_ID });
    res.status(200).json(audio);
  };
}
