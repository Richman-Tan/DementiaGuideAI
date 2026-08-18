// ElevenLabs REST text-to-speech with character alignment, credential held
// server-side. Returns the upstream JSON unchanged (audio_base64 + alignment)
// so services/ttsClient.js builds the viseme timeline exactly as it does on the
// bring-your-own-key path.
//
// The WebSocket streaming path (wss://api.elevenlabs.io) is deliberately NOT
// proxied: streaming stream-input needs the key in the client to open the
// socket, which is the thing this endpoint exists to avoid. The study therefore
// runs on this REST cascade and reports latency against it — recorded as a
// limitation in docs/study/protocol.md §10.
import { guard, requireEnv } from './_lib/guard.js';

const MODEL_ID = 'eleven_turbo_v2_5';
const MAX_INPUT_CHARS = 4000;
// Aaron (Brian) and Ariana (Bella) — the two roster voices in avatarProfiles.js.
const VOICES = new Set(['nPczCjzI2devNBz1zQrb', 'EXAVITQu4vr4xnSDxMaL']);

export default async function handler(req, res) {
  if (!(await guard(req, res))) return;
  const apiKey = requireEnv(res, process.env.ELEVENLABS_API_KEY, 'ELEVENLABS_API_KEY');
  if (!apiKey) return;

  const { text, voiceId, speechRate = 0.78 } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'text required' });
    return;
  }
  if (!VOICES.has(voiceId)) {
    res.status(400).json({ error: 'voice not permitted' });
    return;
  }

  let upstream;
  try {
    upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`,
      {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.slice(0, MAX_INPUT_CHARS),
          model_id: MODEL_ID,
          output_format: 'mp3_44100_64',
          voice_settings: {
            stability: 0.40,
            similarity_boost: 0.75,
            style: 0.20,
            speed: Math.min(Math.max(Number(speechRate) || 0.78, 0.5), 1.2),
          },
        }),
      }
    );
  } catch (err) {
    console.error(`[study] eleven upstream failed: ${err?.message ?? err}`);
    res.status(502).json({ error: 'upstream request failed' });
    return;
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    console.error(`[study] eleven upstream ${upstream.status}: ${detail.slice(0, 300)}`);
    res.status(upstream.status === 429 ? 429 : 502).json({ error: 'upstream error' });
    return;
  }

  res.status(200).json(await upstream.json());
}
