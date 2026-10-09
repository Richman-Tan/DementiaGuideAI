#!/usr/bin/env node
// §19B P4 (docs/eval/plan-19b-propagation.md §19B.4): E4-S repeated on several
// days — per-day medians and p90 of every stage and milestone, the spread of
// the per-day medians (max − min), a seeded bootstrap CI for each day's median,
// the share of turns over 3 s, and the day-by-day verdicts D1–D3. Deterministic;
// no network. Reads the committed bench-spoken.mjs raw CSVs.
//
//   node scripts/eval/latency/compare-days.mjs \
//        --run 2026-10-09=docs/report/eval/latency/spoken-bench_3ec1cc0_mac-2026-10-09-tts_raw.csv \
//        --run 2026-10-10=docs/report/eval/latency/spoken-bench_<sha>_mac-2026-10-10-tts_raw.csv \
//        --run 2026-10-11=docs/report/eval/latency/spoken-bench_<sha>_mac-2026-10-11-tts_raw.csv \
//        [--out docs/report/eval/latency/spoken-bench_days_<tag>.md]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createRequire } from 'node:module';

import { ROOT, gitSha } from '../lib.mjs';

const require = createRequire(import.meta.url);
const { parseCsv } = require('../lib/csv.js');
const { summary, median, bootstrapCI } = require('../lib/stats.js');

const args = process.argv.slice(2);
const runs = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--run') { const [day, path] = args[i + 1].split('='); runs.push({ day, path }); }
const outArg = (() => { const i = args.indexOf('--out'); return i === -1 ? null : args[i + 1]; })();
if (runs.length < 2) { console.error('give at least two --run <day>=<raw csv>'); process.exit(1); }

const STAGES = [
  ['stt_ms', 'Speech-to-text, whisper-1 upload'], ['embed_ms', 'Query embedding'], ['rpc_ms', 'Retrieval RPC'],
  ['llm_ttft_ms', 'LLM request → first token'], ['tts_first_byte_ms', 'TTS request → first audio byte'],
  ['to_first_tts_request_ms', 'End of speech → first sentence ready'], ['to_first_audio_byte_ms', '**End of speech → first audio byte (headline)**'],
  ['to_first_audio_playable_ms', 'End of speech → first audio playable'],
];
const f = (x) => (x == null || !Number.isFinite(x) ? '—' : Math.round(x).toLocaleString('en-NZ'));

const data = runs.map(r => {
  const rows = parseCsv(readFileSync(resolve(ROOT, r.path), 'utf8')).filter(x => x.phase === 'measured' && x.stt_ms !== '');
  return { ...r, rows, startedAt: rows[0]?.started_at, finishedAt: rows[rows.length - 1]?.started_at };
});
const col = (d, k) => d.rows.filter(x => x[k] !== '' && x[k] != null).map(x => Number(x[k])).filter(Number.isFinite);

const md = [];
md.push(`# E4-S across days — per-day medians and spread`, '');
md.push(`Pre-registered in \`docs/eval/plan-19b-propagation.md\` §19B.4. Generated ${new Date().toISOString()} at \`${gitSha()}\` by \`scripts/eval/latency/compare-days.mjs\`. **Headless pipeline, not perceived in-browser latency.**`, '');
md.push(`Regenerate: \`node scripts/eval/latency/compare-days.mjs ${args.join(' ')}\`. No API call; spend for each day is in that run's own report.`, '');
md.push('| Day (NZDT) | Raw file | Measured turns | First turn (UTC) | Last turn (UTC) |', '|---|---|---:|---|---|');
for (const d of data) md.push(`| ${d.day} | \`${d.path.replace(/^.*\//, '')}\` | ${d.rows.length} | ${d.startedAt ?? '—'} | ${d.finishedAt ?? '—'} |`);
md.push('');
md.push(`| Stage or milestone (ms) | ${data.map(d => `${d.day} median [95 % CI]`).join(' | ')} | ${data.map(d => `${d.day} p90`).join(' | ')} | Spread of medians (max − min) |`);
md.push(`|---|${data.map(() => '---:').join('|')}|${data.map(() => '---:').join('|')}|---:|`);
const meds = {};
for (const [k, label] of STAGES) {
  const per = data.map(d => { const xs = col(d, k); return { xs, med: xs.length ? median(xs) : null, ci: xs.length ? bootstrapCI(xs, median, { iters: 10000, seed: 42 }) : null, p90: xs.length ? summary(xs).p90 : null }; });
  meds[k] = per.map(p => p.med);
  const valid = per.map(p => p.med).filter(x => x != null);
  md.push(`| ${label} | ${per.map(p => (p.med == null ? '—' : `${f(p.med)} [${f(p.ci.lo)}–${f(p.ci.hi)}]`)).join(' | ')} | ${per.map(p => f(p.p90)).join(' | ')} | ${valid.length >= 2 ? f(Math.max(...valid) - Math.min(...valid)) : '—'} |`);
}
md.push('');
md.push('Share of turns over 3,000 ms:', '');
md.push(`| Milestone | ${data.map(d => d.day).join(' | ')} |`, `|---|${data.map(() => '---:').join('|')}|`);
for (const k of ['to_first_tts_request_ms', 'to_first_audio_byte_ms']) md.push(`| ${k} | ${data.map(d => { const xs = col(d, k); return xs.length ? `${xs.filter(x => x > 3000).length} / ${xs.length}` : '—'; }).join(' | ')} |`);
md.push('');
// Verdicts D1–D3 (plan §19B.4)
const tts = data.map((d, i) => meds.to_first_audio_byte_ms[i]);
const d1 = tts.every(x => x != null && x > 3000);
const tv = tts.filter(x => x != null);
const spread = tv.length >= 2 ? Math.max(...tv) - Math.min(...tv) : null;
const d3 = data.map(d => {
  const stages = ['stt_ms', 'embed_ms', 'rpc_ms', 'llm_ttft_ms'];
  const m = Object.fromEntries(stages.map(k => [k, median(col(d, k))]));
  return Object.entries(m).sort((a, b) => b[1] - a[1])[0][0] === 'stt_ms';
});
md.push('| # | Expectation (plan §19B.4) | Result | Verdict |', '|---|---|---|---|');
md.push(`| D1 | L3 holds on every day: median first audio byte > 3,000 ms | ${tts.map((x, i) => `${data[i].day} ${f(x)}`).join('; ')} | ${d1 ? '**Supported**' : '**Not supported**'} |`);
md.push(`| D2 | The spread of the per-day median first audio byte is ≤ 1,000 ms | ${f(spread)} ms over ${tv.length} days | ${spread != null && spread <= 1000 ? '**Supported**' : '**Not supported**'} |`);
md.push(`| D3 | L1 holds on every day: whisper-1 is the largest median stage before the first token | ${d3.map((x, i) => `${data[i].day} ${x ? 'yes' : 'no'}`).join('; ')} | ${d3.every(Boolean) ? '**Supported**' : '**Not supported**'} |`);
md.push('');
md.push('Days are compared descriptively; no test is run (one 12-minute window per day, one machine, one network). The CI is a bootstrap over that day\'s turns and does not cover day-to-day variation, which is what the spread shows.');

const out = resolve(ROOT, outArg ?? `docs/report/eval/latency/spoken-bench_days_${gitSha()}.md`);
writeFileSync(out, md.join('\n') + '\n');
console.log(md.join('\n'));
console.log(`\nWrote ${relative(ROOT, out)}`);
