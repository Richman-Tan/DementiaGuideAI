#!/usr/bin/env node
// E4-S (docs/eval/evaluation-plan.md §18.1): headless SPOKEN-turn latency on
// the production code path with the fallback recogniser — the web voice
// pipeline (apps/web/src/voice/useVoiceConversation.js stopAndTranscribe →
// processQuery), reproduced call by call in Node:
//
//   whisper-1 upload (openaiClient.transcribe: language 'en', webm/opus file)
//   → text-embedding-3-small (openaiClient._embedQuery)
//   → match_chunks RPC, 50 candidates, query_text = transcript → capBySourceFamily
//   → buildSystemPrompt(web defaults) + buildUserContent → gpt-4o stream
//     (temperature 0.7, max_tokens per style, no history)
//   → createMarkerStripper → createSentenceSplitter → first sentence
//   → normalizeSpokenText → ElevenLabs REST /with-timestamps as the study proxy
//     sends it (apps/api/api/eleven-tts.js) — first sentence only
//
// Every request is timed on ONE clock per turn: t0 = start of the upload,
// which stands in for the end of recording. Question audio is synthesised
// offline to files with macOS `say -o` + ffmpeg (webm/opus, the MediaRecorder
// format). NOTHING IS EVER PLAYED. Label results "headless pipeline, not
// perceived in-browser latency".
//
//   node scripts/eval/latency/bench-spoken.mjs --dry-run
//   node scripts/eval/latency/bench-spoken.mjs [--questions 30] [--repeats 2] [--warmup 2] [--tts]
//        [--tag mac-wifi] [--pace-ms 5000] [--voice Karen] [--out-dir docs/report/eval/latency]
//   node scripts/eval/latency/bench-spoken.mjs --summarise-only --tag <tag> --sha <sha>
// --tts needs ELEVENLABS_API_KEY in .env / the environment; without it the TTS
// stage is skipped and to_first_tts_request is reported as a lower bound on
// time to first audio (§18.1 "Key contingency").
import { writeFileSync, mkdirSync, readFileSync, appendFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import os from 'node:os';

import { gitSha, csvEscape, sleep, ROOT, OPENAI_BASE, OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, env, requireEnv } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { QUESTIONS, questionText } = require('../questions.js');
const {
  EMBEDDING_MODEL, CHAT_MODEL, TOP_K, RETRIEVAL_OVERSAMPLE, MIN_SIMILARITY, MAX_PER_SOURCE_FAMILY,
  GENERATION_TEMPERATURE, CITATION_MODE, PROMPT_VERSION, maxTokensForStyle,
} = require('../../../packages/core/rag/ragConfig.js');
const { capBySourceFamily } = require('../../../packages/core/rag/retrieval.js');
const { buildSystemPrompt, buildUserContent } = require('../../../packages/core/rag/prompt.js');
const { createMarkerStripper } = require('../../../packages/core/rag/citations.js');
const { summary } = require('../lib/stats.js');
const { parseCsv } = require('../lib/csv.js');
const { wer } = require('../lib/wer.js');
const { loadModule } = require('../../../unity-avatar/tools/esm-loader.js');
const { createSentenceSplitter } = loadModule(resolve(ROOT, 'packages/core/voice/sentenceTracker.js'));
const { normalizeSpokenText } = loadModule(resolve(ROOT, 'packages/core/tts/normalizeSpokenText.js'));
const { mapSettingsToRag, speechRateFor } = loadModule(resolve(ROOT, 'apps/web/src/state/mapSettingsToRag.js'));

const args = process.argv.slice(2);
const has = (n) => args.includes(n);
const argVal = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };
const N_QUESTIONS = Number(argVal('--questions') ?? 30);
const REPEATS = Number(argVal('--repeats') ?? 2);
const WARMUP = Number(argVal('--warmup') ?? 2);
const TTS = has('--tts');
const TAG = argVal('--tag') ?? 'bench';
const PACE_MS = Number(argVal('--pace-ms') ?? 5000);
const VOICE_SAY = argVal('--voice') ?? 'Karen';
const OUT_DIR = resolve(ROOT, argVal('--out-dir') ?? 'docs/report/eval/latency');
const DRY_RUN = has('--dry-run');
const SUMMARISE_ONLY = has('--summarise-only');
const MAX_ATTEMPTS = 3;
const ELEVEN_KEY = env.ELEVENLABS_API_KEY;
const AUDIO_DIR = resolve(ROOT, '.cache/eval/spoken-audio', VOICE_SAY);

// ── Production settings, read from the web app so drift is caught ───────────
// SettingsContext.jsx is JSX (not loadable here); its DEFAULTS literals are
// parsed and asserted instead.
const settingsSrc = readFileSync(resolve(ROOT, 'apps/web/src/state/SettingsContext.jsx'), 'utf8');
const defaultOf = (k) => { const m = new RegExp(`\\b${k}:\\s*'([^']+)'`).exec(settingsSrc) ?? new RegExp(`\\b${k}:\\s*(true|false)`).exec(settingsSrc); return m ? (m[1] === 'true' ? true : m[1] === 'false' ? false : m[1]) : undefined; };
const WEB_DEFAULTS = Object.fromEntries(['setupType', 'ariaStyle', 'responseStyle', 'jargon', 'voiceSpeed', 'concise', 'avatarId'].map(k => [k, defaultOf(k)]));
for (const [k, v] of Object.entries(WEB_DEFAULTS)) if (v === undefined) { console.error(`could not read web default ${k} from SettingsContext.jsx`); process.exit(1); }
const RAG_OPTS = mapSettingsToRag(WEB_DEFAULTS);
const SPEECH_RATE = speechRateFor(WEB_DEFAULTS);
const profilesSrc = readFileSync(resolve(ROOT, 'apps/web/src/avatar/avatarProfiles.js'), 'utf8');
const aaronBlock = profilesSrc.slice(profilesSrc.indexOf(`${WEB_DEFAULTS.avatarId}: {`));
const ELEVEN_VOICE = /elevenVoiceId:\s*'([^']+)'/.exec(aaronBlock)?.[1];
// The study proxy's upstream request (apps/api/api/eleven-tts.js), asserted.
const proxySrc = readFileSync(resolve(ROOT, 'apps/api/api/eleven-tts.js'), 'utf8');
const ELEVEN_MODEL = /MODEL_ID\s*=\s*'([^']+)'/.exec(proxySrc)?.[1];
const ELEVEN_FORMAT = /output_format:\s*'([^']+)'/.exec(proxySrc)?.[1];
const num = (k) => Number(new RegExp(`${k}:\\s*([0-9.]+)`).exec(proxySrc)?.[1]);
const VOICE_SETTINGS = { stability: num('stability'), similarity_boost: num('similarity_boost'), style: num('style'), speed: Math.min(Math.max(SPEECH_RATE, 0.5), 1.2) };
if (!ELEVEN_VOICE || !ELEVEN_MODEL || !ELEVEN_FORMAT || Object.values(VOICE_SETTINGS).some(x => !Number.isFinite(x))) { console.error('could not read the TTS request shape from the app sources'); process.exit(1); }
const SYSTEM_PROMPT = buildSystemPrompt({ ...RAG_OPTS, includeSources: CITATION_MODE === 'inline' });
const MAX_TOKENS = maxTokensForStyle(RAG_OPTS.responseStyle, RAG_OPTS.conciseMode);

const PRICES = JSON.parse(readFileSync(resolve(ROOT, 'scripts/eval/pricing.2026-09.json'), 'utf8'));

const measuredQs = QUESTIONS.filter(q => q.set === 'A').slice(0, N_QUESTIONS);
const warmQs = QUESTIONS.filter(q => q.set === 'A-neighbour').slice(0, WARMUP);
const schedule = [
  ...warmQs.map((q, i) => ({ q, rep: 0, phase: 'warmup', idx: i })),
  ...Array.from({ length: REPEATS }, (_, rep) => measuredQs.map(q => ({ q, rep, phase: 'measured' }))).flat(),
];

const sha = argVal('--sha') ?? gitSha();
mkdirSync(OUT_DIR, { recursive: true });
const base = resolve(OUT_DIR, `spoken-bench_${sha}_${TAG}`);
const RAW = `${base}_raw.csv`;
const COLS = ['turn', 'phase', 'question_id', 'repeat', 'started_at', 'attempts', 'clip_ms', 'clip_bytes', 'clip_sha256',
  'transcript_wer', 'chunks', 'prompt_tokens', 'completion_tokens', 'embed_tokens', 'first_sentence_chars',
  'stt_ms', 'embed_ms', 'rpc_ms', 'llm_ttft_ms', 'llm_first_sentence_ms', 'llm_total_ms',
  'tts_ttfb_ms', 'tts_first_byte_ms', 'tts_complete_ms',
  'to_first_token_ms', 'to_first_tts_request_ms', 'to_first_audio_byte_ms', 'to_first_audio_playable_ms',
  'failed_attempt_notes', 'transcript'];

// ── Audio: offline synthesis to files only (never played) ───────────────────
function synthClip(q) {
  mkdirSync(AUDIO_DIR, { recursive: true });
  const out = resolve(AUDIO_DIR, `${q.id}.webm`);
  if (!existsSync(out)) {
    const aiff = resolve(AUDIO_DIR, `${q.id}.aiff`);
    // `-o` writes to a file; without it `say` would speak aloud — never do that.
    execFileSync('say', ['-v', VOICE_SAY, '-o', aiff, questionText(q, 'v2')]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error',
      '-f', 'lavfi', '-t', '0.3', '-i', 'anullsrc=r=48000:cl=mono',
      '-i', aiff,
      '-f', 'lavfi', '-t', '0.3', '-i', 'anullsrc=r=48000:cl=mono',
      '-filter_complex', '[1:a]aresample=48000,aformat=channel_layouts=mono[s];[0:a][s][2:a]concat=n=3:v=0:a=1[o]',
      '-map', '[o]', '-c:a', 'libopus', '-b:a', '32k', '-ac', '1', '-ar', '48000', out]);
  }
  const bytes = readFileSync(out);
  const durS = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', out]).toString().trim());
  return { path: out, bytes, ms: Math.round(durS * 1000), sha: createHash('sha256').update(bytes).digest('hex').slice(0, 12) };
}

// ── HTTP helpers that keep the status for the retry policy ──────────────────
class HttpError extends Error { constructor(label, status, body, retryAfter) { super(`${label} ${status}: ${String(body).slice(0, 160)}`); this.status = status; this.retryAfter = retryAfter; } }
async function check(label, r) {
  if (r.ok) return r;
  throw new HttpError(label, r.status, await r.text().catch(() => ''), Number(r.headers.get('retry-after')) || null);
}
const retryable = (e) => e.status === 429 || (e.status >= 500 && e.status < 600) || e.status == null;

async function ttsFirstSentence(text, t0) {
  const tReq = performance.now() - t0;
  const r = await check('elevenlabs', await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ELEVEN_VOICE)}/with-timestamps`, {
    method: 'POST',
    headers: { 'xi-api-key': ELEVEN_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text.slice(0, 4000), model_id: ELEVEN_MODEL, output_format: ELEVEN_FORMAT, voice_settings: VOICE_SETTINGS }),
  }));
  const tHeaders = performance.now() - t0;
  const reader = r.body.getReader();
  const parts = [];
  let tFirst = null;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (tFirst == null) tFirst = performance.now() - t0;
    parts.push(value);
  }
  const tComplete = performance.now() - t0;
  const data = JSON.parse(Buffer.concat(parts).toString('utf8'));
  if (!data.audio_base64) throw new Error('elevenlabs: response missing audio_base64');
  return { tReq, tHeaders, tFirst, tComplete };
}

async function oneTurn(q, clip) {
  const t0 = performance.now();
  const at = () => performance.now() - t0;
  const m = {};
  // 1. Fallback STT — openaiClient.transcribe
  const form = new FormData();
  form.append('file', new Blob([clip.bytes], { type: 'audio/webm' }), 'recording.webm');
  form.append('model', 'whisper-1');
  form.append('language', 'en');
  const sr = await check('whisper', await fetch(`${OPENAI_BASE}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }, body: form }));
  const transcript = ((await sr.json()).text ?? '').trim();
  m.sttDone = at();
  if (!transcript) throw new Error('empty transcript (the app would show "I didn\'t catch that")');
  const query = transcript.slice(0, 1000);
  // 2. Query embedding — openaiClient._embedQuery (no LRU: see §18.1)
  const er = await check('embed', await fetch(`${OPENAI_BASE}/embeddings`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` }, body: JSON.stringify({ model: EMBEDDING_MODEL, input: query }) }));
  const ej = await er.json();
  m.embedDone = at();
  // 3. Retrieval RPC — openaiClient.search
  const rr = await check('match_chunks', await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_chunks`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query_embedding: ej.data[0].embedding, query_text: query, match_count: TOP_K * RETRIEVAL_OVERSAMPLE, min_similarity: MIN_SIMILARITY }),
  }));
  const chunks = capBySourceFamily((await rr.json()) ?? [], TOP_K, MAX_PER_SOURCE_FAMILY);
  m.ragDone = at();
  // 4. LLM stream — openaiClient.chatStream
  m.llmSend = at();
  const lr = await check('chat', await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: buildUserContent(query, chunks) }],
      max_tokens: MAX_TOKENS, temperature: GENERATION_TEMPERATURE, stream: true,
      stream_options: { include_usage: true }, // pricing only; adds one final chunk
    }),
  }));
  const stripper = createMarkerStripper();
  const splitter = createSentenceSplitter();
  let firstSentence = null, ttsPromise = null, usage = null, buf = '';
  const onSentence = (s) => {
    const clean = s.trim();
    if (!clean || firstSentence != null) return;
    firstSentence = clean;
    m.firstSentence = at();
    // ttsClient.tts → normalizeSpokenText → REST; fired immediately, in
    // parallel with the rest of the stream, exactly as addSegment does.
    if (TTS && ELEVEN_KEY) ttsPromise = ttsFirstSentence(normalizeSpokenText(clean), t0);
  };
  const reader = lr.body.getReader();
  const dec = new TextDecoder();
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
      let j; try { j = JSON.parse(d); } catch { continue; }
      if (j.usage) usage = j.usage;
      const content = j.choices?.[0]?.delta?.content;
      if (!content) continue;
      if (m.firstToken == null) m.firstToken = at();
      const clean = stripper.write(content);
      if (clean) for (const s of splitter.push(clean)) onSentence(s);
    }
  }
  const tail = stripper.flush();
  if (tail) for (const s of splitter.push(tail)) onSentence(s);
  const rest = splitter.finish();
  if (rest) onSentence(rest);
  m.llmDone = at();
  let tts = null;
  if (ttsPromise) tts = await ttsPromise;
  return { m, transcript, chunks: chunks.length, usage, embedTokens: ej.usage?.total_tokens ?? null, firstSentence, tts };
}

function rowFrom(turn, s, clip, res, attempts, notes) {
  const { m, tts } = res;
  const r = (x) => (x == null || !Number.isFinite(x) ? '' : Math.round(x));
  return {
    turn, phase: s.phase, question_id: s.q.id, repeat: s.rep, started_at: new Date().toISOString(), attempts,
    clip_ms: clip.ms, clip_bytes: clip.bytes.length, clip_sha256: clip.sha,
    transcript_wer: wer(questionText(s.q, 'v2'), res.transcript).wer.toFixed(3), chunks: res.chunks,
    prompt_tokens: res.usage?.prompt_tokens ?? '', completion_tokens: res.usage?.completion_tokens ?? '', embed_tokens: res.embedTokens ?? '',
    first_sentence_chars: res.firstSentence?.length ?? '',
    stt_ms: r(m.sttDone), embed_ms: r(m.embedDone - m.sttDone), rpc_ms: r(m.ragDone - m.embedDone),
    llm_ttft_ms: r(m.firstToken - m.llmSend), llm_first_sentence_ms: r(m.firstSentence - m.llmSend), llm_total_ms: r(m.llmDone - m.llmSend),
    tts_ttfb_ms: tts ? r(tts.tHeaders - tts.tReq) : '', tts_first_byte_ms: tts ? r(tts.tFirst - tts.tReq) : '', tts_complete_ms: tts ? r(tts.tComplete - tts.tReq) : '',
    to_first_token_ms: r(m.firstToken), to_first_tts_request_ms: r(m.firstSentence),
    to_first_audio_byte_ms: tts ? r(tts.tFirst) : '', to_first_audio_playable_ms: tts ? r(tts.tComplete) : '',
    failed_attempt_notes: notes.join(' | '), transcript: res.transcript,
  };
}

// ── Environment record ───────────────────────────────────────────────────────
function networkInterface() {
  try {
    const dev = /interface:\s*(\S+)/.exec(execFileSync('route', ['-n', 'get', 'default']).toString())?.[1];
    const ports = execFileSync('networksetup', ['-listallhardwareports']).toString();
    const port = ports.split(/\n\n+/).find(b => new RegExp(`Device:\\s*${dev}\\b`).test(b));
    return `${/Hardware Port:\s*(.+)/.exec(port ?? '')?.[1] ?? 'unknown'} (${dev ?? '?'})`;
  } catch { return 'unknown'; }
}
async function baselineRtt(url) {
  const t = [];
  for (let i = 0; i < 6; i++) {
    const s = performance.now();
    try { const r = await fetch(url); await r.arrayBuffer(); } catch { /* status irrelevant */ }
    t.push(performance.now() - s);
    await sleep(200);
  }
  return summary(t.slice(1)).median; // first includes the TLS handshake
}
async function environment() {
  return {
    machine: `${os.cpus()[0]?.model ?? 'unknown CPU'}, ${(os.totalmem() / 2 ** 30).toFixed(0)} GB`,
    os: (() => { try { return execFileSync('sw_vers', ['-productVersion']).toString().trim(); } catch { return os.release(); } })(),
    node: process.version,
    network: networkInterface(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    rtt: {
      'api.openai.com': await baselineRtt('https://api.openai.com/v1/models'),
      supabase: await baselineRtt(`${SUPABASE_URL}/rest/v1/`),
      'api.elevenlabs.io': await baselineRtt('https://api.elevenlabs.io/v1/models'),
    },
  };
}

// ── Summary ──────────────────────────────────────────────────────────────────
function summarise(rows, meta) {
  const measured = rows.filter(r => r.phase === 'measured' && r.stt_ms !== '');
  const failed = rows.filter(r => r.phase === 'measured' && r.stt_ms === '');
  const hasTts = measured.some(r => r.tts_complete_ms !== '');
  const f = (x) => (x == null || Number.isNaN(x) ? '—' : Math.round(x).toLocaleString('en-NZ'));
  const statRow = (label, key) => {
    const v = measured.map(r => Number(r[key])).filter(Number.isFinite);
    const s = summary(v);
    return `| ${label} | ${s.n} | ${f(s.median)} | ${f(s.mean)} | ${f(s.p90)} | ${f(s.p95)} | ${f(s.sd)} | ${f(s.min)} | ${f(s.max)} |`;
  };
  const over = (key) => { const v = measured.map(r => Number(r[key])).filter(Number.isFinite); return v.length ? `${v.filter(x => x > 3000).length} of ${v.length} (${(100 * v.filter(x => x > 3000).length / v.length).toFixed(1)} %)` : '—'; };
  const sumCol = (k, rs = rows) => rs.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const pIn = PRICES.openai['gpt-4o'].input, pOut = PRICES.openai['gpt-4o'].output, pEmb = PRICES.openai['text-embedding-3-small'].input, pWh = PRICES.openai['whisper-1'].price;
  // Billed calls = every attempt that reached the provider; failed attempts are
  // not in the rows, so the attempt count bounds them (stated as such).
  const llmUsd = (sumCol('prompt_tokens') * pIn + sumCol('completion_tokens') * pOut) / 1e6;
  const embUsd = sumCol('embed_tokens') * pEmb / 1e6;
  const whUsd = rows.reduce((a, r) => a + (Number(r.clip_ms) || 0) / 60000 * pWh * (Number(r.attempts) || 1), 0);
  const ttsChars = rows.reduce((a, r) => a + (r.tts_complete_ms !== '' ? Number(r.first_sentence_chars) || 0 : 0), 0);
  const md = [];
  md.push(`# Spoken-turn latency, headless pipeline — ${meta.tag} (${meta.sha}, ${meta.date})`, '');
  md.push('**Headless pipeline, not perceived in-browser latency.** The production web voice pipeline with the **fallback recogniser** (`whisper-1` upload), run call by call from Node on this Mac against the live providers. It excludes the Vercel study-proxy hop, MediaRecorder finalisation, audio decode, the playback queue and the start of lip-sync. The primary live recogniser (Web Speech, or SFSpeechRecognizer on iOS) delivers its transcript almost at stop and is not on this path. Pre-specified in `docs/eval/evaluation-plan.md` §18.1.', '');
  md.push('## Run', '');
  md.push(`- Date ${meta.date}; commit \`${meta.sha}\`; generated by \`scripts/eval/latency/bench-spoken.mjs\`.`);
  md.push(`- Machine ${meta.env.machine}, macOS ${meta.env.os}, Node ${meta.env.node}; network ${meta.env.network}; time zone ${meta.env.timeZone}. Baseline HTTPS round trip (median of 5 unauthenticated requests after the first): api.openai.com ${f(meta.env.rtt['api.openai.com'])} ms, Supabase ${f(meta.env.rtt.supabase)} ms, api.elevenlabs.io ${f(meta.env.rtt['api.elevenlabs.io'])} ms.`);
  md.push(`- Models: \`whisper-1\` (language en), \`${EMBEDDING_MODEL}\`, \`match_chunks\` (top ${TOP_K} of ${TOP_K * RETRIEVAL_OVERSAMPLE}, family cap ${MAX_PER_SOURCE_FAMILY}), \`${CHAT_MODEL}\` (temperature ${GENERATION_TEMPERATURE}, max_tokens ${MAX_TOKENS}, prompt ${PROMPT_VERSION}, web defaults ${JSON.stringify(RAG_OPTS)}); TTS ${hasTts ? `ElevenLabs REST \`/with-timestamps\` \`${ELEVEN_MODEL}\`, \`${ELEVEN_FORMAT}\`, voice ${ELEVEN_VOICE}, ${JSON.stringify(VOICE_SETTINGS)}` : '**not run — `ELEVENLABS_API_KEY` absent** (§18.1 key contingency)'}.`);
  md.push(`- Audio: the question text synthesised offline with macOS \`say -v ${VOICE_SAY} -o\`, 300 ms silence each side, webm/opus mono 48 kHz 32 kbit/s; never played. Clip length median ${f(summary(measured.map(r => Number(r.clip_ms))).median)} ms. Transcript WER against the question text (sanity check only, synthetic speech): median ${summary(measured.map(r => Number(r.transcript_wer))).median?.toFixed(3) ?? '—'}, max ${summary(measured.map(r => Number(r.transcript_wer))).max?.toFixed(3) ?? '—'}.`);
  md.push(`- Sample: ${meta.nQuestions} Set-A questions × ${meta.repeats} repeats, round-robin, paced ${meta.paceMs} ms; ${meta.warmup} warm-up turns (A-neighbour) discarded. Measured turns: ${measured.length}; failed after ${MAX_ATTEMPTS} attempts: ${failed.length}; turns re-run after a retryable error: ${rows.filter(r => Number(r.attempts) > 1).length}.`);
  md.push(`- Prices (\`scripts/eval/pricing.2026-09.json\`, checked ${PRICES.checked}): gpt-4o US$${pIn}/${pOut} per 1M tokens, embeddings US$${pEmb}/1M, whisper-1 US$${pWh}/min${hasTts ? ', ElevenLabs from plan credits' : ''}. **Spend for this run ≈ US$${(llmUsd + embUsd + whUsd).toFixed(3)}** (gpt-4o ${llmUsd.toFixed(3)}, whisper-1 ${whUsd.toFixed(4)}, embeddings ${embUsd.toFixed(5)}; all ${rows.length} turns incl. warm-up)${hasTts ? `; ElevenLabs ${ttsChars} characters` : ''}.`);
  md.push(`- Regenerate: \`${meta.command}\`; rebuild this file from the raw CSV with \`node scripts/eval/latency/bench-spoken.mjs --summarise-only --tag ${meta.tag} --sha ${meta.sha}\`.`, '');
  md.push('## Stages (ms, measured turns)', '');
  md.push('| Stage | n | median | mean | p90 | p95 | sd | min | max |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  md.push(statRow('Speech-to-text, `whisper-1` upload (fallback)', 'stt_ms'));
  md.push(statRow('Query embedding', 'embed_ms'));
  md.push(statRow('Retrieval RPC `match_chunks`', 'rpc_ms'));
  md.push(statRow('LLM request → first token', 'llm_ttft_ms'));
  md.push(statRow('LLM request → first sentence', 'llm_first_sentence_ms'));
  md.push(statRow('LLM request → stream end', 'llm_total_ms'));
  if (hasTts) {
    md.push(statRow('TTS request → response headers', 'tts_ttfb_ms'));
    md.push(statRow('TTS request → first audio byte', 'tts_first_byte_ms'));
    md.push(statRow('TTS request → complete (playable)', 'tts_complete_ms'));
  }
  md.push('', '## Milestones from the end of speech (ms, measured turns)', '');
  md.push('| Milestone | n | median | mean | p90 | p95 | sd | min | max |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  md.push(statRow('First LLM token', 'to_first_token_ms'));
  md.push(statRow('First sentence ready = first TTS request', 'to_first_tts_request_ms'));
  if (hasTts) {
    md.push(statRow('**First audio byte (headline)**', 'to_first_audio_byte_ms'));
    md.push(statRow('First audio playable (TTS response complete)', 'to_first_audio_playable_ms'));
  }
  md.push('', '## Against the post-hoc 3 s yardstick (report §4.5)', '');
  md.push(`- First LLM token later than 3,000 ms: ${over('to_first_token_ms')}.`);
  md.push(`- First sentence ready (first TTS request) later than 3,000 ms: ${over('to_first_tts_request_ms')}.`);
  if (hasTts) {
    md.push(`- **First audio byte later than 3,000 ms: ${over('to_first_audio_byte_ms')}.**`);
    md.push(`- First audio playable later than 3,000 ms: ${over('to_first_audio_playable_ms')}.`);
  } else {
    md.push('- First audio byte: **not measured** (no ElevenLabs key). Speech synthesis can only add time, so the first-sentence milestone is a strict lower bound on time to first audio, and the share above is a lower bound on the share of turns whose first audio would exceed 3 s.');
  }
  if (failed.length) md.push('', `Failed turns: ${failed.map(r => `${r.question_id}#${r.repeat} (${r.failed_attempt_notes})`).join('; ')}.`);
  md.push('');
  return md.join('\n');
}

async function main() {
  const cmd = `node scripts/eval/latency/bench-spoken.mjs ${args.filter(a => a !== '--summarise-only').join(' ')}`.trim();
  console.log(`Spoken-turn bench — ${measuredQs.length} questions × ${REPEATS} + ${warmQs.length} warm-up = ${schedule.length} turns; TTS ${TTS ? (ELEVEN_KEY ? 'on' : 'requested but ELEVENLABS_API_KEY missing → skipped') : 'off'}; tag ${TAG}; voice ${VOICE_SAY}`);
  console.log(`  web defaults ${JSON.stringify(WEB_DEFAULTS)} → ${JSON.stringify(RAG_OPTS)}, speechRate ${SPEECH_RATE}, max_tokens ${MAX_TOKENS}; TTS ${ELEVEN_MODEL}/${ELEVEN_FORMAT}/${ELEVEN_VOICE} ${JSON.stringify(VOICE_SETTINGS)}`);
  const metaPath = `${base}_meta.json`;
  if (SUMMARISE_ONLY) {
    const rows = parseCsv(readFileSync(RAW, 'utf8'));
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    writeFileSync(`${base}.md`, summarise(rows, meta));
    console.log(`rebuilt ${base}.md`);
    return;
  }
  if (DRY_RUN) {
    const estTokIn = 3600, estTokOut = 230;
    const est = schedule.length * (estTokIn * PRICES.openai['gpt-4o'].input + estTokOut * PRICES.openai['gpt-4o'].output) / 1e6 + schedule.length * 5 / 60 * PRICES.openai['whisper-1'].price;
    console.log(`  estimated spend ≈ US$${est.toFixed(2)} (gpt-4o ≈ ${estTokIn}+${estTokOut} tokens/turn, whisper-1 ≈ 5 s/turn)${TTS ? `; ElevenLabs ≈ ${schedule.length * 110} characters` : ''}`);
    for (const q of [...warmQs, ...measuredQs]) synthClip(q);
    console.log(`  synthesised ${warmQs.length + measuredQs.length} clips under ${AUDIO_DIR} (not played)`);
    return;
  }
  requireEnv({ openai: true, supabase: true });
  if (existsSync(RAW)) { console.error(`${RAW} exists — choose another --tag`); process.exit(1); }
  const clips = Object.fromEntries([...warmQs, ...measuredQs].map(q => [q.id, synthClip(q)]));
  const envInfo = await environment();
  const meta = { tag: TAG, sha, date: new Date().toISOString().slice(0, 10), startedAt: new Date().toISOString(), command: cmd, env: envInfo, nQuestions: measuredQs.length, repeats: REPEATS, warmup: warmQs.length, paceMs: PACE_MS, tts: Boolean(TTS && ELEVEN_KEY) };
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  writeFileSync(RAW, COLS.join(',') + '\n');
  console.log(`  environment ${JSON.stringify(envInfo)}`);
  const rows = [];
  let turn = 0;
  for (const s of schedule) {
    turn++;
    const clip = clips[s.q.id];
    const notes = [];
    let row = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !row; attempt++) {
      try {
        const res = await oneTurn(s.q, clip);
        row = rowFrom(turn, s, clip, res, attempt, notes);
      } catch (e) {
        notes.push(String(e.message).replace(/\s+/g, ' ').slice(0, 120));
        if (attempt === MAX_ATTEMPTS || !(retryable(e) || /empty transcript/.test(e.message))) {
          row = { turn, phase: s.phase, question_id: s.q.id, repeat: s.rep, started_at: new Date().toISOString(), attempts: attempt, clip_ms: clip.ms, clip_bytes: clip.bytes.length, clip_sha256: clip.sha, failed_attempt_notes: notes.join(' | ') };
          break;
        }
        const wait = e.retryAfter ? e.retryAfter * 1000 + 500 : 5000 * attempt;
        console.warn(`  ${s.q.id}#${s.rep} attempt ${attempt}: ${notes.at(-1)} — re-running the turn in ${wait} ms`);
        await sleep(wait);
      }
    }
    rows.push(row);
    appendFileSync(RAW, COLS.map(c => csvEscape(row[c] ?? '')).join(',') + '\n');
    console.log(`${String(turn).padStart(3)} ${s.phase.padEnd(8)} ${s.q.id.padEnd(4)}#${s.rep} ` + (row.stt_ms !== undefined && row.stt_ms !== ''
      ? `stt=${row.stt_ms} emb=${row.embed_ms} rpc=${row.rpc_ms} ttft=${row.llm_ttft_ms} sent=${row.llm_first_sentence_ms} → first token ${row.to_first_token_ms}, first TTS request ${row.to_first_tts_request_ms}${row.to_first_audio_byte_ms !== '' ? `, first audio byte ${row.to_first_audio_byte_ms}` : ''}`
      : `FAILED ${row.failed_attempt_notes}`));
    await sleep(PACE_MS);
  }
  meta.finishedAt = new Date().toISOString();
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  const md = summarise(parseCsv(readFileSync(RAW, 'utf8')), meta);
  writeFileSync(`${base}.md`, md);
  console.log('\n' + md);
  console.log(`Wrote ${base}.md, ${RAW}, ${metaPath}`);
}
main().catch(e => { console.error(e); process.exit(1); });
