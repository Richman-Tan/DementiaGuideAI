#!/usr/bin/env node
/**
 * Parse captured `[LATENCY SUMMARY]` console lines into the latency table (Table 3).
 *
 * The voice pipeline logs one JSON summary per spoken response, e.g.:
 *   [LATENCY SUMMARY] {"stt_ms":812,"rag_ms":240,"llm_to_token_ms":430,...}
 * (emitted by src/features/voice/hooks/useAvatarConversation.js). Capture those lines to a file
 * — e.g. from the Metro/Expo console or a device log — then run this to get the
 * median and range per stage across all responses.
 *
 * Usage:
 *   node scripts/parse-latency.mjs path/to/console.log
 *   pbpaste | node scripts/parse-latency.mjs           # from clipboard / stdin
 *   node scripts/parse-latency.mjs log.txt --out docs/report/eval/final/latency_web_wifi.csv --group-by mode --raw-csv turns.csv
 *
 * Reports median, mean, p90, p95, sd and range per stage (n stated). Stages
 * present in the summaries but not in the Table 3 list (playback_wait_ms,
 * to_first_token_ms, turn_total_ms, ws_open_ms, tts_first_chunk_ms) are appended
 * automatically. --group-by splits the table by a summary field such as `mode`
 * (streaming | streaming-degraded | legacy) or a bench label.
 * Writes docs/report/latency_results.csv by default (override with --out).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { summary } = require('./eval/lib/stats.js');

const args = process.argv.slice(2);
const argVal = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const GROUP_BY = argVal('--group-by');
const OUT = argVal('--out');
const RAW_CSV = argVal('--raw-csv');

// stage key → human label (order = Table 3 order)
const STAGES = [
  ['stt_ms',            'Speech-to-text'],
  ['rag_ms',            'Retrieval'],
  ['llm_to_token_ms',   'LLM time to first token'],
  ['first_sentence_ms', 'First token → first sentence'],
  ['tts_first_ms',      'TTS request → first audio'],
  ['to_first_audio_ms', 'End to end → first avatar audio'],
];
const EXTRA_STAGES = [
  ['playback_wait_ms',   'Audio received → audible'],
  ['to_first_token_ms',  'End to end → first text token'],
  ['turn_total_ms',      'End to end → audio finished'],
  ['ws_open_ms',         'TTS WebSocket open'],
  ['tts_first_chunk_ms', 'TTS first streamed chunk'],
];

function readInput() {
  const flagArgs = new Set(['--group-by', '--out', '--raw-csv']);
  const arg = args.find((a, i) => !a.startsWith('--') && !flagArgs.has(args[i - 1]));
  if (arg) return readFileSync(arg, 'utf8');
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

const text = readInput();
if (!text.trim()) {
  console.error('No input. Pass a log file path or pipe log text via stdin.');
  process.exit(1);
}

// Pull the JSON object following each [LATENCY SUMMARY] marker.
const summaries = [];
for (const m of text.matchAll(/\[LATENCY SUMMARY\]\s*(\{[^\n}]*\})/g)) {
  try { summaries.push(JSON.parse(m[1])); } catch { /* skip malformed */ }
}
if (!summaries.length) {
  console.error('No [LATENCY SUMMARY] {...} lines found in the input.');
  process.exit(1);
}

const present = new Set(summaries.flatMap(s => Object.keys(s)));
const stages = [...STAGES, ...EXTRA_STAGES.filter(([k]) => present.has(k))];
const groups = GROUP_BY ? [...new Set(summaries.map(s => String(s[GROUP_BY] ?? 'unknown')))] : [null];

const csv = ['"Group","Stage","Median (ms)","Range (ms)","n","Mean (ms)","P90 (ms)","P95 (ms)","SD (ms)"'];
console.log(`Parsed ${summaries.length} latency summaries${GROUP_BY ? ` (grouped by ${GROUP_BY}: ${groups.join(', ')})` : ''}.\n`);
const f = (x) => (x == null ? '' : String(Math.round(x)));
for (const g of groups) {
  const subset = g == null ? summaries : summaries.filter(s => String(s[GROUP_BY] ?? 'unknown') === g);
  console.log(`${g == null ? '' : `[${GROUP_BY} = ${g}] `}Stage                              Median    Mean     p90     p95      SD   Range          n`);
  for (const [key, label] of stages) {
    const vals = subset.map(s => s[key]).filter(v => typeof v === 'number' && Number.isFinite(v));
    const st = summary(vals);
    const range = vals.length ? `${st.min} to ${st.max}` : '';
    csv.push([g ?? '', label, f(st.median), range, vals.length, f(st.mean), f(st.p90), f(st.p95), f(st.sd)].map(v => `"${v}"`).join(','));
    console.log(`${label.padEnd(34)} ${f(st.median).padStart(6)} ${f(st.mean).padStart(7)} ${f(st.p90).padStart(7)} ${f(st.p95).padStart(7)} ${f(st.sd).padStart(7)}   ${range.padEnd(14)} ${vals.length}`);
  }
  console.log('');
}

if (RAW_CSV) {
  const keys = [...new Set(summaries.flatMap(s => Object.keys(s)))];
  const raw = [keys.join(','), ...summaries.map(s => keys.map(k => (s[k] == null ? '' : JSON.stringify(s[k]).replace(/^"|"$/g, ''))).join(','))];
  writeFileSync(resolve(process.cwd(), RAW_CSV), raw.join('\n') + '\n');
  console.log(`Wrote raw turns to ${RAW_CSV}`);
}
const out = OUT ? resolve(process.cwd(), OUT) : resolve(ROOT, 'docs/report/latency_results.csv');
writeFileSync(out, csv.join('\n') + '\n');
console.log(`Wrote ${out}.`);
console.log('State n, device, network conditions, renderer and TTS mode alongside the numbers.');
