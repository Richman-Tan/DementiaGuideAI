#!/usr/bin/env node
// §19J Part B (docs/eval/plan-19j-replication.md): the deployed and escalate-first prompts on a
// Claude model, on the 307 garbled safety turns (questions.perturbed-s19j.js). Copied from
// s19h/run-claude.mjs (§19H.6): production retrieval on the garbled text, the same prompt
// packages (resolveCondition), max_tokens and JSON shape; only the item list changes.
// Anthropic's API takes no seed, and this model takes no temperature: its default sampling is used.
//
//   node scripts/eval/s19j/run-claude.mjs --prompt v2-escalate-checkback --model claude-sonnet-5-5 --sha <P> [--resume]
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { requireEnv, retrieve, gitSha, sleep, ANTHROPIC_API_KEY, ROOT } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { PERTURBED_QUESTIONS } = require('../questions.perturbed-s19j.js');
const { resolveCondition } = require('../prompts/promptVersions.js');
const { maxTokensForStyle } = require('../../../packages/core/rag/ragConfig.js');

const args = process.argv.slice(2);
const argVal = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };
const condition = resolveCondition(argVal('--prompt') ?? 'v2');
const MODEL = argVal('--model') ?? 'claude-sonnet-5-5';
const SHA = argVal('--sha') ?? gitSha();
const RESUME = args.includes('--resume');
const PACE_MS = Number(argVal('--pace-ms') ?? 500);
const OUT = resolve(ROOT, argVal('--out') ?? `docs/report/eval/safety/generation_${SHA}_${condition.id}_${MODEL}_s19j.json`);

requireEnv({ openai: true, supabase: true, anthropic: true });   // retrieval embeds the question with OpenAI
const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const systemPrompt = condition.system({});
const systemPromptSha256 = createHash('sha256').update(systemPrompt).digest('hex');
const maxTokens = maxTokensForStyle('balanced');
const questions = PERTURBED_QUESTIONS;

const header = () => ({
  generatedAt: new Date().toISOString(), gitSha: SHA, actualGitSha: gitSha(), condition: condition.id, promptVersion: condition.id,
  promptLabel: condition.label, region: condition.region, citationMode: condition.citationMode, retrievalMode: 'production',
  injection: true, questionVersion: 'v2', heldout: true, questionsFile: 'scripts/eval/questions.perturbed-s19j.js', model: MODEL,
  temperature: null, seed: null, samples: 1, tag: 's19j', systemPromptSha256,
  methodologyNote: 'Anthropic Messages API: no seed; no temperature (deprecated for this model; default sampling); reasoning off (thinking between_tools, no tools given), so max_tokens counts visible text only, as for the OpenAI models; max_tokens as run-generation.mjs; §19J Part B (as §19H.6).',
});

let rows = [];
if (RESUME && existsSync(OUT)) {
  const prev = JSON.parse(readFileSync(OUT, 'utf8'));
  if (prev.systemPromptSha256 !== systemPromptSha256 || prev.model !== MODEL) { console.error('existing file is for a different prompt or model'); process.exit(1); }
  rows = prev.rows;
}
const done = new Set(rows.map(r => r.id));
const save = (partial) => writeFileSync(OUT, JSON.stringify({ ...header(), partial, rows }, null, 2));

async function withRetry(fn, label, attempts = 8) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      const status = e?.status ?? 0;
      if (!(status === 429 || status >= 500 || /fetch failed|ECONNRESET|ETIMEDOUT|overloaded/i.test(String(e?.message)))) throw e;
      const wait = Math.min(60000, 2000 * 2 ** i);
      console.warn(`  ${label}: ${String(e?.message).slice(0, 70)} — retrying in ${wait} ms`);
      await sleep(wait);
    }
  }
  throw last;
}

console.log(`§19J Part B — ${condition.id} on ${MODEL}, ${questions.length} items, system prompt sha256 ${systemPromptSha256.slice(0, 12)}`);
let n = 0;
for (const q of questions) {
  if (done.has(q.id)) continue;
  const text = q.question;
  const base = await withRetry(() => retrieve(text), 'retrieve');
  const injected = (q.injectedPassages ?? []).map((p, k) => ({ id: `INJECT:${q.id}:${k}`, title: p.title, content: p.content, source_org: p.source_org ?? 'Injected test passage', similarity: null }));
  const chunks = [...base, ...injected];
  const userContent = condition.userContent(text, chunks);
  const msg = await withRetry(() => client.messages.create({
    model: MODEL, max_tokens: maxTokens, system: systemPrompt, thinking: { type: 'between_tools' },
    messages: [{ role: 'user', content: userContent }],
  }), q.id);
  const answer = msg.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
  rows.push({
    id: q.id, set: q.set, category: q.category, question: text, sample: 0, retrievalMode: 'production', injected: injected.length > 0,
    retrieved: chunks.map(c => ({ id: c.id, similarity: c.similarity ?? null })), answer, finishReason: msg.stop_reason ?? null,
    promptTokens: msg.usage?.input_tokens ?? null, completionTokens: msg.usage?.output_tokens ?? null, systemFingerprint: msg.model ?? null,
  });
  console.log(`${q.id.padEnd(5)} retrieved=${chunks.length}  answer=${answer.length} chars${msg.stop_reason === 'max_tokens' ? '  [TRUNCATED]' : ''}`);
  if (++n % 10 === 0) save(true);
  await sleep(PACE_MS);
}
save(false);
console.log(`wrote ${OUT} (${rows.length} rows)`);
