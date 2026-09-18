// Retrieval RPC under concurrency (E11 §4.2 item 1).
//
// One query embedding is computed up front (a single OpenAI embeddings call),
// then N concurrent workers call Supabase `match_chunks` through PostgREST with
// the anon key — exactly the request the web and mobile clients make — for T
// seconds per stage. Read-only, no OpenAI spend beyond that one call.
//
//   node scripts/eval/load/rpc-load.mjs --stages 1,5,10,25,50 --seconds 30 --note "mac wifi"
//   node scripts/eval/load/rpc-load.mjs --stages 1 --seconds 5           # smoke
//
// A hard cap on total requests (--max-requests, default 5000) is asserted in the
// worker loop: no stage can push past it whatever the timings.
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  ROOT, SUPABASE_URL, SUPABASE_ANON_KEY, embed, gitSha, requireEnv, csvEscape,
} from '../lib.mjs';
import { TOP_K, MIN_SIMILARITY, RETRIEVAL_OVERSAMPLE } from '../../../packages/core/rag/ragConfig.js';
import statsLib from '../lib/stats.js';

const { quantile, mean } = statsLib;

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};
const STAGES = opt('stages', '1,5,10,25,50').split(',').map(Number).filter(n => n > 0);
const SECONDS = Number(opt('seconds', '30'));
const MAX_REQUESTS = Number(opt('max-requests', '5000'));
const NOTE = opt('note', '');
const QUESTION = opt('question', 'My mum keeps getting up at night and wandering around the house, what can I do?');
const TAG = opt('tag', new Date().toISOString().slice(0, 10));

requireEnv({ openai: true, supabase: true });

const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

const records = []; // { stage, worker, t_start_ms, ms, status, rows }
let total = 0;

async function oneCall(body) {
  const t0 = performance.now();
  let status = 0, rows = -1;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_chunks`, { method: 'POST', headers, body });
    status = r.status;
    const text = await r.text();
    if (r.ok) { try { rows = JSON.parse(text).length; } catch { rows = -1; } }
  } catch {
    status = -1; // network / abort
  }
  return { ms: performance.now() - t0, status, rows };
}

async function runStage(concurrency, seconds, body) {
  const deadline = performance.now() + seconds * 1000;
  const stageStart = performance.now();
  const workers = Array.from({ length: concurrency }, async (_, w) => {
    while (performance.now() < deadline) {
      if (total >= MAX_REQUESTS) return; // hard cap, checked before every request
      total += 1;
      const tStart = performance.now() - stageStart;
      const r = await oneCall(body);
      records.push({ stage: concurrency, worker: w, t_start_ms: tStart, ...r });
    }
  });
  await Promise.all(workers);
  return performance.now() - stageStart;
}

function summarise(stage, wallMs) {
  const rs = records.filter(r => r.stage === stage);
  const ok = rs.filter(r => r.status === 200);
  const lat = ok.map(r => r.ms);
  return {
    stage,
    n: rs.length,
    ok: ok.length,
    errors: rs.length - ok.length,
    statuses: [...new Set(rs.map(r => r.status))].sort().join('/'),
    p50: quantile(lat, 0.5),
    p95: quantile(lat, 0.95),
    p99: quantile(lat, 0.99),
    mean: mean(lat),
    max: lat.length ? Math.max(...lat) : null,
    rps: rs.length / (wallMs / 1000),
    rows: ok.length ? mean(ok.map(r => r.rows)) : null,
  };
}

const fmt = (v, d = 0) => (v == null ? '—' : v.toFixed(d));

(async () => {
  console.log(`Embedding the fixed question once…`);
  const queryEmbedding = await embed(QUESTION);
  const body = JSON.stringify({
    query_embedding: queryEmbedding,
    query_text: QUESTION,
    match_count: TOP_K * RETRIEVAL_OVERSAMPLE,
    min_similarity: MIN_SIMILARITY,
  });

  const results = [];
  for (const c of STAGES) {
    if (total >= MAX_REQUESTS) { console.log(`cap ${MAX_REQUESTS} reached; skipping stage ${c}`); break; }
    process.stdout.write(`stage concurrency=${c} for ${SECONDS}s … `);
    const wall = await runStage(c, SECONDS, body);
    const s = summarise(c, wall);
    results.push(s);
    console.log(`n=${s.n} ok=${s.ok} p50=${fmt(s.p50)} p95=${fmt(s.p95)} p99=${fmt(s.p99)} rps=${fmt(s.rps, 1)}`);
    // Let the pooler settle between stages so one stage's tail does not bleed into the next.
    await new Promise(r => setTimeout(r, 2000));
  }

  const sha = gitSha();
  const outDir = resolve(ROOT, 'docs/report/eval/final');
  mkdirSync(outDir, { recursive: true });
  const base = `load_rpc_${sha}_${TAG}`;

  const csv = ['stage,worker,t_start_ms,ms,status,rows']
    .concat(records.map(r => [r.stage, r.worker, r.t_start_ms.toFixed(1), r.ms.toFixed(1), r.status, r.rows].map(csvEscape).join(',')))
    .join('\n');
  writeFileSync(resolve(outDir, `${base}_raw.csv`), csv);

  const md = `# Retrieval RPC under concurrency — ${sha} (${new Date().toISOString()})

**What was measured.** \`match_chunks\` via PostgREST with the anon key — the exact
request both clients make after embedding — called by N concurrent workers in a
closed loop for ${SECONDS} s per stage. One fixed query (embedding computed once);
\`match_count\` ${TOP_K * RETRIEVAL_OVERSAMPLE}, \`min_similarity\` ${MIN_SIMILARITY}. Latency is
client-observed round-trip from this machine${NOTE ? ` (${NOTE})` : ''}. Supabase plan: Free
(Nano compute, shared). Corpus: production \`knowledge_chunks\` (~450 rows,
ivfflat lists=10). Total requests ${total} (cap ${MAX_REQUESTS}).

**How to read it.** Latency includes network from a laptop; the difference between
stages, not the absolute p50, is the scalability signal. A flat p95 across stages
means the RPC is not the bottleneck at this corpus size; a rising p95 with falling
throughput means the shared compute or pooler is saturating.

| concurrency | requests | ok | errors | statuses | p50 ms | p95 ms | p99 ms | mean ms | max ms | req/s | rows/resp |
|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
${results.map(s => `| ${s.stage} | ${s.n} | ${s.ok} | ${s.errors} | ${s.statuses} | ${fmt(s.p50)} | ${fmt(s.p95)} | ${fmt(s.p99)} | ${fmt(s.mean)} | ${fmt(s.max)} | ${fmt(s.rps, 1)} | ${fmt(s.rows, 1)} |`).join('\n')}

Raw per-request records: \`${base}_raw.csv\`. Regenerate:
\`node scripts/eval/load/rpc-load.mjs --stages ${STAGES.join(',')} --seconds ${SECONDS}${NOTE ? ` --note "${NOTE}"` : ''}\`.
`;
  writeFileSync(resolve(outDir, `${base}.md`), md);
  console.log(md);
  console.log(`→ docs/report/eval/final/${base}.md`);
})();
