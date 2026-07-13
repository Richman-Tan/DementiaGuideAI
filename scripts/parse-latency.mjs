#!/usr/bin/env node
/**
 * Parse captured `[LATENCY SUMMARY]` console lines into the latency table (Table 3).
 *
 * The voice pipeline logs one JSON summary per spoken response, e.g.:
 *   [LATENCY SUMMARY] {"stt_ms":812,"rag_ms":240,"llm_to_token_ms":430,...}
 * (emitted by src/hooks/useAvatarConversation.js). Capture those lines to a file
 * — e.g. from the Metro/Expo console or a device log — then run this to get the
 * median and range per stage across all responses.
 *
 * Usage:
 *   node scripts/parse-latency.mjs path/to/console.log
 *   pbpaste | node scripts/parse-latency.mjs           # from clipboard / stdin
 *
 * Writes docs/report/latency_results.csv (matches Table 3) and prints a summary.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// stage key → human label (order = Table 3 order)
const STAGES = [
  ['stt_ms',            'Speech-to-text'],
  ['rag_ms',            'Retrieval'],
  ['llm_to_token_ms',   'LLM time to first token'],
  ['first_sentence_ms', 'First token → first sentence'],
  ['tts_first_ms',      'TTS request → first audio'],
  ['to_first_audio_ms', 'End to end → first avatar audio'],
];

function readInput() {
  const arg = process.argv[2];
  if (arg) return readFileSync(arg, 'utf8');
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
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

const csv = ['"Stage","Median (ms)","Range (ms)","n"'];
console.log(`Parsed ${summaries.length} latency summaries.\n`);
console.log('Stage                              Median   Range          n');
for (const [key, label] of STAGES) {
  const vals = summaries.map(s => s[key]).filter(v => typeof v === 'number');
  const med = median(vals);
  const range = vals.length ? `${Math.min(...vals)} to ${Math.max(...vals)}` : '';
  csv.push(`"${label}","${med ?? ''}","${range}","${vals.length}"`);
  console.log(`${label.padEnd(34)} ${String(med ?? '—').padStart(6)}   ${range.padEnd(14)} ${vals.length}`);
}

const out = resolve(ROOT, 'docs/report/latency_results.csv');
writeFileSync(out, csv.join('\n') + '\n');
console.log(`\nWrote ${out} — paste these into Table 3 (report §4.2).`);
console.log('State n, device, and network conditions alongside the numbers.');
