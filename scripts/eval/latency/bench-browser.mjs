#!/usr/bin/env node
// E4-B (docs/eval/evaluation-plan.md §18.4 + its deviation note): spoken-turn
// latency in real Google Chrome running the production web build's voice loop.
//
//   P  primary  — Chrome's Web Speech recogniser, as sttWeb.js uses it
//   F  fallback — window.SpeechRecognition deleted, so the app records with
//                 MediaRecorder and uploads to whisper-1 (the Firefox path)
//
// Same 30 Set-A questions × 2 repeats as E4-S, each item in both conditions
// back to back (order alternating), after 2 warm-up items; one page session.
// Headline H1 = end of speech → first answer audio starting in the page;
// H2 = stop tap → first audio (the app's own clock, E4-S's t0 analogue).
//
// SAFETY (non-negotiable, see §18.4):
//   - nothing audible: Chrome runs with --mute-audio; question audio is
//     synthesised to files with `say -o` and never played;
//   - no real microphone: the init script (browser-bench-init.js) supplies a
//     synthetic stream; native capture is never called; --disable-audio-input
//     is a guard; a TCC watchdog kills Chrome at any real-mic access request;
//   - no keys in the browser: the harness server (browser-bench-server.mjs)
//     holds them; the browser holds a throwaway guest code;
//   - no production writes: the guard's usage meter goes to a local stub;
//     Supabase auth/conversations/messages are blocked in the browser; any
//     other non-GET to Supabase except match_chunks stops the run.
//
//   node scripts/eval/latency/bench-browser.mjs --dry-run --unity-dir <dir>
//   node scripts/eval/latency/bench-browser.mjs --pilot 3 --unity-dir <dir>
//   node scripts/eval/latency/bench-browser.mjs --tag mac-2026-10-09 --unity-dir <dir>
//   node scripts/eval/latency/bench-browser.mjs --summarise-only --tag <tag> --sha <sha>
import { writeFileSync, mkdirSync, readFileSync, appendFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import os from 'node:os';

import { gitSha, csvEscape, sleep, ROOT, env, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib.mjs';
import { startHarnessServer } from './browser-bench-server.mjs';
import { kbFingerprint } from './kb-fingerprint.mjs';

const require = createRequire(import.meta.url);
const { QUESTIONS, questionText } = require('../questions.js');
const { summary } = require('../lib/stats.js');
const { parseCsv } = require('../lib/csv.js');
const { wer } = require('../lib/wer.js');

const args = process.argv.slice(2);
const has = (n) => args.includes(n);
const argVal = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };
const N_QUESTIONS = Number(argVal('--questions') ?? 30);
const REPEATS = Number(argVal('--repeats') ?? 2);
const WARMUP = Number(argVal('--warmup') ?? 2);
const TAG = argVal('--tag') ?? 'bench';
const PACE_MS = Number(argVal('--pace-ms') ?? 5000);
const VOICE_SAY = argVal('--voice') ?? 'Karen';
const PILOT = argVal('--pilot') ? Number(argVal('--pilot')) : null;
const CONDITIONS = (argVal('--conditions') ?? 'P,F').split(',');
const UNITY_DIR = argVal('--unity-dir') ? resolve(argVal('--unity-dir')) : resolve(ROOT, 'apps/web/public/unity');
const OUT_DIR = PILOT ? resolve(ROOT, '.cache/eval/browser-bench/pilot') : resolve(ROOT, argVal('--out-dir') ?? 'docs/report/eval/latency');
const DRY_RUN = has('--dry-run');
const SUMMARISE_ONLY = has('--summarise-only');
const SMOKE = has('--smoke'); // open the app, exercise the harness without a voice turn (no provider call)
const MAX_ATTEMPTS = 3;
const APP_BASE_SHA = '7386425'; // origin/main when §18.4 was committed
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CACHE = resolve(ROOT, '.cache/eval/browser-bench');
const AUDIO_DIR = resolve(ROOT, '.cache/eval/browser-audio', VOICE_SAY);
const E4S_RAW = resolve(ROOT, 'docs/report/eval/latency/spoken-bench_3ec1cc0_mac-2026-10-09-tts_raw.csv');
const PRICES = JSON.parse(readFileSync(resolve(ROOT, 'scripts/eval/pricing.2026-09.json'), 'utf8'));
const SPEND_CAP_OPENAI = 3.5;
const ELEVEN_UNITS_CAP = 3000;
const ELEVEN_UNITS_PER_CHAR = 0.11; // observed on this account (history, 9 Oct): ~11 units per 100 characters
const YARD = 3000;

const sb = new URL(SUPABASE_URL || 'https://unconfigured.invalid');
const measuredQs = QUESTIONS.filter((q) => q.set === 'A').slice(0, N_QUESTIONS);
const warmQs = QUESTIONS.filter((q) => q.set === 'A-neighbour').slice(0, WARMUP);
const orderFor = (i) => (i % 2 === 0 ? ['P', 'F'] : ['F', 'P']).filter((c) => CONDITIONS.includes(c));
const items = [
  ...warmQs.map((q) => ({ q, rep: 0, phase: 'warmup' })),
  ...Array.from({ length: REPEATS }, (_, rep) => measuredQs.map((q) => ({ q, rep, phase: 'measured' }))).flat(),
].map((it, i) => ({ ...it, index: i, order: orderFor(i) }));
const schedule = items.flatMap((it) => it.order.map((cond, k) => ({ ...it, cond, slot: k + 1 })));

const sha = argVal('--sha') ?? gitSha();
mkdirSync(OUT_DIR, { recursive: true });
const base = resolve(OUT_DIR, `browser-bench_${sha}_${PILOT ? `pilot-${Date.now()}` : TAG}`);
const RAW = `${base}_raw.csv`;
const COLS = ['turn', 'phase', 'condition', 'question_id', 'repeat', 'item', 'slot', 'started_at', 'attempts',
  'clip_ms', 'clip_sha256', 'stt_source', 'transcript_wer', 'spec_status',
  'h1_ms', 'h2_ms', 'tap_delay_ms',
  'app_stt_ms', 'app_rag_ms', 'app_llm_to_token_ms', 'app_first_sentence_ms', 'app_tts_first_ms', 'app_to_first_audio_ms', 'app_playback_wait_ms', 'app_to_first_token_ms',
  'decode_to_start_ms', 'output_latency_ms',
  'rec_final_wait_ms', 'rec_last_change_after_eos_ms', 'mr_finalise_ms',
  'rt_transcribe_ms', 'rt_embed_ms', 'rt_rpc_ms', 'rt_chat_headers_ms', 'rt_tts_ms', 'n_embed_before_tap', 'n_embed_after_tap', 'n_tts_requests', 'tts_held',
  'align_onset_err_ms', 'align_end_err_ms', 'recording_ms',
  'prompt_tokens', 'completion_tokens', 'embed_tokens', 'tts_chars', 'history_before', 'history_after',
  'failed_attempt_notes', 'transcript'];

// ── audio: offline synthesis to files only (never played) ────────────────────
function synthClip(q) {
  mkdirSync(AUDIO_DIR, { recursive: true });
  const aiff = resolve(AUDIO_DIR, `${q.id}.aiff`);
  const wav = resolve(AUDIO_DIR, `${q.id}.wav`);
  const webm = resolve(AUDIO_DIR, `${q.id}.webm`);
  // `-o` writes to a file; without it `say` would speak aloud — never do that.
  if (!existsSync(aiff)) execFileSync('say', ['-v', VOICE_SAY, '-o', aiff, questionText(q, 'v2')]);
  const pad = ['-f', 'lavfi', '-t', '0.3', '-i', 'anullsrc=r=48000:cl=mono', '-i', aiff, '-f', 'lavfi', '-t', '0.3', '-i', 'anullsrc=r=48000:cl=mono',
    '-filter_complex', '[1:a]aresample=48000,aformat=channel_layouts=mono[s];[0:a][s][2:a]concat=n=3:v=0:a=1[o]', '-map', '[o]'];
  if (!existsSync(wav)) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...pad, '-c:a', 'pcm_s16le', '-ac', '1', '-ar', '48000', wav]);
  // E4-S's exact webm recipe, only to prove the speech is the same audio.
  if (!existsSync(webm)) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...pad, '-c:a', 'libopus', '-b:a', '32k', '-ac', '1', '-ar', '48000', webm]);
  const bytes = readFileSync(wav);
  const durS = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', wav]).toString().trim());
  return {
    b64: bytes.toString('base64'), ms: durS * 1000,
    sha: createHash('sha256').update(bytes).digest('hex').slice(0, 12),
    webmBytes: readFileSync(webm).length,
    webmMs: Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', webm]).toString().trim()) * 1000,
  };
}

// ── offline alignment check on the app's own recording (nothing played) ─────
function analyseRecording(b64, mime, tag) {
  if (!b64) return null;
  const dir = resolve(CACHE, 'recordings');
  mkdirSync(dir, { recursive: true });
  const f = resolve(dir, `${tag}.${(mime || '').includes('mp4') ? 'mp4' : 'webm'}`);
  writeFileSync(f, Buffer.from(b64, 'base64'));
  const out = String(spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', f, '-af', 'silencedetect=noise=-45dB:d=0.12', '-f', 'null', '-'], { encoding: 'utf8' }).stderr ?? '');
  const starts = [...out.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Number(m[1]) * 1000);
  const ends = [...out.matchAll(/silence_end: (-?[\d.]+)/g)].map((m) => Number(m[1]) * 1000);
  const dur = (() => { const m = /time=(\d+):(\d+):([\d.]+)/g; let last = null; for (const x of out.matchAll(m)) last = x; return last ? (Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3])) * 1000 : null; })();
  // Speech onset = end of the leading silence; speech end = start of the trailing one.
  const onset = starts.length && starts[0] < 50 && ends.length ? ends[0] : (starts.length && starts[0] >= 50 ? 0 : null);
  const speechEnd = starts.length && starts[starts.length - 1] > (onset ?? 0) ? starts[starts.length - 1] : null;
  return { onset, speechEnd, dur };
}

// ── environment record (as E4-S) ─────────────────────────────────────────────
function networkInterface() {
  try {
    const dev = /interface:\s*(\S+)/.exec(execFileSync('route', ['-n', 'get', 'default']).toString())?.[1];
    const ports = execFileSync('networksetup', ['-listallhardwareports']).toString();
    const port = ports.split(/\n\n+/).find((b) => new RegExp(`Device:\\s*${dev}\\b`).test(b));
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
    chrome: execFileSync(CHROME, ['--version']).toString().trim(),
    playwrightCore: require('playwright-core/package.json').version,
    network: networkInterface(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    rtt: {
      'api.openai.com': await baselineRtt('https://api.openai.com/v1/models'),
      supabase: await baselineRtt(`${SUPABASE_URL}/rest/v1/`),
      'api.elevenlabs.io': await baselineRtt('https://api.elevenlabs.io/v1/models'),
    },
  };
}

async function elevenMeter() {
  if (!env.ELEVENLABS_API_KEY) return null;
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': env.ELEVENLABS_API_KEY } });
    const j = await r.json();
    return { tier: j.tier, used: j.character_count, limit: j.character_limit, at: new Date().toISOString() };
  } catch { return null; }
}

// ── TCC watchdog: a real-microphone access by THE HARNESS CHROME kills it ────
// macOS logs every microphone access request (tccd). Requests are correlated
// by msgID: AUTHREQ_CTX gives the service and whether it is a real access
// (preflight=no) or a status check; AUTHREQ_ATTRIBUTION gives the accessing
// pid and the responsible app. The harness Chrome runs with Terminal as its
// responsible app and its own --user-data-dir; any other app on the Mac (for
// example the author's own Chrome in a call) is recorded but does not stop
// the run. A first version stopped on any process and was tripped by the
// author's own Chrome at 14:45:10 (see the results note).
function startWatchdog(onTrip, isMine) {
  const wd = spawn('/usr/bin/log', ['stream', '--style', 'compact', '--predicate',
    'subsystem == "com.apple.TCC" AND (eventMessage CONTAINS "AUTHREQ_CTX" OR eventMessage CONTAINS "AUTHREQ_ATTRIBUTION" OR eventMessage CONTAINS "AUTHREQ_PROMPTING")']);
  const seen = { preflight: 0, trips: [], others: {} };
  const byMsg = new Map();
  const decide = (id) => {
    const m = byMsg.get(id);
    if (!m || m.done || !m.mic || m.preflight !== 'no' || !m.attr) return;
    m.done = true;
    const mine = (m.pid && isMine(m.pid)) || m.responsible === 'com.apple.Terminal';
    if (mine) { seen.trips.push(`${id} pid ${m.pid} responsible ${m.responsible}`); onTrip(`msgID ${id}, accessing pid ${m.pid}, responsible ${m.responsible}`); }
    else { const k = `${m.responsible ?? '?'} (${m.accessing ?? '?'})`; seen.others[k] = (seen.others[k] ?? 0) + 1; }
  };
  let buf = '';
  wd.stdout.on('data', (d) => {
    buf += String(d);
    const lines = buf.split('\n'); buf = lines.pop();
    for (const line of lines) {
      const id = /msgID=([\d.]+)/.exec(line)?.[1];
      if (!id) continue;
      const m = byMsg.get(id) ?? {};
      byMsg.set(id, m);
      if (/AUTHREQ_CTX/.test(line)) {
        m.mic = /service=kTCCServiceMicrophone/.test(line);
        m.preflight = /preflight=no/.test(line) ? 'no' : 'yes';
        if (m.mic && m.preflight === 'yes') seen.preflight++;
        if (m.mic && m.preflight === 'no' && !m.attr) setTimeout(() => { if (!m.done && !m.attr) { m.attr = true; m.responsible = 'unknown'; m.done = true; seen.trips.push(`${id} no attribution`); onTrip(`msgID ${id}: real-microphone request with no attribution`); } }, 3000);
      } else if (/AUTHREQ_ATTRIBUTION/.test(line)) {
        m.attr = true;
        m.responsible = /responsible=\{TCCDProcess: identifier=([\w.]+)/.exec(line)?.[1] ?? null;
        m.pid = Number(/accessing=\{TCCDProcess: identifier=[\w.]+, pid=(\d+)/.exec(line)?.[1]) || null;
        m.accessing = /accessing=\{TCCDProcess: identifier=([\w.]+)/.exec(line)?.[1] ?? null;
      } else if (/AUTHREQ_PROMPTING/.test(line) && /kTCCServiceMicrophone/.test(line) && /com\.apple\.Terminal/.test(line)) {
        seen.trips.push(`${id} prompt`); onTrip(`msgID ${id}: microphone prompt for Terminal`);
      }
      decide(id);
      if (byMsg.size > 5000) byMsg.clear();
    }
  });
  return { stop: () => wd.kill(), seen };
}

// ── row assembly ─────────────────────────────────────────────────────────────
const num = (x) => (x == null || !Number.isFinite(x) ? '' : Math.round(x));
function parseTurn(data, srvTurn, clip, cond) {
  const ev = data.events;
  const at = (k) => ev.filter((e) => e[1] === k);
  const clicks = at('click').filter((e) => e[2]?.trusted);
  const startClick = clicks.find((e) => e[2].label === 'Tap to talk');
  const stopClick = clicks.find((e) => e[2].label === 'Tap when finished');
  const gum = at('gum')[0];
  const tCap = gum?.[2]?.tCap ?? null;
  const tTap = stopClick?.[0] ?? null;
  const tEos = tCap != null ? tCap + clip.ms - 300 : null;
  const first = tTap != null ? at('src.start').find((e) => e[2].at >= tTap && (e[2].dur ?? 0) > 0) : null;
  const tAudio = first?.[2]?.at ?? null;
  const consoleLines = at('console').map((e) => [e[0], e[2]]);
  const latLine = consoleLines.find(([, s]) => s.includes('[LATENCY SUMMARY]'));
  let app = {};
  if (latLine) { try { app = JSON.parse(latLine[1].slice(latLine[1].indexOf('{'))); } catch { app = {}; } }
  const spec = consoleLines.find(([, s]) => /\[RAG\] speculative (hit|miss)/.test(s));
  const specStatus = spec ? /hit/.test(spec[1]) ? 'hit' : 'miss' : (cond === 'P' ? 'none' : '');
  const degraded = consoleLines.some(([, s]) => /live recognition failed to start/.test(s));
  const results = at('rec.result');
  const lastResult = results.at(-1);
  const recStop = at('rec.stop').find((e) => tTap == null || e[0] >= tTap);
  const recEnd = at('rec.end').at(-1);
  let lastChange = null; let prevText = null;
  for (const r of results) { if (r[2].text !== prevText) { lastChange = r[0]; prevText = r[2].text; } }
  const mrStop = at('mr.stop').at(-1);
  const mrStopped = at('mr.stopped').at(-1);
  const mrStarted = at('mr.start')[0]; // the recording's t = 0 is the start() call (its 'start' event lags by ~0.2 s)
  const res = data.resources;
  const after = (r) => tTap != null && r.start >= tTap - 5;
  const kind = (r) => (r.name.startsWith('/api/') ? r.name.split('?')[0].replace('/api/', '') : r.name.includes('/rpc/match_chunks') ? 'rpc' : 'other');
  const firstAfter = (k) => res.find((r) => kind(r) === k && after(r));
  const dur = (r) => (r ? r.end - r.start : null);
  const chat = firstAfter('chat');
  const transcribeReq = res.find((r) => kind(r) === 'transcribe');
  const sttSource = cond === 'F' ? (transcribeReq ? 'whisper' : 'none') : (transcribeReq ? 'whisper-rescue' : (degraded ? 'degraded' : 'live'));
  const transcript = cond === 'F' ? (srvTurn?.transcribe?.text ?? '') : (lastResult?.[2]?.text ?? '');
  return {
    tCap, tTap, tEos, tAudio, app, specStatus, degraded, sttSource, transcript,
    row: {
      spec_status: specStatus, stt_source: sttSource,
      h1_ms: num(tAudio != null && tEos != null ? tAudio - tEos : null),
      h2_ms: num(tAudio != null && tTap != null ? tAudio - tTap : null),
      tap_delay_ms: num(tTap != null && tEos != null ? tTap - tEos : null),
      app_stt_ms: app.stt_ms ?? '', app_rag_ms: app.rag_ms ?? '', app_llm_to_token_ms: app.llm_to_token_ms ?? '',
      app_first_sentence_ms: app.first_sentence_ms ?? '', app_tts_first_ms: app.tts_first_ms ?? '',
      app_to_first_audio_ms: app.to_first_audio_ms ?? '', app_playback_wait_ms: app.playback_wait_ms ?? '', app_to_first_token_ms: app.to_first_token_ms ?? '',
      decode_to_start_ms: num(tAudio != null && tTap != null && app.to_first_audio_ms != null ? tAudio - tTap - app.to_first_audio_ms : null),
      output_latency_ms: num(first ? ((first[2].base ?? 0) + (first[2].out ?? 0)) * 1000 : null),
      rec_final_wait_ms: num(cond === 'P' && recStop && recEnd ? recEnd[0] - recStop[0] : null),
      rec_last_change_after_eos_ms: num(cond === 'P' && lastChange != null && tEos != null ? lastChange - tEos : null),
      mr_finalise_ms: num(mrStop && mrStopped ? mrStopped[0] - mrStop[0] : null),
      rt_transcribe_ms: num(dur(transcribeReq)), rt_embed_ms: num(dur(firstAfter('embed'))), rt_rpc_ms: num(dur(firstAfter('rpc'))),
      rt_chat_headers_ms: num(chat ? chat.respStart - chat.start : null), rt_tts_ms: num(dur(firstAfter('eleven-tts'))),
      n_embed_before_tap: res.filter((r) => kind(r) === 'embed' && !after(r)).length,
      n_embed_after_tap: res.filter((r) => kind(r) === 'embed' && after(r)).length,
      n_tts_requests: srvTurn?.eleven ?? '', tts_held: srvTurn?.held ?? '',
      prompt_tokens: srvTurn?.chat?.prompt ?? '', completion_tokens: srvTurn?.chat?.completion ?? '', embed_tokens: srvTurn?.embedTokens ?? '',
      tts_chars: srvTurn?.elevenFirstChars ?? '',
      transcript,
    },
    mrStarted: mrStarted?.[0] ?? null,
  };
}

function validate(p, srvTurn, cond, live, hist) {
  const notes = [];
  if (p.tCap == null) notes.push('no synthetic capture');
  if (p.tTap == null) notes.push('no stop tap');
  if (p.tAudio == null) notes.push('no first audio');
  if (!p.app || p.app.to_first_audio_ms == null) notes.push('no [LATENCY SUMMARY] with first audio');
  if (cond === 'P' && live !== true) notes.push('live recogniser not exposed');
  if (cond === 'F' && live !== false) notes.push('recogniser still exposed');
  if (cond === 'P' && p.sttSource !== 'live') notes.push(`P transcript not live (${p.sttSource})`);
  if (cond === 'F' && p.sttSource !== 'whisper') notes.push('F without whisper upload');
  if (!p.transcript) notes.push('empty transcript');
  if (srvTurn?.speech) notes.push('OpenAI TTS fallback used');
  if (srvTurn?.errors?.length) notes.push(`HTTP ${srvTurn.errors.join(',')}`);
  if (hist.before !== 0) notes.push(`history before turn = ${hist.before}`);
  return notes;
}

// ── summary ──────────────────────────────────────────────────────────────────
function summarise(rows, meta) {
  const f = (x) => (x == null || Number.isNaN(x) ? '—' : Math.round(x).toLocaleString('en-NZ'));
  const s1 = (x) => (x == null || Number.isNaN(x) ? '—' : (x / 1000).toFixed(2));
  const ok = (r) => r.phase === 'measured' && r.h1_ms !== '';
  const byCond = Object.fromEntries(['P', 'F'].map((c) => [c, rows.filter((r) => ok(r) && r.condition === c)]));
  const failed = rows.filter((r) => r.phase === 'measured' && r.h1_ms === '');
  const vals = (rs, k) => rs.filter((r) => r[k] !== '' && r[k] != null).map((r) => Number(r[k])).filter(Number.isFinite);
  const stat = (rs, k) => summary(vals(rs, k));
  const statRow = (label, k) => {
    const cells = ['P', 'F'].map((c) => { const s = stat(byCond[c], k); return s.n ? `${s.n} | ${f(s.median)} | ${f(s.p90)} | ${f(s.p95)} | ${f(s.mean)} | ${f(s.min)}–${f(s.max)}` : '0 | — | — | — | — | —'; });
    return `| ${label} | ${cells.join(' | ')} |`;
  };
  const share = (rs, k) => { const v = vals(rs, k); const n = v.filter((x) => x > YARD).length; return v.length ? `${n} of ${v.length} (${(100 * n / v.length).toFixed(1)} %)` : '—'; };
  const med = (c, k) => stat(byCond[c], k).median;
  // pairing by item
  const key = (r) => `${r.question_id}#${r.repeat}`;
  const pMap = new Map(byCond.P.map((r) => [key(r), r]));
  const pairs = byCond.F.filter((r) => pMap.has(key(r))).map((r) => ({ k: key(r), p: Number(pMap.get(key(r)).h1_ms), f: Number(r.h1_ms), p2: Number(pMap.get(key(r)).h2_ms), f2: Number(r.h2_ms) }));
  const diffs = pairs.map((x) => x.p - x.f);
  const pFaster = diffs.filter((d) => d < 0).length;
  // vs E4-S
  let e4s = new Map();
  if (existsSync(E4S_RAW)) e4s = new Map(parseCsv(readFileSync(E4S_RAW, 'utf8')).filter((r) => r.phase === 'measured').map((r) => [`${r.question_id}#${r.repeat}`, r]));
  const vsE4S = byCond.F.filter((r) => e4s.has(key(r))).map((r) => ({ byte: Number(r.h2_ms) - Number(e4s.get(key(r)).to_first_audio_byte_ms), playable: Number(r.h2_ms) - Number(e4s.get(key(r)).to_first_audio_playable_ms) }));
  const stages = ['app_stt_ms', 'app_rag_ms', 'app_llm_to_token_ms', 'app_first_sentence_ms', 'app_tts_first_ms'];
  const largest = (c) => stages.map((k) => [k, med(c, k)]).filter(([, m]) => m != null).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const sumCol = (k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const pIn = PRICES.openai['gpt-4o'].input, pOut = PRICES.openai['gpt-4o'].output, pEmb = PRICES.openai['text-embedding-3-small'].input, pWh = PRICES.openai['whisper-1'].price, pEl = PRICES.elevenlabs.api_per_1k_chars.flash_turbo;
  const llmUsd = (sumCol('prompt_tokens') * pIn + sumCol('completion_tokens') * pOut) / 1e6;
  const embUsd = sumCol('embed_tokens') * pEmb / 1e6;
  const whUsd = rows.filter((r) => r.condition === 'F' || r.stt_source === 'whisper-rescue').reduce((a, r) => a + (Number(r.recording_ms) || 0) / 60000 * pWh, 0);
  const elChars = sumCol('tts_chars');
  const elUsd = elChars / 1000 * pEl;
  const sp = meta.spend ?? {};
  const B1 = med('P', 'h1_ms') != null && med('F', 'h1_ms') != null ? med('F', 'h1_ms') - med('P', 'h1_ms') : null;
  const B3n = vals(byCond.P, 'h1_ms').filter((x) => x > YARD).length, B3d = vals(byCond.P, 'h1_ms').length;
  const verdict = (cond) => (cond == null ? 'not testable' : cond ? '**Supported**' : '**Not supported**');
  const md = [];
  md.push(`# Spoken-turn latency in Chrome — ${meta.tag} (${meta.sha}, ${meta.date})`, '');
  md.push('**In-browser on a desktop Mac; synthetic speech; not a device; not real users.** The production web build\'s voice loop in real Google Chrome, push-to-talk, avatar Aaron on Unity, REST TTS through a localhost copy of the study proxy. Two recognisers: **P** Chrome\'s Web Speech API (the app\'s primary path) and **F** the fallback the app takes when the browser has no `SpeechRecognition` (MediaRecorder → `whisper-1`, the Firefox path, run in Chrome). Pre-specified in `docs/eval/evaluation-plan.md` §18.4 and its deviation note.', '');
  md.push('## Run', '');
  md.push(`- Date ${meta.date} (UTC; started ${meta.startedAt}, finished ${meta.finishedAt ?? '—'}); commit \`${meta.sha}\`; app trees (\`apps/\`, \`packages/\`) identical to \`${APP_BASE_SHA}\`: ${meta.appTreeIdentical ? 'yes' : '**no**'}; generated by \`scripts/eval/latency/bench-browser.mjs\`.`);
  md.push(`- Browser ${meta.env.chrome}, driven over the DevTools protocol by playwright-core ${meta.env.playwrightCore} (\`connectOverCDP\`, no Playwright launch defaults); switches \`${meta.chromeSwitches.join(' ')}\`.`);
  md.push(`- Machine ${meta.env.machine}, macOS ${meta.env.os}, Node ${meta.env.node}; network ${meta.env.network}; time zone ${meta.env.timeZone}. Baseline HTTPS round trip from Node (median of 5 after the first): api.openai.com ${f(meta.env.rtt['api.openai.com'])} ms, Supabase ${f(meta.env.rtt.supabase)} ms, api.elevenlabs.io ${f(meta.env.rtt['api.elevenlabs.io'])} ms.`);
  md.push(`- App: \`vite build\` of \`apps/web\` served on 127.0.0.1 (same-origin API, no CSP header); Unity WebGL build ${meta.unityVersion}; web defaults (balanced, plain → avoid, warm, carer, speed 0.78, push-to-talk); every turn starts from the app's own "New conversation" (history before each turn: ${meta.historyCheck}).`);
  md.push(`- Credentials and writes: provider keys only in the harness server process; the browser held a throwaway guest code. The guard's usage meter went to a local stub (${meta.adminStub}); Supabase auth/conversations/messages blocked in the browser (${meta.blockedCount} requests blocked); Supabase requests that went out: ${meta.supabaseAudit}.`);
  md.push(`- Microphone: none. The clip enters as a Web Audio track (init script); Web Speech gets it through \`start(track)\`. TCC watchdog: ${meta.watchdog}.`);
  md.push(`- Audio: \`say -v ${VOICE_SAY} -o\`, 300 ms silence each side, 48 kHz mono WAV; never played. Same speech as E4-S: ${meta.clipCheck}. Transcript WER against the question text (sanity check only): P median ${stat(byCond.P, 'transcript_wer').median?.toFixed(3) ?? '—'}, max ${stat(byCond.P, 'transcript_wer').max?.toFixed(3) ?? '—'}; F median ${stat(byCond.F, 'transcript_wer').median?.toFixed(3) ?? '—'}, max ${stat(byCond.F, 'transcript_wer').max?.toFixed(3) ?? '—'}.`);
  md.push(`- Sample: ${meta.nQuestions} Set-A questions × ${meta.repeats} repeats, each item in both conditions back to back (order alternating P-F / F-P), after ${meta.warmup} warm-up items in both conditions (discarded); paced ≥ ${meta.paceMs} ms. Measured turns: P ${byCond.P.length}, F ${byCond.F.length}; failed after ${MAX_ATTEMPTS} attempts: ${failed.length}; turns re-run: ${rows.filter((r) => Number(r.attempts) > 1).length}. Pilot turns before the run: ${meta.pilotTurns ?? '—'} (discarded).`);
  md.push(`- KB (read-only): start ${meta.kb?.start?.count ?? '—'} chunks, \`${meta.kb?.start?.idsContentHashSha256?.slice(0, 12) ?? '—'}…\`; end ${meta.kb?.end?.count ?? '—'} chunks, \`${meta.kb?.end?.idsContentHashSha256?.slice(0, 12) ?? '—'}…\`; vs the September snapshot (453): ${meta.kb?.summary ?? '—'}.`);
  md.push(`- Prices (\`scripts/eval/pricing.2026-09.json\`, checked ${PRICES.checked}): gpt-4o US$${pIn}/${pOut} per 1M tokens, embeddings US$${pEmb}/1M, whisper-1 US$${pWh}/min, ElevenLabs Flash/Turbo pay-as-you-go US$${pEl}/1k characters. **Spend for this run ≈ US$${(llmUsd + embUsd + whUsd + elUsd).toFixed(3)}** (gpt-4o ${llmUsd.toFixed(3)}, whisper-1 ${whUsd.toFixed(4)}, embeddings ${embUsd.toFixed(5)}, ElevenLabs ${elUsd.toFixed(3)} for ${elChars} characters; all ${rows.length} turns incl. warm-up and re-runs). ElevenLabs meter: ${sp.elevenMeter ?? '—'}.`);
  md.push(`- Regenerate: \`${meta.command}\`; rebuild this file from the raw CSV with \`node scripts/eval/latency/bench-browser.mjs --summarise-only --tag ${meta.tag} --sha ${meta.sha}\`.`, '');
  md.push('## Headline and stages (ms, measured turns)', '');
  md.push('| Measure | P n | P median | P p90 | P p95 | P mean | P min–max | F n | F median | F p90 | F p95 | F mean | F min–max |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  md.push(statRow('**H1 end of speech → first audio in the page**', 'h1_ms'));
  md.push(statRow('H2 stop tap → first audio', 'h2_ms'));
  md.push(statRow('Tap delay (end of speech → tap; 300 by design)', 'tap_delay_ms'));
  md.push(statRow('App `stt_ms` (tap → transcript)', 'app_stt_ms'));
  md.push(statRow('App `rag_ms` (transcript → passages)', 'app_rag_ms'));
  md.push(statRow('App `llm_to_token_ms`', 'app_llm_to_token_ms'));
  md.push(statRow('App `first_sentence_ms` (first token → first sentence)', 'app_first_sentence_ms'));
  md.push(statRow('App `tts_first_ms` (TTS request → audio in hand)', 'app_tts_first_ms'));
  md.push(statRow('App `playback_wait_ms` (audio in hand → app\'s firstAudio mark)', 'app_playback_wait_ms'));
  md.push(statRow('App `to_first_audio_ms` (its own mark, before decode)', 'app_to_first_audio_ms'));
  md.push(statRow('Decode and schedule (app mark → samples start)', 'decode_to_start_ms'));
  md.push(statRow('App `to_first_token_ms`', 'app_to_first_token_ms'));
  md.push(statRow('P: recogniser stop → final result (`end`)', 'rec_final_wait_ms'));
  md.push(statRow('P: last transcript change after end of speech', 'rec_last_change_after_eos_ms'));
  md.push(statRow('MediaRecorder stop → blob', 'mr_finalise_ms'));
  md.push(statRow('F: `/api/transcribe` round trip', 'rt_transcribe_ms'));
  md.push(statRow('`/api/embed` round trip (first after tap)', 'rt_embed_ms'));
  md.push(statRow('`match_chunks` round trip (first after tap)', 'rt_rpc_ms'));
  md.push(statRow('`/api/chat` request → headers', 'rt_chat_headers_ms'));
  md.push(statRow('`/api/eleven-tts` round trip (first sentence)', 'rt_tts_ms'));
  md.push(statRow('Output latency reported by the AudioContext (not added)', 'output_latency_ms'));
  md.push(statRow('Alignment: speech onset in the app\'s recording − expected', 'align_onset_err_ms'));
  md.push('', `Speculative retrieval in P: hit ${byCond.P.filter((r) => r.spec_status === 'hit').length}, miss ${byCond.P.filter((r) => r.spec_status === 'miss').length}, not fired ${byCond.P.filter((r) => r.spec_status === 'none').length}. Later-sentence TTS requests held and answered with a placeholder: ${sumCol('tts_held')}.`, '');
  md.push('## Against the 3 s yardstick (report §4.5)', '');
  md.push(`- P: H1 over 3,000 ms in ${share(byCond.P, 'h1_ms')}; H2 in ${share(byCond.P, 'h2_ms')}.`);
  md.push(`- F: H1 over 3,000 ms in ${share(byCond.F, 'h1_ms')}; H2 in ${share(byCond.F, 'h2_ms')}.`, '');
  md.push('## Paired comparisons (descriptive)', '');
  md.push(`- P − F on H1, paired by item (n = ${pairs.length}): median ${f(summary(diffs).median)} ms (p10 ${f(diffs.length ? [...diffs].sort((a, b) => a - b)[Math.floor(diffs.length * 0.1)] : null)}, p90 ${f(diffs.length ? [...diffs].sort((a, b) => a - b)[Math.floor(diffs.length * 0.9)] : null)}); P faster on ${pFaster} of ${pairs.length} items.`);
  md.push(`- F's H2 − E4-S, paired by item (n = ${vsE4S.length}): − \`to_first_audio_byte\` median ${f(summary(vsE4S.map((x) => x.byte)).median)} ms; − \`to_first_audio_playable\` median ${f(summary(vsE4S.map((x) => x.playable)).median)} ms. The runs were hours apart (E4-S 09:46–09:57 NZDT).`, '');
  md.push('## Pre-specified expectations (§18.4)', '');
  md.push('| Expectation | Result | Verdict |', '|---|---|---|');
  md.push(`| B1: P median H1 lower than F's by ≥ 0.5 s | P ${s1(med('P', 'h1_ms'))} s, F ${s1(med('F', 'h1_ms'))} s; gap ${s1(B1)} s | ${verdict(B1 == null ? null : B1 >= 500)} |`);
  md.push(`| B2: F median H2 > 4.25 s (E4-S headline) | ${s1(med('F', 'h2_ms'))} s | ${verdict(med('F', 'h2_ms') == null ? null : med('F', 'h2_ms') > 4250)} |`);
  md.push(`| B3: more than half of P turns have H1 > 3 s | ${B3n} of ${B3d} | ${verdict(B3d ? B3n / B3d > 0.5 : null)} |`);
  md.push(`| B4: largest app stage is \`stt_ms\` in F, and not \`stt_ms\` in P | F: \`${largest('F') ?? '—'}\`; P: \`${largest('P') ?? '—'}\` | ${verdict(largest('F') && largest('P') ? largest('F') === 'app_stt_ms' && largest('P') !== 'app_stt_ms' : null)} |`);
  if (failed.length) md.push('', `Failed turns: ${failed.map((r) => `${r.condition} ${r.question_id}#${r.repeat} (${r.failed_attempt_notes})`).join('; ')}.`);
  md.push('');
  return md.join('\n');
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const cmd = `node scripts/eval/latency/bench-browser.mjs ${args.filter((a) => a !== '--summarise-only').join(' ')}`.trim();
  const metaPath = `${base}_meta.json`;
  if (SUMMARISE_ONLY) {
    const rows = parseCsv(readFileSync(RAW, 'utf8'));
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    writeFileSync(`${base}.md`, summarise(rows, meta));
    console.log(`rebuilt ${base}.md`);
    return;
  }
  console.log(`E4-B — ${schedule.length} turns (${items.length} items × ${CONDITIONS.join('/')}), tag ${PILOT ? 'PILOT' : TAG}`);
  const appTreeIdentical = (() => { try { execFileSync('git', ['diff', '--quiet', APP_BASE_SHA, 'HEAD', '--', 'apps', 'packages'], { cwd: ROOT }); return true; } catch { return false; } })();
  if (!appTreeIdentical) { console.error(`apps/ or packages/ differ from ${APP_BASE_SHA} — refusing to run`); process.exit(1); }
  const unityManifest = JSON.parse(readFileSync(resolve(UNITY_DIR, 'Build/manifest.json'), 'utf8'));

  // Audio + the E4-S identity check.
  const clips = Object.fromEntries([...warmQs, ...measuredQs].map((q) => [q.id, synthClip(q)]));
  let clipCheck = 'E4-S raw CSV not found';
  if (existsSync(E4S_RAW)) {
    const e4s = parseCsv(readFileSync(E4S_RAW, 'utf8'));
    const ref = new Map(e4s.map((r) => [r.question_id, r]));
    const ids = Object.keys(clips).filter((id) => ref.has(id));
    const same = ids.filter((id) => Number(ref.get(id).clip_ms) === Math.round(clips[id].webmMs) && Number(ref.get(id).clip_bytes) === clips[id].webmBytes).length;
    clipCheck = `${same} of ${ids.length} regenerated E4-S webm clips match E4-S's \`clip_ms\` and \`clip_bytes\` exactly (sha256 cannot match: the webm muxer writes a random 16-byte segment UID; \`say\` output is byte-identical across runs)`;
  }
  console.log(`  audio: ${Object.keys(clips).length} clips; ${clipCheck}`);

  // Production build of apps/web (public Supabase values only; no keys).
  const dist = resolve(CACHE, 'dist');
  const buildEnv = { PATH: process.env.PATH, HOME: process.env.HOME, VITE_SUPABASE_URL: SUPABASE_URL, VITE_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY, VITE_API_BASE_URL: '', NODE_ENV: 'production' };
  if (!existsSync(resolve(dist, 'index.html')) || has('--rebuild')) {
    execFileSync(resolve(ROOT, 'node_modules/.bin/vite'), ['build', '--outDir', dist, '--emptyOutDir'], { cwd: resolve(ROOT, 'apps/web'), env: buildEnv, stdio: ['ignore', 'ignore', 'inherit'] });
  }
  const indexSha = createHash('sha256').update(readFileSync(resolve(dist, 'index.html'))).digest('hex').slice(0, 12);
  console.log(`  build: ${dist} (index.html ${indexSha}); Unity ${unityManifest.version}`);
  if (DRY_RUN) {
    const est = schedule.length * (3600 * PRICES.openai['gpt-4o'].input + 230 * PRICES.openai['gpt-4o'].output) / 1e6 + schedule.filter((s) => s.cond === 'F').length * 6 / 60 * PRICES.openai['whisper-1'].price;
    console.log(`  estimated OpenAI spend ≈ US$${est.toFixed(2)}; ElevenLabs ≈ ${schedule.length * 100} characters (US$${(schedule.length * 100 / 1000 * PRICES.elevenlabs.api_per_1k_chars.flash_turbo).toFixed(2)})`);
    return;
  }
  if (!env.OPENAI_API_KEY || !env.ELEVENLABS_API_KEY) { console.error('OPENAI_API_KEY and ELEVENLABS_API_KEY are required (root .env)'); process.exit(1); }
  if (existsSync(RAW)) { console.error(`${RAW} exists — choose another --tag`); process.exit(1); }

  // Placeholder for held later-sentence TTS requests: 0.3 s of silence.
  const ph = resolve(CACHE, 'placeholder.mp3');
  if (!existsSync(ph)) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-t', '0.3', '-i', 'anullsrc=r=44100:cl=mono', '-c:a', 'libmp3lame', '-b:a', '64k', ph]);

  const meterBefore = await elevenMeter();
  const envInfo = await environment();
  console.log(`  environment ${JSON.stringify(envInfo)}`);
  const kbStart = PILOT ? null : await kbFingerprint();
  if (kbStart) console.log(`  KB start: ${kbStart.count} chunks, ${kbStart.idsContentHashSha256.slice(0, 12)}…; identical to September: ${kbStart.vsSeptember.identical}`);

  // Server: keys into this process's env only (Chrome gets a clean env).
  const accessCode = randomBytes(24).toString('hex');
  process.env.OPENAI_API_KEY = env.OPENAI_API_KEY;
  process.env.ELEVENLABS_API_KEY = env.ELEVENLABS_API_KEY;
  process.env.STUDY_ACCESS_CODES = accessCode;
  const violations = [];
  let abortReason = null;
  const server = await startHarnessServer({
    distDir: dist, unityDir: UNITY_DIR, apiDir: resolve(ROOT, 'apps/api/api'),
    placeholderMp3Base64: readFileSync(ph).toString('base64'), placeholderSec: 0.3,
    onViolation: (m) => { violations.push(m); abortReason ??= m; },
  });
  const origin = `http://127.0.0.1:${server.port}`;

  // Chrome + watchdog.
  let chrome = null;
  const udd = mkdtempSync(join(os.tmpdir(), 'e4b-chrome-'));
  const isMine = (pid) => { try { return execFileSync('ps', ['-o', 'command=', '-p', String(pid)]).toString().includes(udd); } catch { return false; } };
  const watchdog = startWatchdog((why) => { abortReason = `TCC watchdog: ${why}`; try { chrome?.kill('SIGKILL'); } catch { /* gone */ } }, isMine);
  await sleep(1500);
  const switches = ['--mute-audio', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--disable-audio-input',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--no-first-run', '--no-default-browser-check', '--window-size=400,760', '--window-position=1300,120'];
  const chromeEnv = { PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER, TMPDIR: process.env.TMPDIR, LANG: process.env.LANG ?? 'en_NZ.UTF-8' };
  chrome = spawn(CHROME, [`--user-data-dir=${udd}`, '--remote-debugging-port=0', ...switches, 'about:blank'], { stdio: 'ignore', env: chromeEnv });
  let wsPort = null;
  for (let i = 0; i < 150 && !wsPort; i++) { await sleep(100); const f = join(udd, 'DevToolsActivePort'); if (existsSync(f)) wsPort = readFileSync(f, 'utf8').split('\n')[0]; }
  const { chromium } = require('playwright-core');
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${wsPort}`);
  const context = browser.contexts()[0];
  await context.addInitScript({ content: readFileSync(resolve(ROOT, 'scripts/eval/latency/browser-bench-init.js'), 'utf8') });
  // Seed state on the first load only: onboarded + the throwaway guest code
  // (stored as AccessCodeForm stores an accepted one).
  await context.addInitScript({ content: `try { if (!localStorage.getItem('dg_access')) { localStorage.setItem('dg_settings', JSON.stringify({ onboarded: true })); localStorage.setItem('dg_access', JSON.stringify({ code: ${JSON.stringify(accessCode)}, status: 'ok', checkedAt: new Date().toISOString() })); } } catch (e) {}` });
  const page = context.pages()[0] ?? await context.newPage();
  const cdp = await context.newCDPSession(page);
  let blockedCount = 0;
  const audit = {};
  await cdp.send('Fetch.enable', { patterns: [`${sb.origin}/auth/v1/*`, `${sb.origin}/rest/v1/conversations*`, `${sb.origin}/rest/v1/messages*`].map((urlPattern) => ({ urlPattern, requestStage: 'Request' })) });
  cdp.on('Fetch.requestPaused', (e) => { blockedCount++; cdp.send('Fetch.failRequest', { requestId: e.requestId, errorReason: 'BlockedByClient' }).catch(() => {}); });
  page.on('request', (r) => {
    let u; try { u = new URL(r.url()); } catch { return; }
    if (u.host !== sb.host) return;
    const blocked = /^\/(auth\/v1\/|rest\/v1\/(conversations|messages))/.test(u.pathname);
    const allowed = blocked || ['GET', 'HEAD', 'OPTIONS'].includes(r.method()) || (r.method() === 'POST' && u.pathname === '/rest/v1/rpc/match_chunks');
    const k = `${r.method()} ${u.pathname}${blocked ? ' (blocked)' : ''}`;
    audit[k] = (audit[k] ?? 0) + 1;
    if (!allowed) { violations.push(`Supabase ${k}`); abortReason ??= `unexpected Supabase request ${k}`; }
  });

  const unityReady = () => page.waitForFunction(() => {
    const c = document.querySelector('#unity-canvas');
    return Boolean(c && c.parentElement && c.parentElement.style.opacity === '1' && !c.closest('#unity-parking'));
  }, null, { timeout: 120000, polling: 250 });
  async function openApp() {
    await page.goto(`${origin}/#/app/voice`);
    await page.locator('button[aria-label="Tap to talk"]').waitFor({ timeout: 60000 });
    await unityReady();
    const text = await page.evaluate(() => document.body.innerText);
    if (/isn.t available right now/.test(text)) throw new Error('Unity avatar fell back to the Three.js avatar');
    await sleep(2000);
  }
  await openApp();
  console.log('  app open, Unity ready');
  if (SMOKE) {
    await page.evaluate(() => { location.hash = '#/app/chat'; });
    await page.getByRole('button', { name: 'New conversation' }).click();
    await sleep(400);
    await page.evaluate(() => { location.hash = '#/app/voice'; });
    await page.locator('button[aria-label="Tap to talk"]').waitFor({ timeout: 20000 });
    await unityReady();
    const liveP = await page.evaluate(() => window.__e4b.setLive(true));
    const liveF = await page.evaluate(() => window.__e4b.setLive(false));
    const liveP2 = await page.evaluate(() => window.__e4b.setLive(true));
    const ms = await page.evaluate(async (b64) => { window.__e4b.reset(); return window.__e4b.loadClip(b64); }, clips[measuredQs[0].id].b64);
    await page.mouse.click(5, 5); // user activation for the harness AudioContext
    const cap = await page.evaluate(async () => { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); const t = window.__e4b.tCap; const label = st.getAudioTracks()[0].label; st.getTracks().forEach((x) => x.stop()); return { t, label, now: performance.now() }; });
    const hist = await page.evaluate(() => localStorage.getItem('dg_history'));
    const mode = await page.evaluate(() => JSON.parse(localStorage.getItem('dg_access') || 'null')?.status);
    console.log(JSON.stringify({ liveP, liveF, liveP2, clipMs: ms, cap, hist, mode, blockedCount, audit, admin: server.stats.totals.adminCalls, statuses: server.stats.totals.statuses, watchdog: watchdog.seen, violations }, null, 1));
    await browser.close().catch(() => {});
    try { chrome.kill('SIGKILL'); } catch { /* gone */ }
    await sleep(1500); watchdog.stop(); await server.close();
    return;
  }

  const meta = {
    tag: PILOT ? 'pilot' : TAG, sha, date: new Date().toISOString().slice(0, 10), startedAt: new Date().toISOString(), command: cmd,
    env: envInfo, appBaseSha: APP_BASE_SHA, appTreeIdentical, buildIndexSha: indexSha, unityVersion: unityManifest.version, unityDir: UNITY_DIR,
    chromeSwitches: switches, nQuestions: measuredQs.length, repeats: REPEATS, warmup: warmQs.length, paceMs: PACE_MS, conditions: CONDITIONS,
    clipCheck, pilotTurns: argVal('--pilot-turns-before') ? Number(argVal('--pilot-turns-before')) : null,
    kb: { start: kbStart },
  };
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  writeFileSync(RAW, COLS.join(',') + '\n');
  const rows = [];
  let turnNo = 0;
  let lastEnd = 0;
  let pilotLeft = PILOT ?? Infinity;
  let openaiUsd = 0;
  let tapLag = 40; // ms; adapted after every turn (see attempt step 4)
  const priceTurn = (st, recMs) => ((st?.chat?.prompt ?? 0) * PRICES.openai['gpt-4o'].input + (st?.chat?.completion ?? 0) * PRICES.openai['gpt-4o'].output + (st?.embedTokens ?? 0) * PRICES.openai['text-embedding-3-small'].input) / 1e6 + (recMs ? recMs / 60000 * PRICES.openai['whisper-1'].price : 0);

  async function attempt(s, turnId) {
    // 1. A fresh thread through the app's own control.
    await page.evaluate(() => { location.hash = '#/app/chat'; });
    const nc = page.getByRole('button', { name: 'New conversation' });
    await nc.waitFor({ timeout: 20000 });
    await nc.click();
    await sleep(400);
    await page.evaluate(() => { location.hash = '#/app/voice'; });
    const talk = page.locator('button[aria-label="Tap to talk"]');
    await talk.waitFor({ timeout: 20000 });
    await unityReady();
    const histBefore = await page.evaluate(() => { try { return (JSON.parse(localStorage.getItem('dg_history') || '[]') || []).length; } catch { return -1; } });
    // 2. Condition and clip.
    const live = await page.evaluate((on) => window.__e4b.setLive(on), s.cond === 'P');
    const clip = clips[s.q.id];
    await page.evaluate(async (b64) => { window.__e4b.reset(); return window.__e4b.loadClip(b64); }, clip.b64);
    const wait = lastEnd + PACE_MS - Date.now();
    if (wait > 0) await sleep(wait);
    const srvTurn = server.beginTurn(turnId);
    const startedAt = new Date().toISOString();
    // 3. Tap to talk; the synthetic microphone starts the clip.
    const box = await talk.boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.click(cx, cy);
    const tCap = await (await page.waitForFunction(() => window.__e4b.tCap, null, { timeout: 10000, polling: 20 })).jsonValue();
    const finish = page.locator('button[aria-label="Tap when finished"]');
    await finish.waitFor({ timeout: 10000 });
    // The listening layout moves the mic button (a label pill appears under
    // it), so aim at where it is now, not where "Tap to talk" was.
    await sleep(600);
    const box2 = await finish.boundingBox();
    const sx = box2.x + box2.width / 2, sy = box2.y + box2.height / 2;
    // 4. Tap when finished at the clip's end (300 ms after the end of speech).
    //    Press/release go straight to CDP; tapLag (learned over the first
    //    turns) absorbs the dispatch delay so the click lands on target.
    await page.mouse.move(sx, sy);
    const pnow = await page.evaluate(() => performance.now());
    await sleep(Math.max(0, tCap + clip.ms - pnow - tapLag));
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sx, y: sy, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: sx, y: sy, button: 'left', clickCount: 1 });
    // 5. Wait for first audio, then for the turn to finish (idle again).
    const t5 = Date.now();
    let gotAudio = false;
    while (Date.now() - t5 < 30000 && !abortReason) {
      gotAudio = await page.evaluate(() => {
        const ev = window.__e4b.events;
        const stop = ev.find((e) => e[1] === 'click' && e[2] && e[2].label === 'Tap when finished');
        return Boolean(stop && ev.some((e) => e[1] === 'src.start' && e[2].at >= stop[0]));
      });
      if (gotAudio) break;
      await sleep(100);
    }
    await page.locator('button[aria-label="Tap to talk"]').waitFor({ timeout: 90000 }).catch(() => {});
    await sleep(300);
    const data = await page.evaluate(async () => ({
      events: window.__e4b.events, resources: window.__e4b.resources(), rec: await window.__e4b.recordingBase64(), recMime: window.__e4b.recMime,
      histAfter: (() => { try { return (JSON.parse(localStorage.getItem('dg_history') || '[]') || []).length; } catch { return -1; } })(),
    }));
    server.endTurn();
    lastEnd = Date.now();
    mkdirSync(resolve(CACHE, 'turns'), { recursive: true });
    writeFileSync(resolve(CACHE, 'turns', `${PILOT ? 'pilot' : TAG}_${turnId}_${s.cond}_${s.q.id}.json`), JSON.stringify({ events: data.events, resources: data.resources, server: { ...srvTurn, firstDone: undefined, resolveFirst: undefined }, clickAim: { start: [cx, cy], stop: [sx, sy] }, tCapNode: tCap }, null, 1));
    const p = parseTurn(data, srvTurn, clip, s.cond);
    if (p.tTap != null && p.tCap != null) {
      const err = p.tTap - (p.tCap + clip.ms);
      tapLag = Math.min(Math.max(tapLag + 0.6 * err, 0), 250);
    }
    const recA = analyseRecording(data.rec, data.recMime, `${TAG}_${turnId}`);
    const expectOnset = p.mrStarted != null && p.tCap != null ? p.tCap + 300 - p.mrStarted : null;
    const expectEnd = p.mrStarted != null && p.tEos != null ? p.tEos - p.mrStarted : null;
    p.row.align_onset_err_ms = num(recA?.onset != null && expectOnset != null ? recA.onset - expectOnset : null);
    p.row.align_end_err_ms = num(recA?.speechEnd != null && expectEnd != null ? recA.speechEnd - expectEnd : null);
    p.row.recording_ms = num(recA?.dur);
    p.row.history_before = histBefore;
    p.row.history_after = data.histAfter;
    p.row.transcript_wer = p.transcript ? wer(questionText(s.q, 'v2'), p.transcript).wer.toFixed(3) : '';
    const notes = validate(p, srvTurn, s.cond, live, { before: histBefore });
    openaiUsd += priceTurn(srvTurn, s.cond === 'F' || p.sttSource === 'whisper-rescue' ? recA?.dur : 0);
    return { p, notes, startedAt, clip, srvTurn, degraded: p.degraded };
  }

  for (const s of schedule) {
    if (abortReason || pilotLeft <= 0) break;
    turnNo++;
    const notes = [];
    let row = null;
    for (let a = 1; a <= MAX_ATTEMPTS && !row && !abortReason && pilotLeft > 0; a++) {
      pilotLeft--;
      const turnId = `${turnNo}${a > 1 ? `r${a}` : ''}`;
      let r;
      try { r = await attempt(s, turnId); } catch (e) { r = { error: String(e.message ?? e).replace(/\s+/g, ' ').slice(0, 160) }; server.endTurn(); lastEnd = Date.now(); }
      const bad = r.error ? [r.error] : r.notes;
      if (!bad.length) {
        row = { turn: turnNo, phase: PILOT ? 'pilot' : s.phase, condition: s.cond, question_id: s.q.id, repeat: s.rep, item: s.index, slot: s.slot, started_at: r.startedAt, attempts: a, clip_ms: num(r.clip.ms), clip_sha256: r.clip.sha, ...r.p.row, failed_attempt_notes: notes.join(' | ') };
        break;
      }
      notes.push(`a${a}: ${bad.join('; ')}`);
      console.warn(`  ${s.cond} ${s.q.id}#${s.rep} attempt ${a}: ${bad.join('; ')}`);
      if (r.degraded) { console.warn('  sticky degrade fired — reloading the page session'); await openApp(); }
      if (a < MAX_ATTEMPTS) await sleep(5000 * a);
      if (a === MAX_ATTEMPTS) row = { turn: turnNo, phase: PILOT ? 'pilot' : s.phase, condition: s.cond, question_id: s.q.id, repeat: s.rep, item: s.index, slot: s.slot, started_at: new Date().toISOString(), attempts: a, clip_ms: num(clips[s.q.id].ms), clip_sha256: clips[s.q.id].sha, failed_attempt_notes: notes.join(' | ') };
    }
    if (!row) break;
    rows.push(row);
    appendFileSync(RAW, COLS.map((c) => csvEscape(row[c] ?? '')).join(',') + '\n');
    console.log(`${String(turnNo).padStart(3)} ${row.phase.padEnd(8)} ${s.cond} ${s.q.id.padEnd(4)}#${s.rep} ` + (row.h1_ms !== undefined && row.h1_ms !== ''
      ? `H1=${row.h1_ms} H2=${row.h2_ms} tap+${row.tap_delay_ms} stt=${row.app_stt_ms} rag=${row.app_rag_ms} ttft=${row.app_llm_to_token_ms} sent=${row.app_first_sentence_ms} tts=${row.app_tts_first_ms} dec=${row.decode_to_start_ms} spec=${row.spec_status} align=${row.align_onset_err_ms} wer=${row.transcript_wer}`
      : `FAILED ${row.failed_attempt_notes}`) + ` (tapLag ${Math.round(tapLag)})`);
    const elUnits = server.stats.totals.elevenChars * ELEVEN_UNITS_PER_CHAR;
    if (openaiUsd >= SPEND_CAP_OPENAI) abortReason = `OpenAI spend guard (US$${openaiUsd.toFixed(2)})`;
    if (elUnits >= ELEVEN_UNITS_CAP) abortReason = `ElevenLabs guard (${elUnits.toFixed(0)} units est.)`;
  }

  // Wrap up.
  const kbEnd = PILOT ? null : await kbFingerprint().catch((e) => ({ error: e.message }));
  const meterAfter = await elevenMeter();
  await browser.close().catch(() => {});
  try { chrome.kill('SIGKILL'); } catch { /* gone */ }
  await sleep(1500);
  watchdog.stop();
  await server.close();
  try { rmSync(udd, { recursive: true, force: true }); } catch { /* temp */ }
  meta.finishedAt = new Date().toISOString();
  meta.abortReason = abortReason;
  meta.violations = violations;
  const others = Object.entries(watchdog.seen.others).map(([k, v]) => `${k} ×${v}`).join(', ');
  meta.watchdog = (watchdog.seen.trips.length ? `**TRIPPED** ${watchdog.seen.trips.length}× (${watchdog.seen.trips.join('; ')})` : `no real-microphone access request by the harness Chrome (${watchdog.seen.preflight} status-only preflights)`) + (others ? `; other apps' microphone use, ignored: ${others}` : '');
  meta.adminStub = `${server.stats.totals.adminCalls} calls, all \`bump_study_usage\` answered locally${violations.some((v) => /admin stub/.test(v)) ? '; **refused calls present**' : ''}`;
  meta.blockedCount = blockedCount;
  meta.supabaseAudit = Object.entries(audit).map(([k, v]) => `${k} ×${v}`).join(', ') || 'none';
  meta.historyCheck = rows.filter((r) => r.phase === 'measured').every((r) => r.history_before === '' || Number(r.history_before) === 0) ? '0 messages in every kept turn' : 'see raw CSV';
  meta.serverTotals = server.stats.totals;
  meta.spend = { openaiUsdHarnessEstimate: +openaiUsd.toFixed(4), elevenMeter: meterBefore && meterAfter ? `${meterBefore.used} → ${meterAfter.used} units of ${meterAfter.limit} (${meterAfter.used - meterBefore.used} used; tier ${meterAfter.tier})` : 'unavailable', meterBefore, meterAfter };
  if (!PILOT) {
    meta.kb.end = kbEnd;
    const same = kbStart && kbEnd && !kbEnd.error && kbStart.idsContentHashSha256 === kbEnd.idsContentHashSha256 && kbStart.contentSha256 === kbEnd.contentSha256 && kbStart.embeddingSha256 === kbEnd.embeddingSha256;
    const vs = kbStart?.vsSeptember;
    meta.kb.summary = `${same ? 'unchanged during the run' : '**changed or unreadable during the run**'}; ${vs ? (vs.identical ? 'identical to September' : `${vs.added.length} added (${vs.added.join(', ')}), ${vs.removed.length} removed, ${vs.changed.length} changed`) : '—'}`;
  }
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  const md = summarise(parseCsv(readFileSync(RAW, 'utf8')), meta);
  writeFileSync(`${base}.md`, md);
  console.log('\n' + md);
  console.log(`Wrote ${base}.md, ${RAW}, ${metaPath}${abortReason ? `\nSTOPPED: ${abortReason}` : ''}`);
  if (abortReason) process.exitCode = 2;
}
main().catch((e) => { console.error(e); process.exit(1); });
