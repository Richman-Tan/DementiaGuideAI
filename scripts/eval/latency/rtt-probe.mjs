#!/usr/bin/env node
// E4-B context probe (not pre-specified): unauthenticated HTTPS round trip to each
// provider every 30 s while a run is in progress; one JSON line per probe.
//   node scripts/eval/latency/rtt-probe.mjs <supabase-url> > <log.jsonl>
import { performance } from 'node:perf_hooks';
const urls = { openai: 'https://api.openai.com/v1/models', eleven: 'https://api.elevenlabs.io/v1/models', supabase: process.argv[2] + '/rest/v1/' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (;;) {
  const row = { at: new Date().toISOString() };
  for (const [k, u] of Object.entries(urls)) {
    const t = [];
    for (let i = 0; i < 3; i++) { const s = performance.now(); try { const r = await fetch(u); await r.arrayBuffer(); } catch { /* ignore */ } t.push(performance.now() - s); }
    t.sort((a, b) => a - b); row[k] = Math.round(t[1]);
  }
  console.log(JSON.stringify(row));
  await sleep(30000);
}
