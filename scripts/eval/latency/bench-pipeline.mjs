#!/usr/bin/env node
// Headless per-stage latency benchmark of the shipped pipeline components,
// runnable from any machine with the keys — no device, no browser.
//
// Stages (each timed with performance.now(), same request shapes as production):
//   embed    text-embedding-3-small request round trip
//   rpc      Supabase match_chunks hybrid RPC (50 candidates) round trip
//   llm      gpt-4o streaming: time to first content token (ttft) and total,
//            with the real system prompt + passages for the chosen condition
//   tts      ElevenLabs REST /with-timestamps (eleven_turbo_v2_5, the Unity
//            path's provider): time to first byte and total, first sentence only
//            (needs ELEVENLABS_API_KEY; skipped otherwise)
//   whisper  whisper-1 transcription of a local clip (--whisper file.wav)
//
// The first question's first repeat is flagged cold; summaries are reported
// for warm rows with the cold rows listed separately. Interleave conditions
// across runs on the same day rather than running them back to back.
//
//   node scripts/eval/latency/bench-pipeline.mjs [--questions 30] [--repeats 3] [--sets A] [--style balanced|brief|detailed]
//        [--prompt v2] [--no-rag] [--tts] [--voice nPczCjzI2devNBz1zQrb] [--whisper clip.wav] [--tag wifi-home] [--dry-run]
//        [--out-dir docs/report/eval/final] [--resume] [--pace-ms 300] [--summarise-only]
// --summarise-only rebuilds the markdown table from the raw CSV without any API calls.
// Keep --pace-ms at ~4000 on a 30k tokens-per-minute gpt-4o tier; a 429 is retried
// after the wait the API asks for and the successful attempt is what gets timed.
// Rows are appended to the raw CSV as they complete; --resume reloads that CSV
// and skips (question, repeat) pairs already measured, so a killed run loses nothing.
import { writeFileSync, mkdirSync, readFileSync, appendFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

import { requireEnv, openaiJson, gitSha, csvEscape, sleep, ROOT, OPENAI_BASE, OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, env } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { QUESTIONS, questionText } = require('../questions.js');
const { EMBEDDING_MODEL, CHAT_MODEL, TOP_K, RETRIEVAL_OVERSAMPLE, MIN_SIMILARITY, MAX_PER_SOURCE_FAMILY, GENERATION_TEMPERATURE, maxTokensForStyle } = require('../../../packages/core/rag/ragConfig.js');
const { capBySourceFamily } = require('../../../packages/core/rag/retrieval.js');
const { resolveCondition } = require('../prompts/promptVersions.js');
const { summary } = require('../lib/stats.js');
const { parseCsv } = require('../lib/csv.js');
const { loadModule } = require('../../../unity-avatar/tools/esm-loader.js');
const { createSentenceSplitter } = loadModule(resolve(ROOT, 'packages/core/voice/sentenceTracker.js'));

const args = process.argv.slice(2);
const has = (n) => args.includes(n);
const argVal = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };
const N_QUESTIONS = Number(argVal('--questions') ?? 30);
const REPEATS = Number(argVal('--repeats') ?? 3);
const SETS = (argVal('--sets') ?? 'A').split(',');
const STYLE = argVal('--style') ?? 'balanced';
const condition = resolveCondition(argVal('--prompt') ?? 'v2');
const NO_RAG = has('--no-rag');
const TTS = has('--tts');
const VOICE = argVal('--voice') ?? 'nPczCjzI2devNBz1zQrb'; // Brian — Aaron's voice in production
const WHISPER = argVal('--whisper');
const TAG = argVal('--tag') ?? 'bench';
const DRY_RUN = has('--dry-run');
const OUT_DIR = resolve(ROOT, argVal('--out-dir') ?? 'docs/report/eval/final');
const ELEVEN_KEY = env.ELEVENLABS_API_KEY;
const SUMMARISE_ONLY = has('--summarise-only');
const RESUME = has('--resume') || SUMMARISE_ONLY;
const PACE_MS = Number(argVal('--pace-ms') ?? 300);

const questions = QUESTIONS.filter(q => SETS.includes(q.set)).slice(0, N_QUESTIONS);
mkdirSync(OUT_DIR, { recursive: true });
const sha = gitSha();
const base = resolve(OUT_DIR, `latency-bench_${sha}_${TAG}`);
const RAW = `${base}_raw.csv`;
const RAW_HEADER = 'question_id,repeat,cold,stage,ms,note';
const rows = []; // { qid, repeat, cold, stage, ms, note }
if (RESUME && existsSync(RAW)) {
  // Proper CSV parse: error notes are quoted and may span lines.
  for (const r of parseCsv(readFileSync(RAW, 'utf8'))) {
    rows.push({ qid: r.question_id, repeat: Number(r.repeat), cold: r.cold === '1', stage: r.stage, ms: Number(r.ms), note: r.note ?? '', loaded: true });
  }
  console.log(`resuming: ${rows.length} rows already in ${RAW}`);
} else if (!DRY_RUN) {
  writeFileSync(RAW, RAW_HEADER + '\n');
}
// A pair counts as measured once its terminal LLM stage was recorded; pairs that
// errored before that are re-run on resume. Their earlier embed/rpc rows are
// kept as valid measurements and not recorded a second time.
const measured = new Set(rows.filter(r => r.stage === 'llm_total').map(r => `${r.qid}#${r.repeat}`));
const hasRetrievalRows = new Set(rows.filter(r => r.stage === 'rpc').map(r => `${r.qid}#${r.repeat}`));
const record = (qid, repeat, cold, stage, ms, note = '') => {
  const row = { qid, repeat, cold, stage, ms: Math.round(ms), note };
  rows.push(row);
  appendFileSync(RAW, [qid, repeat, cold ? 1 : 0, stage, row.ms, note].map(csvEscape).join(',') + '\n');
};

async function timedEmbed(text) {
  const t0 = performance.now();
  const data = await openaiJson('/embeddings', { model: EMBEDDING_MODEL, input: text });
  return { ms: performance.now() - t0, embedding: data.data[0].embedding };
}

async function timedRpc(embedding, text) {
  const t0 = performance.now();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_chunks`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query_embedding: embedding, query_text: text, match_count: TOP_K * RETRIEVAL_OVERSAMPLE, min_similarity: MIN_SIMILARITY }),
  });
  if (!r.ok) throw new Error(`match_chunks ${r.status}`);
  const all = await r.json();
  return { ms: performance.now() - t0, chunks: capBySourceFamily(all, TOP_K, MAX_PER_SOURCE_FAMILY) };
}

const sleepMs = (ms) => new Promise(r => setTimeout(r, ms));

// Retry a rate-limited request after the API's suggested wait; the timing that
// is recorded belongs to the attempt that succeeded, measured from its own start.
async function timedLlm(systemPrompt, userContent, attempt = 0) {
  try {
    return await timedLlmOnce(systemPrompt, userContent);
  } catch (e) {
    const suggested = /try again in ([\d.]+)\s*s/i.exec(String(e.message));
    if (attempt < 6 && /\b429\b|\b5\d\d\b/.test(String(e.message))) {
      const wait = suggested ? Math.ceil(Number(suggested[1]) * 1000) + 750 : 4000 * (attempt + 1);
      await sleepMs(wait);
      return timedLlm(systemPrompt, userContent, attempt + 1);
    }
    throw e;
  }
}

async function timedLlmOnce(systemPrompt, userContent) {
  const t0 = performance.now();
  const r = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: CHAT_MODEL, temperature: GENERATION_TEMPERATURE, max_tokens: maxTokensForStyle(STYLE, false), stream: true,
      stream_options: { include_usage: true },
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }],
    }),
  });
  if (!r.ok) throw new Error(`chat ${r.status}: ${(await r.text()).slice(0, 120)}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '', text = '', ttft = null, usage = null, chunks = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const d = t.slice(5).trim();
      if (d === '[DONE]') continue;
      try {
        const j = JSON.parse(d);
        const c = j.choices?.[0]?.delta?.content;
        if (c) { if (ttft == null) ttft = performance.now() - t0; text += c; chunks++; }
        if (j.usage) usage = j.usage;
      } catch { /* partial */ }
    }
  }
  return { ttft, total: performance.now() - t0, text, usage, chunks };
}

async function timedTts(text) {
  const t0 = performance.now();
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/with-timestamps`, {
    method: 'POST',
    headers: { 'xi-api-key': ELEVEN_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_turbo_v2_5', output_format: 'mp3_44100_64', voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.2, speed: 0.9 } }),
  });
  const ttfb = performance.now() - t0;
  if (!r.ok) throw new Error(`elevenlabs ${r.status}: ${(await r.text()).slice(0, 120)}`);
  const data = await r.json();
  return { ttfb, total: performance.now() - t0, audioChars: data.audio_base64?.length ?? 0, alignedChars: data.alignment?.characters?.length ?? 0 };
}

async function timedWhisper(path) {
  const bytes = readFileSync(resolve(ROOT, path));
  const form = new FormData();
  form.append('file', new Blob([bytes]), basename(path));
  form.append('model', 'whisper-1');
  form.append('language', 'en');
  const t0 = performance.now();
  const r = await fetch(`${OPENAI_BASE}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }, body: form });
  if (!r.ok) throw new Error(`whisper ${r.status}`);
  const j = await r.json();
  return { ms: performance.now() - t0, text: j.text ?? '' };
}

function firstSentence(text) {
  const out = [];
  const split = createSentenceSplitter();
  split.push(text, s => out.push(s));
  split.flush?.(s => out.push(s));
  return out[0] ?? text.slice(0, 150);
}

async function main() {
  const systemPrompt = condition.system({});
  console.log(`Latency bench — ${questions.length} questions × ${REPEATS} repeats, condition ${condition.id}, retrieval ${NO_RAG ? 'none' : 'production'}, style ${STYLE}, tts ${TTS ? (ELEVEN_KEY ? 'on' : 'requested but ELEVENLABS_API_KEY missing → skipped') : 'off'}, whisper ${WHISPER ?? 'off'}, tag ${TAG}`);
  if (DRY_RUN) { console.log(`${questions.length * REPEATS} pipeline runs (~US$${(questions.length * REPEATS * 0.02).toFixed(2)} in gpt-4o tokens${TTS ? ' + ElevenLabs characters' : ''}).`); return; }
  if (!SUMMARISE_ONLY) requireEnv({ supabase: !NO_RAG });

  let first = rows.length === 0;
  for (const q of SUMMARISE_ONLY ? [] : questions) {
    const text = questionText(q, 'v2');
    for (let rep = 0; rep < REPEATS; rep++) {
      if (measured.has(`${q.id}#${rep}`)) continue;
      const cold = first; first = false;
      const rerun = hasRetrievalRows.has(`${q.id}#${rep}`);
      let chunks = [];
      try {
        if (!NO_RAG) {
          const e = await timedEmbed(text); if (!rerun) record(q.id, rep, cold, 'embed', e.ms);
          const rpc = await timedRpc(e.embedding, text); if (!rerun) record(q.id, rep, cold, 'rpc', rpc.ms, `chunks=${rpc.chunks.length}`);
          chunks = rpc.chunks;
        }
        const llm = await timedLlm(systemPrompt, condition.userContent(text, chunks));
        record(q.id, rep, cold, 'llm_ttft', llm.ttft ?? NaN, `promptTokens=${llm.usage?.prompt_tokens ?? ''}`);
        record(q.id, rep, cold, 'llm_total', llm.total, `completionTokens=${llm.usage?.completion_tokens ?? ''} chars=${llm.text.length}`);
        if (TTS && ELEVEN_KEY) {
          const s = firstSentence(llm.text);
          const t = await timedTts(s);
          record(q.id, rep, cold, 'tts_ttfb', t.ttfb, `chars=${s.length}`);
          record(q.id, rep, cold, 'tts_total', t.total, `alignedChars=${t.alignedChars}`);
        }
        if (WHISPER) { const w = await timedWhisper(WHISPER); record(q.id, rep, cold, 'whisper', w.ms, `chars=${w.text.length}`); }
        console.log(`${q.id.padEnd(5)}#${rep}${cold ? ' cold' : ''}  ` + rows.filter(r => r.qid === q.id && r.repeat === rep && r.stage !== 'error').map(r => `${r.stage}=${r.ms}`).join(' '));
      } catch (e) {
        const brief = e.message.replace(/\s+/g, ' ').slice(0, 100);
        record(q.id, rep, cold, 'error', NaN, brief);
        console.warn(`${q.id}#${rep} error: ${brief}`);
      }
      await sleep(PACE_MS);
    }
  }

  // A pair that was re-measured on resume supersedes its earlier error row.
  const okPairs = new Set(rows.filter(r => r.stage === 'llm_total').map(r => `${r.qid}#${r.repeat}`));
  const errors = rows.filter(r => r.stage === 'error' && !okPairs.has(`${r.qid}#${r.repeat}`));
  const stages = [...new Set(rows.map(r => r.stage))].filter(s => s !== 'error');
  const md = [`# Headless latency benchmark — ${TAG} (${sha}, ${new Date().toISOString().slice(0, 10)})`, '',
    `Condition ${condition.id}, retrieval ${NO_RAG ? 'none' : 'production'}, style ${STYLE}, ${questions.length} questions × ${REPEATS} repeats. Warm rows exclude the first (cold) run. State the network and location alongside these numbers.`, '',
    '| Stage | n | median | mean | p90 | p95 | sd | min | max | cold (first run) |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const s of stages) {
    const warm = rows.filter(r => r.stage === s && !r.cold && Number.isFinite(r.ms)).map(r => r.ms);
    const cold = rows.find(r => r.stage === s && r.cold)?.ms;
    const st = summary(warm);
    const f = (x) => (x == null ? '—' : Math.round(x));
    md.push(`| ${s} | ${st.n} | ${f(st.median)} | ${f(st.mean)} | ${f(st.p90)} | ${f(st.p95)} | ${f(st.sd)} | ${f(st.min)} | ${f(st.max)} | ${cold ?? '—'} |`);
  }
  if (errors.length) md.push('', `${errors.length} run(s) errored and were not re-measured: ` + errors.map(e => `${e.qid}#${e.repeat} ${e.note.slice(0, 60)}`).join('; '));
  writeFileSync(`${base}.md`, md.join('\n') + '\n');
  console.log('\n' + md.join('\n'));
  console.log(`\nWrote ${base}.md and ${RAW}`);
}
main().catch(e => { console.error(e); process.exit(1); });
