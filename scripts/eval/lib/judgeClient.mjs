// Provider adapters for the LLM judges. One entry point, three families:
//   * OpenAI (gpt-4o-mini / gpt-4o) through the existing raw-fetch helper —
//     the same client the generation runner uses.
//   * Anthropic (claude-opus-5 by default) through the official SDK — a
//     different model family from the gpt-4o generator, which is the point:
//     a judge from the generator's own family has a measurable self-preference.
//   * Google Gemini (gemini-3.8-flash) through the REST `v1` generateContent
//     endpoint — the free-tier cross-family judge of plan §18.2's deviation.
// All return { text, usage, refused } and never throw on a refusal.
import Anthropic from '@anthropic-ai/sdk';
import { openaiJson, env } from '../lib.mjs';

const ANTHROPIC_MODELS = /^claude-/;
const GEMINI_MODELS = /^gemini-/;
let anthropicClient = null;

export function isAnthropicModel(model) { return ANTHROPIC_MODELS.test(model); }
export function isGeminiModel(model) { return GEMINI_MODELS.test(model); }

export function judgeCostEstimateUSD(model, calls, inTokens = 3900, outTokens = 300) {
  const rates = {
    'claude-opus-5': [5, 25], 'claude-sonnet-5': [2, 10], 'claude-haiku-4-5': [1, 5],
    // Anthropic list prices read 2026-10-08 (plan §18.2).
    'claude-opus-5-5': [4, 20], 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5],
    'gpt-4o': [2.5, 10], 'gpt-4o-mini': [0.15, 0.6],
    // Free tier (plan §18.2 deviation): no charge, rate-limited instead.
    'gemini-3.8-flash': [0, 0],
  };
  const [i, o] = rates[model] ?? [5, 25];
  return calls * (inTokens * i + outTokens * o) / 1e6;
}

function getAnthropic() {
  if (!anthropicClient) {
    // lib.mjs merges .env into `env` without touching process.env; the SDK reads
    // ANTHROPIC_API_KEY from the environment (or an `ant auth login` profile).
    if (!process.env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

// Extract the first JSON object from a model reply (tolerates ```json fences).
export function parseJsonObject(text) {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try { return lowerKeys(JSON.parse(cleaned.slice(start, end + 1))); } catch { return null; }
}

// Judges echo the rubric headings ("GROUNDEDNESS") as keys; normalise the top
// level so lookups by dimension id never miss on case.
function lowerKeys(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [String(k).toLowerCase(), v]));
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Retry 429 / 5xx / network errors, honouring the API's "try again in Ns"
// when present (OpenAI puts it in the 429 body). Judge runs are hundreds of
// calls; without this a rate-limit burst silently leaves rows unscored.
async function withRetry(fn, attempts = 8) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      const msg = String(e?.message ?? e);
      const status = e?.status ?? (/\((\d{3})\)/.exec(msg)?.[1] && Number(/\((\d{3})\)/.exec(msg)[1]));
      const retryable = status === 429 || (status >= 500 && status < 600) || /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|overloaded/i.test(msg);
      if (!retryable || i === attempts - 1) throw e;
      // OpenAI: "try again in 1.2s"; Gemini: "retryDelay": "17s".
      const suggested = /try again in ([\d.]+)\s*s/i.exec(msg) ?? /"retryDelay":\s*"([\d.]+)s"/.exec(msg);
      const wait = Math.min(90000, suggested ? Math.ceil(Number(suggested[1]) * 1000) + 500 + Math.random() * 1500 : 2000 * 2 ** i + Math.random() * 1000);
      await sleep(wait);
    }
  }
  throw lastErr;
}

/**
 * @param {string} model
 * @param {string} system
 * @param {string} user
 * @param {{ effort?: string, maxTokens?: number }} opts
 */
export async function judgeCall(model, system, user, opts = {}) {
  return withRetry(() => judgeCallOnce(model, system, user, opts));
}

// Harm-themed evaluation items (crisis, self-harm, dangerous practice) must be
// judged, not filtered, so the API's content filters are relaxed for the judge.
const GEMINI_SAFETY = ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT']
  .map((category) => ({ category, threshold: 'BLOCK_NONE' }));

async function geminiCall(model, system, user, maxTokens) {
  const key = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set (root .env)');
  const r = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      safetySettings: GEMINI_SAFETY,
      // Thinking tokens count against maxOutputTokens on this model, so the
      // budget is generous; JSON is asked for in the prompt and parsed leniently.
      generationConfig: { temperature: 0, maxOutputTokens: Math.max(maxTokens, 8192) },
    }),
  });
  const body = await r.text();
  if (!r.ok) {
    // The free tier answers capacity spikes with 503 and, intermittently, an
    // empty-bodied 404; both are transient, so both are retried.
    const err = new Error(`gemini ${model} (${r.status === 404 && !body ? 503 : r.status}) ${body.slice(0, 400)}`);
    err.status = r.status === 404 && !body ? 503 : r.status;
    throw err;
  }
  const d = JSON.parse(body);
  const cand = d.candidates?.[0];
  if (d.promptFeedback?.blockReason || !cand || cand.finishReason === 'SAFETY' || cand.finishReason === 'PROHIBITED_CONTENT') {
    return { text: null, refused: true, refusalCategory: d.promptFeedback?.blockReason ?? cand?.finishReason ?? null, model: d.modelVersion ?? model, usage: d.usageMetadata ?? null };
  }
  const text = (cand.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('');
  return { text, refused: false, model: d.modelVersion ?? model, usage: d.usageMetadata ?? null, stopReason: cand.finishReason };
}

async function judgeCallOnce(model, system, user, { effort = 'medium', maxTokens = 2000 } = {}) {
  if (isGeminiModel(model)) return geminiCall(model, system, user, maxTokens);
  if (isAnthropicModel(model)) {
    const client = getAnthropic();
    // Server-side refusal fallback is enabled by default for Claude Opus 5 code
    // so a classifier decline on a harm-themed transcript (self-harm items are
    // in the safety set) is re-run on a fallback model inside the same call.
    const res = await client.beta.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    if (res.stop_reason === 'refusal') {
      return { text: null, refused: true, refusalCategory: res.stop_details?.category ?? null, model: res.model, usage: res.usage };
    }
    const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
    return { text, refused: false, model: res.model, usage: res.usage, stopReason: res.stop_reason };
  }
  const data = await openaiJson('/chat/completions', {
    model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    max_tokens: Math.min(maxTokens, 1000),
  });
  const choice = data.choices[0];
  return { text: choice.message.content, refused: false, model: data.model, usage: data.usage, stopReason: choice.finish_reason };
}
