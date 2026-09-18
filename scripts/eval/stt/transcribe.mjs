#!/usr/bin/env node
// Transcribe the prepared DementiaBank/ADReSS chunks through the production
// speech-to-text call (E9). The request is byte-for-byte the fallback path the
// apps use — apps/api/api/transcribe.js:71-74 and the latency bench
// (scripts/eval/latency/bench-pipeline.mjs timedWhisper): `whisper-1`,
// `language: 'en'`, no prompt, default response format. Only --model and the
// optional --prompt vary that, and both are recorded in the output file name.
//
// Every response is cached by (model, prompt, file sha256) under
// data/dementiabank/cache/ so interrupted or repeated runs never re-bill.
// Audio and hypothesis text stay under data/dementiabank/ (git-ignored):
// only aggregate WER tables leave this directory (wer-report.mjs).
//
// Usage:
//   node scripts/eval/stt/transcribe.mjs --dry-run
//   node scripts/eval/stt/transcribe.mjs                                   # whisper-1 over references.csv
//   node scripts/eval/stt/transcribe.mjs --model gpt-4o-mini-transcribe
//   node scripts/eval/stt/transcribe.mjs --prompt "dementia, caregiver, Alzheimer's"   # writes hyps_<model>_prompt.csv
//   flags: --references <csv>  --out <csv>  --limit N  --concurrency 2  --pace-ms 200  --retries 6
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, basename, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

import { env, OPENAI_API_KEY, OPENAI_BASE, ROOT, requireEnv, csvEscape, sleep } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { parseCsv } = require('../lib/csv.js');

const args = process.argv.slice(2);
const has = (n) => args.includes(n);
const argVal = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };

const MODELS = new Set(['whisper-1', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe']);
// US$ per minute, OpenAI list price 2026-09 (cost estimate only; the report's
// cost model carries the dated pricing table).
const PRICE_PER_MIN = { 'whisper-1': 0.006, 'gpt-4o-transcribe': 0.006, 'gpt-4o-mini-transcribe': 0.003 };

const MODEL = argVal('--model') ?? 'whisper-1';
if (!MODELS.has(MODEL)) { console.error(`--model must be one of ${[...MODELS].join(', ')}`); process.exit(1); }
const PROMPT = argVal('--prompt');
const REFERENCES = resolve(ROOT, argVal('--references') ?? 'data/dementiabank/references.csv');
const DATA_DIR = resolve(ROOT, 'data/dementiabank');
const OUT = resolve(ROOT, argVal('--out') ?? `data/dementiabank/hyps_${MODEL}${PROMPT ? '_prompt' : ''}.csv`);
const LIMIT = argVal('--limit') ? Number(argVal('--limit')) : Infinity;
const CONCURRENCY = Math.max(1, Number(argVal('--concurrency') ?? 2));
const PACE_MS = Number(argVal('--pace-ms') ?? 200);
const RETRIES = Number(argVal('--retries') ?? 6);
const DRY_RUN = has('--dry-run');

function wavDurationSeconds(path) {
  // Minimal RIFF parser: enough for the PCM WAVs ADReSS ships and our cuts.
  try {
    const b = readFileSync(path);
    if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') return null;
    let off = 12, byteRate = null, dataLen = null;
    while (off + 8 <= b.length) {
      const id = b.toString('ascii', off, off + 4);
      const len = b.readUInt32LE(off + 4);
      if (id === 'fmt ') byteRate = b.readUInt32LE(off + 16);
      if (id === 'data') { dataLen = len; break; }
      off += 8 + len + (len % 2);
    }
    return byteRate && dataLen != null ? dataLen / byteRate : null;
  } catch { return null; }
}

function cachePath(bytes) {
  const key = createHash('sha256').update(MODEL).update('\0').update(PROMPT ?? '').update('\0').update(bytes).digest('hex');
  const dir = resolve(DATA_DIR, 'cache', MODEL + (PROMPT ? '_prompt' : ''));
  mkdirSync(dir, { recursive: true });
  return resolve(dir, `${key}.json`);
}

// The production call, verbatim from bench-pipeline.mjs timedWhisper, plus the
// two evaluation-only knobs.
async function transcribeOnce(path) {
  const bytes = readFileSync(path);
  const cp = cachePath(bytes);
  if (existsSync(cp)) return { ...JSON.parse(readFileSync(cp, 'utf8')), cached: true };
  const form = new FormData();
  form.append('file', new Blob([bytes]), basename(path));
  form.append('model', MODEL);
  form.append('language', 'en');
  if (PROMPT) form.append('prompt', PROMPT);
  const t0 = performance.now();
  const r = await fetch(`${OPENAI_BASE}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }, body: form });
  if (!r.ok) {
    const err = new Error(`${MODEL} ${r.status}: ${(await r.text()).slice(0, 200)}`);
    err.status = r.status;
    err.retryAfter = Number(r.headers.get('retry-after')) || null;
    throw err;
  }
  const j = await r.json();
  const out = { text: j.text ?? '', ms: Math.round(performance.now() - t0), model: MODEL, prompt: PROMPT ?? null, at: new Date().toISOString() };
  writeFileSync(cp, JSON.stringify(out));
  return { ...out, cached: false };
}

async function withRetry(fn, label) {
  let lastErr;
  for (let i = 0; i < RETRIES; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      const retryable = e.status === 429 || (e.status >= 500 && e.status < 600) || e.status == null;
      if (!retryable) throw e;
      const wait = e.retryAfter ? e.retryAfter * 1000 : Math.min(60000, 1000 * 2 ** i) + Math.random() * 500;
      console.warn(`  ${label}: ${e.message} — retry ${i + 1}/${RETRIES} in ${Math.round(wait)} ms`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

async function main() {
  if (!existsSync(REFERENCES)) { console.error(`references file not found: ${REFERENCES} (run prepare-adress.py first)`); process.exit(1); }
  const refs = parseCsv(readFileSync(REFERENCES, 'utf8')).slice(0, LIMIT);
  const files = refs.map(r => resolve(ROOT, r.chunk_path));
  const missing = files.filter(f => !existsSync(f));
  if (missing.length) { console.error(`${missing.length} audio files missing, e.g. ${missing[0]}`); process.exit(1); }

  const seconds = files.reduce((s, f) => s + (wavDurationSeconds(f) ?? Number(refs[files.indexOf(f)].duration_s) ?? 0), 0);
  const cachedN = files.filter(f => existsSync(cachePath(readFileSync(f)))).length;
  const toBill = seconds * (1 - cachedN / Math.max(1, files.length));
  console.log(`Transcribe — model ${MODEL}${PROMPT ? ` + prompt (${PROMPT.length} chars)` : ''}`);
  console.log(`  ${files.length} chunks, ${(seconds / 60).toFixed(1)} min audio, ${cachedN} already cached`);
  console.log(`  estimated cost ≈ US$${(toBill / 60 * PRICE_PER_MIN[MODEL]).toFixed(2)} at US$${PRICE_PER_MIN[MODEL]}/min; ~${Math.ceil((files.length - cachedN) / 50)} min at 50 req/min`);
  console.log(`  output ${OUT}`);
  if (DRY_RUN) return;
  requireEnv({ openai: true, supabase: false });

  const rows = new Array(refs.length);
  let next = 0, done = 0, billed = 0;
  async function worker() {
    while (next < refs.length) {
      const i = next++;
      const r = refs[i];
      const path = files[i];
      try {
        const t = await withRetry(() => transcribeOnce(path), r.chunk_path);
        if (!t.cached) { billed++; await sleep(PACE_MS); }
        rows[i] = { chunk_path: r.chunk_path, model: MODEL, prompt: PROMPT ?? '', hyp_text: t.text, ms: t.ms, cached: t.cached };
      } catch (e) {
        rows[i] = { chunk_path: r.chunk_path, model: MODEL, prompt: PROMPT ?? '', hyp_text: '', ms: '', cached: false, error: e.message };
        console.error(`  FAILED ${r.chunk_path}: ${e.message}`);
      }
      if (++done % 100 === 0 || done === refs.length) {
        console.log(`  ${done}/${refs.length} (${billed} billed)`);
        write(rows);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  write(rows);
  const failed = rows.filter(r => r?.error).length;
  console.log(`\nWrote ${OUT}: ${rows.length} rows, ${billed} new API calls, ${failed} failed${failed ? ' (re-run to retry; successes are cached)' : ''}`);
}

function write(rows) {
  const cols = ['chunk_path', 'model', 'prompt', 'hyp_text', 'ms', 'cached', 'error'];
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, [cols.join(','), ...rows.filter(Boolean).map(r => cols.map(c => csvEscape(r[c] ?? '')).join(','))].join('\n') + '\n');
}

main().catch(e => { console.error(e); process.exit(1); });
