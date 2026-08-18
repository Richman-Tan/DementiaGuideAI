// Query embedding for retrieval, credential held server-side.
import { guard, requireEnv, readUserId } from './_lib/guard.js';
import { recordUsage } from './_lib/usage.js';

const MODELS = new Set(['text-embedding-3-small', 'text-embedding-3-large']);
const MAX_INPUT_CHARS = 4000;

export default async function handler(req, res) {
  if (!(await guard(req, res))) return;
  const apiKey = requireEnv(res, process.env.OPENAI_API_KEY, 'OPENAI_API_KEY');
  if (!apiKey) return;

  const { model, input } = req.body || {};
  if (!MODELS.has(model)) {
    res.status(400).json({ error: 'model not permitted' });
    return;
  }
  if (typeof input !== 'string' || !input.trim()) {
    res.status(400).json({ error: 'input required' });
    return;
  }

  let upstream;
  try {
    upstream = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, input: input.slice(0, MAX_INPUT_CHARS) }),
    });
  } catch (err) {
    console.error(`[study] embed upstream failed: ${err?.message ?? err}`);
    res.status(502).json({ error: 'upstream request failed' });
    return;
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    console.error(`[study] embed upstream ${upstream.status}: ${detail.slice(0, 300)}`);
    res.status(upstream.status === 429 ? 429 : 502).json({ error: 'upstream error' });
    return;
  }

  const body = await upstream.json();
  recordUsage({
    userId: readUserId(req), kind: 'embedding',
    units: body?.usage?.total_tokens ?? 0, model,
  });
  res.status(200).json(body);
}
