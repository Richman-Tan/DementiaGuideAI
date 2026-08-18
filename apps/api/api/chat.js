// Streaming chat completion, credential held server-side.
//
// A passthrough rather than a reimplementation: retrieval, prompt assembly and
// citation extraction all stay in the client (packages/core/rag), so the study
// build and the bring-your-own-key build run byte-identical RAG logic and the
// study measures the shipped pipeline rather than a parallel one.
import { guard, requireEnv, readUserId } from './_lib/guard.js';
import { recordUsage } from './_lib/usage.js';

// Allowlisted so a leaked access code cannot be used to call an arbitrary model.
const MODELS = new Set(['gpt-4o', 'gpt-4o-mini']);
const MAX_TOKENS_CEILING = 1600;
// Input bounds. A study turn sends the system prompt, the retrieved passages and
// the conversation so far — comfortably inside both. Sized to leave headroom for
// a long session rather than to be tight, since the cost of being wrong here is
// a participant refused mid-task.
const MAX_MESSAGES = 60;
const MAX_INPUT_CHARS = 60000;
const DEFAULT_TEMPERATURE = 0.4;

// `Number(undefined) ?? 0.4` never applies its default — NaN is not nullish, and
// JSON.stringify turns it into null, so OpenAI falls back to ITS default of 1.0.
// A study build generating at a different temperature from the BYO-key build
// would break the byte-identical-pipeline property this proxy exists to keep.
// Pull total_tokens out of the trailing SSE frames, if the usage frame is there.
function totalTokensFrom(chunk) {
  for (const line of String(chunk).split('\n')) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    const d = t.slice(5).trim();
    if (d === '[DONE]') continue;
    try {
      const n = JSON.parse(d)?.usage?.total_tokens;
      if (Number.isFinite(n)) return n;
    } catch { /* partial frame */ }
  }
  return 0;
}

function clampTemperature(value) {
  const t = Number(value);
  return Number.isFinite(t) ? Math.min(Math.max(t, 0), 1) : DEFAULT_TEMPERATURE;
}

export default async function handler(req, res) {
  if (!(await guard(req, res))) return;
  const apiKey = requireEnv(res, process.env.OPENAI_API_KEY, 'OPENAI_API_KEY');
  if (!apiKey) return;

  const { model, messages, max_tokens: maxTokens, temperature } = req.body || {};

  if (!MODELS.has(model)) {
    res.status(400).json({ error: 'model not permitted' });
    return;
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages required' });
    return;
  }
  // Bound the INPUT as well as the output. max_tokens caps what the model
  // writes, but nothing capped what it was asked to read, and input is billed
  // too: a single caller could post megabytes of `messages` per request and, at
  // the daily request cap, run up a bill orders of magnitude beyond a real
  // session. That matters more now the study runs on one shared access code —
  // a leak is not contained to one participant.
  //
  // A real turn is a handful of retrieved passages plus the conversation so far,
  // which sits far inside these limits; anything beyond is not a session.
  if (messages.length > MAX_MESSAGES) {
    res.status(400).json({ error: `at most ${MAX_MESSAGES} messages per request` });
    return;
  }
  const totalChars = messages.reduce(
    (n, m) => n + (typeof m?.content === 'string' ? m.content.length : 0),
    0,
  );
  if (totalChars > MAX_INPUT_CHARS) {
    res.status(413).json({ error: 'conversation too long for one request' });
    return;
  }

  // Propagate a client disconnect upstream. Without this the function keeps
  // draining — and paying for — the completion after the participant navigates
  // away, which the study explicitly instruments them doing.
  const ac = new AbortController();
  const onClose = () => ac.abort();
  req.on('close', onClose);

  let upstream;
  try {
    upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: ac.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: Math.min(Number(maxTokens) || 800, MAX_TOKENS_CEILING),
        temperature: clampTemperature(temperature),
        stream: true,
        // Without this a streamed completion reports no usage at all, so every
        // chat turn would be invisible to metering.
        stream_options: { include_usage: true },
      }),
    });
  } catch (err) {
    console.error(`[study] chat upstream failed: ${err?.message ?? err}`);
    res.status(502).json({ error: 'upstream request failed' });
    return;
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    // 401 upstream means OUR key is bad, not the caller's. Reporting it as 401
    // would make the client render "your key looks invalid" to a participant
    // who never had a key.
    const status = upstream.status === 429 ? 429 : 502;
    console.error(`[study] chat upstream ${upstream.status}: ${detail.slice(0, 300)}`);
    res.status(status).json({ error: status === 429 ? 'rate limited' : 'upstream error' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let tail = '';
  let failed = false;
  try {
    for (;;) {
      if (res.destroyed || ac.signal.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      // Keep only the last chunk: the usage frame arrives at the very end, and
      // buffering the whole stream to find it would be pointless memory.
      tail = decoder.decode(value, { stream: true });
      res.write(value);
    }
  } catch (err) {
    failed = !ac.signal.aborted;
    if (failed) console.warn(`[study] chat stream interrupted: ${err?.message ?? err}`);
  } finally {
    // Headers went out as 200 before the first byte, so a mid-stream failure
    // cannot be signalled by status. Without this marker the client sees a clean
    // `done`, renders the truncated text as a complete answer, and the study
    // records it as a normal turn — a silent measurement error, not just a UX one.
    if (failed && !res.destroyed) {
      res.write('data: {"error":"stream_interrupted"}\n\n');
    }
    // cancel() returns a promise; a rejection here is unhandled and fatal on Node.
    await reader.cancel().catch(() => {});
    req.off('close', onClose);
    res.end();
    recordUsage({
      userId: readUserId(req), kind: 'chat',
      units: totalTokensFrom(tail), model,
    });
  }
}
