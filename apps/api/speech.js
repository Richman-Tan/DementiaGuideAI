// OpenAI text-to-speech — the last stage of the cascade in services/ttsClient.js.
import { guard, requireEnv } from './_lib/guard.js';

const VOICES = new Set(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']);
const MAX_INPUT_CHARS = 4000;

export default async function handler(req, res) {
  if (!(await guard(req, res))) return;
  const apiKey = requireEnv(res, process.env.OPENAI_API_KEY, 'OPENAI_API_KEY');
  if (!apiKey) return;

  const { input, voice = 'nova' } = req.body || {};
  if (typeof input !== 'string' || !input.trim()) {
    res.status(400).json({ error: 'input required' });
    return;
  }
  if (!VOICES.has(voice)) {
    res.status(400).json({ error: 'voice not permitted' });
    return;
  }

  let upstream;
  try {
    upstream = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'tts-1',
        voice,
        input: input.slice(0, MAX_INPUT_CHARS),
        response_format: 'mp3',
      }),
    });
  } catch (err) {
    console.error(`[study] speech upstream failed: ${err?.message ?? err}`);
    res.status(502).json({ error: 'upstream request failed' });
    return;
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    console.error(`[study] speech upstream ${upstream.status}: ${detail.slice(0, 300)}`);
    res.status(upstream.status === 429 ? 429 : 502).json({ error: 'upstream error' });
    return;
  }

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(Buffer.from(await upstream.arrayBuffer()));
}
