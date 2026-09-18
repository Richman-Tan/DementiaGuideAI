// Study proxy + meter overhead under concurrency (E11 §4.2 item 2).
//
// Hits the deployed `dementiaguide-api` `/api/embed` route — the cheapest
// metered endpoint — with a 5-word input, N concurrent workers, T seconds per
// stage. Every request passes through `_lib/guard.js` (CORS, access-code check,
// and the per-code daily meter `bump_study_usage`, which updates ONE Postgres
// row per request), so the latency difference between concurrency stages is the
// proxy + meter overhead, not OpenAI's. Each call embeds ~5 tokens
// (~US$0.0000001) and consumes one unit of the shared daily request pool.
//
// Bounded by design: a hard cap on total requests (--max-requests, default 600,
// and the script refuses anything above 600) is asserted before every request.
//
//   node scripts/eval/load/proxy-load.mjs --stages 1,10,25 --seconds 8 --dry-run
//   node scripts/eval/load/proxy-load.mjs --stages 1,10,25 --seconds 8 --note "mac wifi"
//
// Credentials: the study access code and allowed origin are read from
// apps/api/.env.production.pull (a `vercel env pull` of the API project) or from
// STUDY_ACCESS_CODES / ALLOWED_ORIGINS in the environment. They are never printed.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { ROOT, gitSha, csvEscape } from '../lib.mjs';
import statsLib from '../lib/stats.js';

const { quantile, mean } = statsLib;

const HARD_CAP = 600;
const args = process.argv.slice(2);
const has = (name) => args.includes(`--${name}`);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};
const STAGES = opt('stages', '1,10,25').split(',').map(Number).filter(n => n > 0);
const SECONDS = Number(opt('seconds', '8'));
const MAX_REQUESTS = Math.min(HARD_CAP, Number(opt('max-requests', String(HARD_CAP))));
const NOTE = opt('note', '');
const BASE = opt('base', 'https://dementiaguide-api.vercel.app');
const DRY = has('dry-run');
const TAG = opt('tag', new Date().toISOString().slice(0, 10));

function loadEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const apiEnv = { ...loadEnvFile(resolve(ROOT, 'apps/api/.env.production.pull')), ...loadEnvFile(resolve(ROOT, 'apps/api/.env')), ...process.env };
const CODE = (apiEnv.STUDY_ACCESS_CODES || '').split(',').map(s => s.trim()).filter(Boolean)[0];
const ORIGIN = (apiEnv.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)[0];

if (!CODE) {
  console.error('No study access code available locally (STUDY_ACCESS_CODES). Not running.');
  process.exit(DRY ? 0 : 1);
}
// The Origin header only matters to a browser (CORS is enforced client-side);
// guard() does not refuse its absence, so a server-side run is valid without it.
console.log(`credentials: code present (${CODE.length} chars), origin ${ORIGIN ? 'present' : 'absent (sent without Origin)'}; base ${BASE}`);

const body = JSON.stringify({ model: 'text-embedding-3-small', input: 'sleep problems at night dementia' });
const headers = { 'Content-Type': 'application/json', 'x-study-code': CODE, ...(ORIGIN ? { Origin: ORIGIN } : {}) };

const records = [];
let total = 0;

async function oneCall() {
  const t0 = performance.now();
  let status = 0;
  try {
    const r = await fetch(`${BASE}/api/embed`, { method: 'POST', headers, body });
    status = r.status;
    await r.text();
  } catch {
    status = -1;
  }
  return { ms: performance.now() - t0, status };
}

async function runStage(concurrency, seconds) {
  const deadline = performance.now() + seconds * 1000;
  const stageStart = performance.now();
  const workers = Array.from({ length: concurrency }, async (_, w) => {
    while (performance.now() < deadline) {
      if (total >= MAX_REQUESTS) return; // hard cap, checked before every request
      total += 1;
      const tStart = performance.now() - stageStart;
      const r = await oneCall();
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
    stage, n: rs.length, ok: ok.length,
    s429: rs.filter(r => r.status === 429).length,
    other: rs.filter(r => r.status !== 200 && r.status !== 429).length,
    statuses: [...new Set(rs.map(r => r.status))].sort().join('/'),
    p50: quantile(lat, 0.5), p95: quantile(lat, 0.95), p99: quantile(lat, 0.99), mean: mean(lat),
    max: lat.length ? Math.max(...lat) : null,
    rps: rs.length / (wallMs / 1000),
  };
}
const fmt = (v, d = 0) => (v == null ? '—' : v.toFixed(d));

(async () => {
  if (DRY) {
    console.log(`dry run: would run stages ${STAGES.join(',')} × ${SECONDS}s against ${BASE}/api/embed, cap ${MAX_REQUESTS} requests. Nothing sent.`);
    return;
  }
  // Warm the function once so the first stage does not carry the cold start
  // (the web client does the same via warmStudyProxy()).
  const warm = await oneCall();
  console.log(`warm-up: ${warm.status} in ${warm.ms.toFixed(0)} ms`);
  total += 1;

  const results = [];
  for (const c of STAGES) {
    if (total >= MAX_REQUESTS) { console.log(`cap ${MAX_REQUESTS} reached; skipping stage ${c}`); break; }
    process.stdout.write(`stage concurrency=${c} for ${SECONDS}s … `);
    const wall = await runStage(c, SECONDS);
    const s = summarise(c, wall);
    results.push(s);
    console.log(`n=${s.n} ok=${s.ok} 429=${s.s429} p50=${fmt(s.p50)} p95=${fmt(s.p95)} rps=${fmt(s.rps, 1)}`);
    await new Promise(r => setTimeout(r, 2000));
  }

  const sha = gitSha();
  const outDir = resolve(ROOT, 'docs/report/eval/final');
  mkdirSync(outDir, { recursive: true });
  const base = `load_proxy_${sha}_${TAG}`;
  writeFileSync(resolve(outDir, `${base}_raw.csv`), ['stage,worker,t_start_ms,ms,status']
    .concat(records.map(r => [r.stage, r.worker, r.t_start_ms.toFixed(1), r.ms.toFixed(1), r.status].map(csvEscape).join(','))).join('\n'));

  const md = `# Study proxy + meter under concurrency — ${sha} (${new Date().toISOString()})

**What was measured.** \`POST /api/embed\` on the deployed API project
(\`${BASE}\`), a 5-word input, N concurrent workers in a closed loop for ${SECONDS} s
per stage, after one warm-up call. Every request runs the full guard: CORS
allowlist, access-code check, and \`bump_study_usage\` (one atomic Postgres row
update per request, the per-code daily meter) before the ~5-token OpenAI
embedding call. Client-observed round-trip from this machine${NOTE ? ` (${NOTE})` : ''}.
Total requests ${total} of a hard cap of ${MAX_REQUESTS} (the study's daily pool is
4,000 per code; this run consumed ${total} of it on ${new Date().toISOString().slice(0, 10)}).

**How to read it.** The embed call itself is constant across stages, so a rising
p95 with concurrency is the Vercel function + guard + single-row meter cost. 429s
would mean the daily meter tripped (none expected at this volume).

| concurrency | requests | ok | 429 | other | statuses | p50 ms | p95 ms | p99 ms | mean ms | max ms | req/s |
|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|
${results.map(s => `| ${s.stage} | ${s.n} | ${s.ok} | ${s.s429} | ${s.other} | ${s.statuses} | ${fmt(s.p50)} | ${fmt(s.p95)} | ${fmt(s.p99)} | ${fmt(s.mean)} | ${fmt(s.max)} | ${fmt(s.rps, 1)} |`).join('\n')}

Raw per-request records: \`${base}_raw.csv\`. Regenerate:
\`node scripts/eval/load/proxy-load.mjs --stages ${STAGES.join(',')} --seconds ${SECONDS}${NOTE ? ` --note "${NOTE}"` : ''}\`.
`;
  writeFileSync(resolve(outDir, `${base}.md`), md);
  console.log(md);
  console.log(`→ docs/report/eval/final/${base}.md`);
})();
