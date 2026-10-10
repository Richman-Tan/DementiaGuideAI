#!/usr/bin/env node
// E9-A (docs/eval/evaluation-plan.md §18.3): transcribe the prepared
// DementiaBank/ADReSS utterance cuts with Apple's speech recogniser, ON-DEVICE
// ONLY, and write the same hypothesis-CSV contract as transcribe.mjs /
// transcribe-local.py so scripts/eval/stt/wer-report.mjs scores it unchanged.
//
// Governance: the audio never leaves this machine. The Swift tool
// (apple-ondevice/AppleOnDeviceSTT.swift) sets requiresOnDeviceRecognition =
// true on every request and refuses to start unless the recogniser supports
// on-device recognition for the locale. Nothing is played. Hypotheses and the
// per-file cache stay under data/dementiabank/ (git-ignored); only wer-report
// aggregates are committed.
//
// Usage:
//   node scripts/eval/stt/transcribe-apple.mjs --dry-run
//   node scripts/eval/stt/transcribe-apple.mjs [--locale en-NZ] [--limit N]
//   flags: --root <repo root holding data/dementiabank> (default: this checkout)
//          --references <csv>  --out <csv>  --batch 100
// Output: data/dementiabank/hyps_apple-ondevice-<locale>.csv (model column
// "apple-ondevice:<locale>"), cached per file under
// data/dementiabank/cache/apple-ondevice-<locale>/ so re-runs are free.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';

import { ROOT, csvEscape } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { parseCsv } = require('../lib/csv.js');

const args = process.argv.slice(2);
const has = (n) => args.includes(n);
const argVal = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };

const LOCALE = argVal('--locale') ?? 'en-NZ';
const DATA_ROOT = resolve(argVal('--root') ?? ROOT);
const REFERENCES = resolve(DATA_ROOT, argVal('--references') ?? 'data/dementiabank/references.csv');
const DATA_DIR = resolve(DATA_ROOT, 'data/dementiabank');
const TAG = `apple-ondevice-${LOCALE}`;
const MODEL_LABEL = `apple-ondevice:${LOCALE}`;
const OUT = resolve(DATA_ROOT, argVal('--out') ?? `data/dementiabank/hyps_${TAG}.csv`);
const CACHE_DIR = resolve(DATA_DIR, 'cache', TAG);
const LIMIT = argVal('--limit') ? Number(argVal('--limit')) : Infinity;
const BATCH = Number(argVal('--batch') ?? 100);
const DRY_RUN = has('--dry-run');
const TOOL_VERSION = 'apple-ondevice-stt 1';

const SRC_DIR = resolve(ROOT, 'scripts/eval/stt/apple-ondevice');
const BIN_DIR = resolve(ROOT, '.cache/eval/apple-ondevice');
const BIN = resolve(BIN_DIR, 'apple-ondevice-stt');

function build() {
  const src = resolve(SRC_DIR, 'AppleOnDeviceSTT.swift');
  const plist = resolve(SRC_DIR, 'Info.plist');
  if (existsSync(BIN) && statSync(BIN).mtimeMs > Math.max(statSync(src).mtimeMs, statSync(plist).mtimeMs)) return;
  mkdirSync(BIN_DIR, { recursive: true });
  console.log('building the Swift tool …');
  execFileSync('swiftc', ['-O', src, '-o', BIN, '-Xlinker', '-sectcreate', '-Xlinker', '__TEXT', '-Xlinker', '__info_plist', '-Xlinker', plist], { stdio: 'inherit' });
}

const cacheKey = (bytes) => createHash('sha256').update(TOOL_VERSION).update('\0').update(LOCALE).update('\0').update(bytes).digest('hex');
const cacheFile = (key) => resolve(CACHE_DIR, `${key}.json`);

// Runs the Swift tool over a batch of absolute paths; resolves to the parsed
// JSON lines (meta first). The tool exits non-zero on any governance guard.
function runTool(paths) {
  return new Promise((res, rej) => {
    const listFile = resolve(BIN_DIR, `list-${process.pid}.txt`);
    writeFileSync(listFile, paths.join('\n') + '\n');
    const child = spawn(BIN, ['--locale', LOCALE, '--list', listFile], { stdio: ['ignore', 'pipe', 'pipe'] });
    const lines = [];
    let stderr = '';
    createInterface({ input: child.stdout }).on('line', (l) => { try { lines.push(JSON.parse(l)); } catch { /* ignore */ } });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      if (code !== 0) rej(new Error(`apple-ondevice-stt exited ${code}: ${stderr.trim().split('\n').filter(l => !/^\d{4}-\d\d-\d\d /.test(l)).slice(-3).join(' | ')}`));
      else res(lines);
    });
  });
}

function writeCsv(rows) {
  const cols = ['chunk_path', 'model', 'prompt', 'hyp_text', 'ms', 'cached', 'error'];
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, [cols.join(','), ...rows.filter(Boolean).map(r => cols.map(c => csvEscape(r[c] ?? '')).join(','))].join('\n') + '\n');
}

async function main() {
  if (!existsSync(REFERENCES)) { console.error(`references not found: ${REFERENCES}`); process.exit(1); }
  const refs = parseCsv(readFileSync(REFERENCES, 'utf8')).slice(0, LIMIT);
  const files = refs.map(r => resolve(DATA_ROOT, r.chunk_path));
  const missing = files.filter(f => !existsSync(f));
  if (missing.length) { console.error(`${missing.length} audio files missing, e.g. ${missing[0]}`); process.exit(1); }
  const keys = files.map(f => cacheKey(readFileSync(f)));
  const todo = refs.map((r, i) => i).filter(i => !existsSync(cacheFile(keys[i])));
  const seconds = refs.reduce((s, r) => s + (Number(r.duration_s) || 0), 0);
  console.log(`Apple on-device recogniser — locale ${LOCALE}, ${refs.length} chunks (${(seconds / 60).toFixed(1)} min audio), ${refs.length - todo.length} cached, ${todo.length} to run`);
  console.log(`  output ${OUT}`);
  if (DRY_RUN) return;
  build();
  mkdirSync(CACHE_DIR, { recursive: true });

  let meta = null;
  const t0 = Date.now();
  for (let pass = 0; pass < 2; pass++) {
    // Pass 0 runs everything uncached; pass 1 retries files whose result was a
    // genuine error (not "no speech"), once, as §18.3 fixes in advance.
    const pending = pass === 0 ? todo : refs.map((r, i) => i).filter(i => {
      const c = existsSync(cacheFile(keys[i])) ? JSON.parse(readFileSync(cacheFile(keys[i]), 'utf8')) : null;
      return c && c.error && !c.retried;
    });
    if (!pending.length) continue;
    if (pass === 1) console.log(`retrying ${pending.length} errored file(s) once`);
    for (let b = 0; b < pending.length; b += BATCH) {
      const idx = pending.slice(b, b + BATCH);
      const lines = await runTool(idx.map(i => files[i]));
      meta = lines.find(l => l.meta)?.meta ?? meta;
      if (!meta || meta.requiresOnDeviceRecognition !== true || meta.supportsOnDeviceRecognition !== true) throw new Error('tool did not confirm on-device recognition — aborting');
      const byPath = new Map(lines.filter(l => l.path).map(l => [l.path, l]));
      for (const i of idx) {
        const l = byPath.get(files[i]);
        const rec = l
          ? { text: l.text ?? '', ms: l.ms ?? null, noSpeech: !!l.noSpeech, error: l.error ?? null, domain: l.domain ?? null, code: l.code ?? null }
          : { text: '', ms: null, noSpeech: false, error: 'no output line from tool' };
        writeFileSync(cacheFile(keys[i]), JSON.stringify({ ...rec, locale: LOCALE, tool: TOOL_VERSION, os: meta.os, retried: pass === 1, at: new Date().toISOString() }));
      }
      const done = Math.min(b + BATCH, pending.length);
      const el = (Date.now() - t0) / 1000;
      console.log(`  pass ${pass}: ${done}/${pending.length}  (${el.toFixed(0)} s elapsed)`);
    }
  }

  const rows = refs.map((r, i) => {
    const c = JSON.parse(readFileSync(cacheFile(keys[i]), 'utf8'));
    return { chunk_path: r.chunk_path, model: MODEL_LABEL, prompt: '', hyp_text: c.text, ms: c.ms ?? '', cached: true, error: c.error ?? '' };
  });
  writeCsv(rows);
  const errors = rows.filter(r => r.error).length;
  const noSpeech = refs.filter((r, i) => JSON.parse(readFileSync(cacheFile(keys[i]), 'utf8')).noSpeech).length;
  console.log(`\nWrote ${OUT}: ${rows.length} rows, ${noSpeech} "no speech" (scored as empty), ${errors} errors left missing`);
}

main().catch(e => { console.error(e.message ?? e); process.exit(1); });
