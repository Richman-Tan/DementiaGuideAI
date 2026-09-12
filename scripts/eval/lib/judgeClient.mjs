// Provider adapters for the LLM judges. One entry point, two families:
//   * OpenAI (gpt-4o-mini / gpt-4o) through the existing raw-fetch helper —
//     the same client the generation runner uses.
//   * Anthropic (claude-opus-5 by default) through the official SDK — a
//     different model family from the gpt-4o generator, which is the point:
//     a judge from the generator's own family has a measurable self-preference.
// Both return { text, usage, refused } and never throw on a refusal.
import Anthropic from '@anthropic-ai/sdk';
import { openaiJson, env } from '../lib.mjs';

const ANTHROPIC_MODELS = /^claude-/;
let anthropicClient = null;

export function isAnthropicModel(model) { return ANTHROPIC_MODELS.test(model); }

export function judgeCostEstimateUSD(model, calls, inTokens = 3900, outTokens = 300) {
  const rates = {
    'claude-opus-5': [5, 25], 'claude-sonnet-5': [2, 10], 'claude-haiku-4-5': [1, 5],
    'gpt-4o': [2.5, 10], 'gpt-4o-mini': [0.15, 0.6],
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

/**
 * @param {string} model
 * @param {string} system
 * @param {string} user
 * @param {{ effort?: string, maxTokens?: number }} opts
 */
export async function judgeCall(model, system, user, { effort = 'medium', maxTokens = 2000 } = {}) {
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
