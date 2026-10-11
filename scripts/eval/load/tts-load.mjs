#!/usr/bin/env node
// §19B P3 / E11-L (docs/eval/plan-19b-propagation.md §19B.3): ElevenLabs
// text-to-speech latency and errors under small concurrency, with the app's
// exact request shape (apps/api/api/eleven-tts.js, asserted from the source):
// REST /with-timestamps, eleven_turbo_v2_5, mp3_44100_64, the Aaron (Brian)
// voice, the proxy's voice settings and the web-default speed.
//
// A burst at level c starts c requests at the same instant. Levels are
// 1, 2, 4, 8, plus the plan's documented concurrency limit L when L < 8 and not
// already listed, so the run straddles L. Two passes (ascending, then
// descending), two bursts per level per pass: four bursts per level.
// Short fixed carer sentences, normalised as the app normalises spoken text.
// Hard character cap (default 7,500, under the 8,000 budget), checked before the
// first request. Audio is held in memory, never decoded, written or played.
//
//   node scripts/eval/load/tts-load.mjs --dry-run [--limit 5]
//   node scripts/eval/load/tts-load.mjs --meter            # read-only account check (tier, characters used)
//   node scripts/eval/load/tts-load.mjs --limit <L> [--tag mac-2026-10-09]
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import os from 'node:os';

import { ROOT, env, gitSha, csvEscape, sleep } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { summary } = require('../lib/stats.js');
const { loadModule } = require('../../../unity-avatar/tools/esm-loader.js');
const { normalizeSpokenText } = loadModule(resolve(ROOT, 'packages/core/tts/normalizeSpokenText.js'));

const args = process.argv.slice(2);
const has = (n) => args.includes(n);
const argVal = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };
const KEY = env.ELEVENLABS_API_KEY;
const CHAR_CAP = Number(argVal('--char-cap') ?? 7500);
const TAG = argVal('--tag') ?? `mac-${new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })}`;
const BURSTS_PER_PASS = 2, PAUSE_BURST_MS = 3000, PAUSE_LEVEL_MS = 8000;

// ── Request shape, read from the app and asserted ────────────────────────────
const proxySrc = readFileSync(resolve(ROOT, 'apps/api/api/eleven-tts.js'), 'utf8');
const MODEL_ID = /MODEL_ID\s*=\s*'([^']+)'/.exec(proxySrc)?.[1];
const FORMAT = /output_format:\s*'([^']+)'/.exec(proxySrc)?.[1];
const num = (k) => Number(new RegExp(`${k}:\\s*([0-9.]+)`).exec(proxySrc)?.[1]);
const profilesSrc = readFileSync(resolve(ROOT, 'apps/web/src/avatar/avatarProfiles.js'), 'utf8');
const VOICE = /elevenVoiceId:\s*'([^']+)'/.exec(profilesSrc.slice(profilesSrc.indexOf('aaron: {')))?.[1];
const SPEED = 0.78; // web default (SettingsContext voiceSpeed normal → speechRateFor), the proxy's default too
const VOICE_SETTINGS = { stability: num('stability'), similarity_boost: num('similarity_boost'), style: num('style'), speed: SPEED };
if (MODEL_ID !== 'eleven_turbo_v2_5' || FORMAT !== 'mp3_44100_64' || !VOICE || Object.values(VOICE_SETTINGS).some(x => !Number.isFinite(x))) {
  console.error('the TTS request shape read from apps/api/api/eleven-tts.js is not the one §19B.3 pre-registered'); process.exit(1);
}

// Short first-sentence-style lines (written for this test; not participant text).
const SENTENCES = [
  'Please call 111 now and stay with her until help arrives.',
  'A calm, quiet room in the evening can help him settle.',
  'Try offering small drinks often through the day.',
  'You can ring Alzheimers New Zealand on 0800 004 001.',
  'Keep a simple routine, with meals at the same times each day.',
  'Feeling tired is normal, and asking for help is a strength.',
  'Gentle music or a short walk may ease her restlessness.',
  'Ask her GP about a review of all her medicines.',
].map(s => normalizeSpokenText(s));

const PLAN_LIMITS = JSON.parse(readFileSync(resolve(ROOT, 'scripts/eval/pricing.2026-09.json'), 'utf8')).elevenlabs.plans;
const LIMIT = argVal('--limit') ? Number(argVal('--limit')) : null;
function levelsFor(L) {
  const base = [1, 2, 4, 8];
  return [...new Set([...base, ...(L && L < 8 ? [L] : [])])].sort((a, b) => a - b);
}
function schedule(L) {
  const lv = levelsFor(L);
  const passes = [lv, [...lv].reverse()];
  const out = []; let k = 0;
  passes.forEach((levels, pass) => levels.forEach(c => { for (let b = 0; b < BURSTS_PER_PASS; b++) out.push({ pass, level: c, burst: b, texts: Array.from({ length: c }, () => SENTENCES[k++ % SENTENCES.length]) }); }));
  return out;
}
const charsOf = (sched) => sched.reduce((s, b) => s + b.texts.reduce((t, x) => t + x.length, 0), 0);

async function meter() {
  const r = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': KEY } });
  if (!r.ok) throw new Error(`subscription read failed (${r.status})`);
  const d = await r.json();
  const pick = ['tier', 'status', 'character_count', 'character_limit', 'can_extend_character_limit', 'allowed_to_extend_character_limit', 'next_character_count_reset_unix', 'billing_period', 'character_refresh_period', 'currency'];
  const out = Object.fromEntries(pick.filter(k => k in d).map(k => [k, d[k]]));
  for (const [k, v] of Object.entries(d)) if (/concurr/i.test(k)) out[k] = v;
  return out;
}

async function one(text, t0Burst) {
  const t0 = performance.now();
  const row = { start_offset_ms: t0 - t0Burst, chars: text.length, status: null, error_code: '', headers_ms: null, first_byte_ms: null, complete_ms: null, bytes: 0, request_id: '' };
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOICE)}/with-timestamps`, {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: MODEL_ID, output_format: FORMAT, voice_settings: VOICE_SETTINGS }),
    });
    row.headers_ms = performance.now() - t0;
    row.status = r.status;
    row.request_id = r.headers.get('request-id') ?? r.headers.get('x-request-id') ?? '';
    const reader = r.body.getReader();
    const parts = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (row.first_byte_ms == null) row.first_byte_ms = performance.now() - t0;
      parts.push(value); row.bytes += value.length;
    }
    row.complete_ms = performance.now() - t0;
    const body = Buffer.concat(parts).toString('utf8');
    if (!r.ok) {
      try { const j = JSON.parse(body); row.error_code = j?.detail?.status ?? j?.detail?.code ?? String(j?.detail ?? '').slice(0, 60); } catch { row.error_code = body.slice(0, 60); }
    } else if (!/"audio_base64"/.test(body.slice(0, 64))) {
      row.error_code = 'missing audio_base64';
    }
    // The audio is dropped here: never decoded, written or played.
  } catch (e) {
    row.error_code = `network: ${String(e?.message ?? e).slice(0, 60)}`;
  }
  return row;
}

async function baselineRtt() {
  const t = [];
  for (let i = 0; i < 6; i++) { const s = performance.now(); try { const r = await fetch('https://api.elevenlabs.io/v1/models'); await r.arrayBuffer(); } catch { /* status irrelevant */ } t.push(performance.now() - s); await sleep(200); }
  return summary(t.slice(1)).median;
}

function summarise(rows, meta) {
  const f = (x) => (x == null || !Number.isFinite(x) ? '—' : Math.round(x).toLocaleString('en-NZ'));
  const md = [];
  md.push(`# ElevenLabs TTS under small concurrency — ${meta.tag} (${meta.sha})`, '');
  md.push(`Pre-registered in \`docs/eval/plan-19b-propagation.md\` §19B.3 (E11-L). Generated by \`scripts/eval/load/tts-load.mjs\`.`, '');
  md.push(`- When: ${meta.startedAt} → ${meta.finishedAt} (UTC); machine ${meta.machine}, Node ${meta.node}, network Wi-Fi; baseline HTTPS round trip to api.elevenlabs.io ${f(meta.rttMs)} ms.`);
  md.push(`- Account (read-only \`/v1/user/subscription\`): tier \`${meta.meterBefore?.tier ?? '?'}\`; documented TTS concurrency limit used, L = ${meta.limit} (${meta.limitSource}). Characters used this period: ${meta.meterBefore?.character_count ?? '?'} before, ${meta.meterAfter?.character_count ?? '?'} after (Δ ${meta.meterAfter && meta.meterBefore ? meta.meterAfter.character_count - meta.meterBefore.character_count : '?'}).`);
  md.push(`- Request, as the study proxy sends it (\`apps/api/api/eleven-tts.js\`): REST \`/v1/text-to-speech/{voice}/with-timestamps\`, \`${MODEL_ID}\`, \`${FORMAT}\`, voice ${VOICE} (Aaron / Brian), ${JSON.stringify(VOICE_SETTINGS)}. Straight from this Mac, not through the proxy. Audio held in memory and dropped; never decoded or played.`);
  md.push(`- Load: levels ${meta.levels.join(', ')}; a burst starts c requests at once; ${BURSTS_PER_PASS} bursts per level per pass, two passes (ascending, then descending), so 4 bursts per level; ${PAUSE_BURST_MS / 1000} s between bursts, ${PAUSE_LEVEL_MS / 1000} s between levels. ${rows.length} requests, ${meta.chars} characters sent (cap ${CHAR_CAP}). Spend: characters from the plan's credits (≈ US$${(meta.chars * 0.05 / 1000).toFixed(2)} at the pay-as-you-go Flash/Turbo list price of US$0.05 per 1,000, \`scripts/eval/pricing.2026-09.json\`).`);
  md.push(`- Regenerate: \`${meta.command}\`.`, '');
  md.push('| Level | Over L? | Requests | 2xx | 429 | Other errors | Error codes | TTFB (headers) median | p90 | max | First byte median | Complete median | p90 | max | Burst wall time median |', '|---:|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const c of meta.levels) {
    const rs = rows.filter(r => r.level === c);
    const ok = rs.filter(r => r.status >= 200 && r.status < 300 && !r.error_code);
    const n429 = rs.filter(r => r.status === 429).length;
    const other = rs.length - ok.length - n429;
    const codes = [...new Set(rs.filter(r => r.error_code).map(r => r.error_code))].join('; ');
    const h = summary(ok.map(r => r.headers_ms)), fb = summary(ok.map(r => r.first_byte_ms)), cp = summary(ok.map(r => r.complete_ms));
    const bursts = [...new Set(rs.map(r => `${r.pass}|${r.burst}`))].map(k => Math.max(...rs.filter(r => `${r.pass}|${r.burst}` === k).map(r => (r.start_offset_ms ?? 0) + (r.complete_ms ?? 0))));
    md.push(`| ${c} | ${c > meta.limit ? 'yes' : 'no'} | ${rs.length} | ${ok.length} | ${n429} | ${other} | ${codes || '—'} | ${f(h.median)} | ${f(h.p90)} | ${f(h.max)} | ${f(fb.median)} | ${f(cp.median)} | ${f(cp.p90)} | ${f(cp.max)} | ${f(summary(bursts).median)} |`);
  }
  md.push('', 'Times in ms, successful requests only; 429 and other errors are counted, not timed. TTFB = request sent → response headers; complete = full JSON received (the point the app can play the sentence). With n = 4 bursts per level these are descriptive; no test is run.', '');
  return md.join('\n');
}

async function main() {
  if (has('--meter')) {
    if (!KEY) { console.error('ELEVENLABS_API_KEY absent'); process.exit(1); }
    console.log(JSON.stringify(await meter(), null, 2));
    return;
  }
  const L = LIMIT;
  if (!L) { console.error('--limit <documented concurrency of the account tier> is required (read the tier with --meter; limits per tier in scripts/eval/pricing.2026-09.json)'); process.exit(1); }
  const sched = schedule(L);
  const chars = charsOf(sched);
  console.log(`Plan: levels ${levelsFor(L).join(', ')} (L = ${L}); ${sched.length} bursts, ${sched.reduce((s, b) => s + b.level, 0)} requests, ${chars} characters (cap ${CHAR_CAP}).`);
  if (chars > CHAR_CAP) { console.error('planned characters exceed the cap — not starting'); process.exit(1); }
  if (has('--dry-run')) { for (const s of SENTENCES) console.log(`  ${s.length} chars: ${s}`); return; }
  if (!KEY) { console.error('ELEVENLABS_API_KEY absent'); process.exit(1); }

  const sha = gitSha();
  const meta = { tag: TAG, sha, startedAt: new Date().toISOString(), machine: `${os.cpus()[0]?.model}, ${(os.totalmem() / 2 ** 30).toFixed(0)} GB`, node: process.version, command: `node scripts/eval/load/tts-load.mjs ${args.join(' ')}`, limit: L, levels: levelsFor(L) };
  meta.meterBefore = await meter();
  const tier = String(meta.meterBefore.tier ?? '').toLowerCase();
  meta.limitSource = PLAN_LIMITS[tier] ? `tier "${tier}" → ${PLAN_LIMITS[tier].tts_concurrency} in scripts/eval/pricing.2026-09.json` : `passed with --limit; tier "${tier}" not in the documented table`;
  if (PLAN_LIMITS[tier] && PLAN_LIMITS[tier].tts_concurrency !== L) console.warn(`warning: --limit ${L} differs from the documented ${PLAN_LIMITS[tier].tts_concurrency} for tier ${tier}`);
  meta.rttMs = await baselineRtt();
  // Warm-up: one request at level 1, discarded (TLS and DNS).
  const warm = await one(SENTENCES[0], performance.now());
  let sent = warm.chars;
  const rows = [];
  let prevLevel = null;
  for (const b of sched) {
    if (prevLevel != null) await sleep(b.level === prevLevel ? PAUSE_BURST_MS : PAUSE_LEVEL_MS);
    prevLevel = b.level;
    if (sent + b.texts.reduce((s, t) => s + t.length, 0) > CHAR_CAP) { console.error('character cap reached — stopping'); break; }
    const t0 = performance.now();
    const res = await Promise.all(b.texts.map(t => one(t, t0)));
    sent += b.texts.reduce((s, t) => s + t.length, 0);
    res.forEach((r, i) => rows.push({ pass: b.pass, level: b.level, burst: b.burst, slot: i, ...r }));
    console.log(`pass ${b.pass} level ${b.level} burst ${b.burst}: ${res.map(r => r.status === 200 ? Math.round(r.headers_ms) : `${r.status}${r.error_code ? `(${r.error_code})` : ''}`).join(' ')}`);
  }
  meta.finishedAt = new Date().toISOString();
  meta.chars = sent;
  meta.warmup = { status: warm.status, headers_ms: warm.headers_ms };
  meta.meterAfter = await meter();
  const dir = resolve(ROOT, 'docs/report/eval/final');
  mkdirSync(dir, { recursive: true });
  const stem = resolve(dir, `load_tts_${sha}_${TAG}`);
  const cols = ['pass', 'level', 'burst', 'slot', 'start_offset_ms', 'chars', 'status', 'error_code', 'headers_ms', 'first_byte_ms', 'complete_ms', 'bytes', 'request_id'];
  writeFileSync(`${stem}_raw.csv`, [cols.join(','), ...rows.map(r => cols.map(c => csvEscape(typeof r[c] === 'number' ? Number(r[c].toFixed(1)) : r[c])).join(','))].join('\n') + '\n');
  writeFileSync(`${stem}_meta.json`, JSON.stringify(meta, null, 2) + '\n');
  const md = summarise(rows, meta);
  writeFileSync(`${stem}.md`, md + '\n');
  console.log('\n' + md);
  console.log(`Wrote ${relative(ROOT, stem)}{.md,_raw.csv,_meta.json}`);
}

main().catch(e => { console.error(e); process.exit(1); });
