#!/usr/bin/env node
// §19B P2 (docs/eval/plan-19b-propagation.md §19B.2): sentence-level citation
// support. For each sentence of the seeded generation answers that carries an
// inline [S#] marker, and each passage it cites, a checker model decides
// whether the passage supports the sentence (supported / partial /
// not_supported, with a one-sentence reason). The checker is validated against
// the author's labels on a blinded sample before any per-condition rate may be
// reported; until then, or if the gate fails, only the POOLED rate is written.
//
// Steps (each deterministic except `judge`):
//   extract   pairs from generation_8a92ecd_{v2,v2-nosafety,v2_oracle}_final.json + the
//             stratified validation sample (no network)
//   passages  fetch the cited chunks from Supabase (read-only GET) into the git-ignored
//             .cache/eval/citation-support/, checking each content_hash against the frozen
//             docs/report/kb_chunks_reference.csv
//   judge     the checker over every pair (claude-sonnet-5-5); resumable; spend-capped
//   sheet     the blinded validation sheet (CSV + HTML + HOW-TO) for the author, outside the repo
//   report    pooled results; with --labels <author csv> also the validation gate, and
//             per-condition rates ONLY when the gate passes
//
//   node scripts/eval/citation-support.mjs extract
//   node scripts/eval/citation-support.mjs passages
//   node scripts/eval/citation-support.mjs judge --dry-run | judge [--limit N] [--concurrency 6]
//   node scripts/eval/citation-support.mjs sheet [--sheet-dir ~/Downloads/DementiaGuide-human-tests/citation-check]
//   node scripts/eval/citation-support.mjs report [--labels <returned csv>]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import os from 'node:os';

import { ROOT, SUPABASE_URL, SUPABASE_ANON_KEY, requireEnv, csvEscape, gitSha } from './lib.mjs';
import { judgeCall, judgeCostEstimateUSD, parseJsonObject } from './lib/judgeClient.mjs';

const require = createRequire(import.meta.url);
const { pairsForRow, normaliseLabel, gateStats, LABELS } = require('./lib/citationPairs.js');
const { seededShuffle, mulberry32, quantile } = require('./lib/stats.js');
const { parseCsv } = require('./lib/csv.js');

const args = process.argv.slice(2);
const cmd = args[0];
const has = (n) => args.includes(n);
const argVal = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };

const MODEL = argVal('--model') ?? 'claude-sonnet-5-5';
const EFFORT = argVal('--effort') ?? 'medium';
const SPEND_CAP_USD = Number(argVal('--spend-cap') ?? 8);
const SEED = 42;
const SAMPLE_PER_CONDITION = { v2: 14, 'v2-nosafety': 13, 'v2-oracle': 13 };
const SOURCES = [
  { condition: 'v2', file: 'docs/report/eval/generation_8a92ecd_v2_final.json' },
  { condition: 'v2-nosafety', file: 'docs/report/eval/generation_8a92ecd_v2-nosafety_final.json' },
  { condition: 'v2-oracle', file: 'docs/report/eval/generation_8a92ecd_v2_oracle_final.json' },
];
const FINAL = resolve(ROOT, 'docs/report/eval/final');
const PAIRS = resolve(FINAL, 'citation-pairs_s19b.json');
const KEY = resolve(FINAL, 'citation-check_KEY_s19b.csv');
const CACHE = resolve(ROOT, '.cache/eval/citation-support');
const PASSAGES = resolve(CACHE, 'passages.json');
const JUDGED = resolve(FINAL, `citation-support_${MODEL}_s19b.json`);
const SHEET_DIR = resolve((argVal('--sheet-dir') ?? '~/Downloads/DementiaGuide-human-tests/citation-check').replace(/^~/, os.homedir()));
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));

// ── The checker's instructions (also shown to the author, word for word) ────
const RUBRIC = `Decide whether the CITED PASSAGE supports the SENTENCE.
- supported: everything the sentence claims or recommends is stated in the passage or follows directly from it.
- partial: the passage supports part of the sentence, but the sentence also contains a claim, detail, number, name or piece of advice that the passage does not contain.
- not_supported: the passage does not support the sentence's main claim or advice, or contradicts it; or the sentence makes no claim the passage could support.
Judge only against the passage, never against your own knowledge: a true statement that the passage does not contain is not supported by it. Sympathy, encouragement and connecting phrases ("Here are some strategies") are not claims; judge the substantive content. The question and the previous sentence are context only.`;
const SYSTEM = `You check citations in answers written by a dementia-care assistant for family carers in New Zealand. Each answer cites reference passages with markers such as [S1]. You see one sentence (with its markers removed) and one passage it cites.

${RUBRIC}

Reply with JSON only: {"verdict": "supported" | "partial" | "not_supported", "reason": "<one sentence naming the claim that decided it>"}`;
const userPrompt = (p, passage) => `QUESTION THE CARER ASKED (context):
${p.question}

PREVIOUS SENTENCE OF THE ANSWER (context, not judged):
${p.contextBefore || '(none — this is the first sentence)'}

SENTENCE TO JUDGE:
${p.sentence}

CITED PASSAGE:
${passage.title}${passage.source_org ? ` — ${passage.source_org}` : ''}
${passage.content}`;

// ── extract ──────────────────────────────────────────────────────────────────
function extract() {
  const pairs = [], skipped = { hallucinated: 0, injected: 0 }, sources = {};
  for (const s of SOURCES) {
    const raw = readFileSync(resolve(ROOT, s.file), 'utf8');
    const run = JSON.parse(raw);
    sources[s.file] = { sha256: sha256(raw), condition: s.condition, gitSha: run.gitSha, model: run.model, temperature: run.temperature, seed: run.seed, rows: run.rows.length };
    for (const row of run.rows) {
      const r = pairsForRow(row, s.condition);
      pairs.push(...r.pairs); skipped.hallucinated += r.skipped.hallucinated; skipped.injected += r.skipped.injected;
    }
  }
  // Validation sample: stratified by condition, seeded, then one seeded order.
  const sample = [];
  SOURCES.forEach((s, k) => {
    const pool = pairs.filter(p => p.condition === s.condition);
    sample.push(...seededShuffle(pool, SEED + k).slice(0, SAMPLE_PER_CONDITION[s.condition]));
  });
  const ordered = seededShuffle(sample, SEED).map((p, i) => ({ item: `C${String(i + 1).padStart(2, '0')}`, pairId: p.pairId, condition: p.condition }));
  mkdirSync(FINAL, { recursive: true });
  writeFileSync(PAIRS, JSON.stringify({
    generatedAt: new Date().toISOString(), gitSha: gitSha(), generator: 'scripts/eval/citation-support.mjs extract', plan: 'docs/eval/plan-19b-propagation.md §19B.2',
    sources, skipped, n: pairs.length,
    perCondition: Object.fromEntries(SOURCES.map(s => [s.condition, pairs.filter(p => p.condition === s.condition).length])),
    validationSample: { seed: SEED, perCondition: SAMPLE_PER_CONDITION, items: ordered.map(o => o.item + ' ' + o.pairId) },
    pairs,
  }, null, 2) + '\n');
  writeFileSync(KEY, ['item,pair_id,condition', ...ordered.map(o => [o.item, o.pairId, o.condition].map(csvEscape).join(','))].join('\n') + '\n');
  console.log(`Wrote ${relative(ROOT, PAIRS)} (${pairs.length} pairs; skipped ${JSON.stringify(skipped)}) and ${relative(ROOT, KEY)} (${ordered.length} sampled pairs)`);
}

// ── passages ─────────────────────────────────────────────────────────────────
async function passages() {
  requireEnv({ openai: false });
  const { pairs } = load(PAIRS);
  const ids = [...new Set(pairs.map(p => p.chunkId))].sort();
  const ref = Object.fromEntries(parseCsv(readFileSync(resolve(ROOT, 'docs/report/kb_chunks_reference.csv'), 'utf8')).map(r => [r.id, r.content_hash]));
  const out = {};
  for (let i = 0; i < ids.length; i += 40) {
    const list = ids.slice(i, i + 40).map(id => `"${id}"`).join(',');
    const r = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_chunks?id=in.(${encodeURIComponent(list)})&select=id,title,content,source_org,content_hash`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (!r.ok) throw new Error(`chunk fetch failed (${r.status})`);
    for (const row of await r.json()) {
      // Plan §19B.2 clarification: a chunk with no content_hash recorded on either side (every
      // iSupport chunk) cannot be checked — 'unrecorded', kept and flagged. Only a recorded
      // hash that differs (or is recorded on one side only) counts as 'changed' and is excluded.
      const frozen = ref[row.id] || null, live = row.content_hash || null;
      const hashStatus = !frozen && !live ? 'unrecorded' : frozen === live ? 'verified' : 'changed';
      out[row.id] = { ...row, frozenHash: frozen, hashStatus, contentSha256: sha256(row.content ?? '') };
    }
  }
  const missing = ids.filter(id => !out[id]);
  const by = (st) => ids.filter(id => out[id]?.hashStatus === st);
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(PASSAGES, JSON.stringify({ fetchedAt: new Date().toISOString(), n: ids.length, missing, changed: by('changed'), unrecorded: by('unrecorded'), passages: out }, null, 2));
  // Committed record of what the checker saw: ids, hash status and a sha256 of each passage text (no text).
  writeFileSync(resolve(FINAL, 'citation-passages_s19b.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), snapshot: 'docs/report/kb_chunks_reference.csv', chunks: Object.fromEntries(ids.filter(id => out[id]).map(id => [id, { hashStatus: out[id].hashStatus, contentSha256: out[id].contentSha256 }])) }, null, 2) + '\n');
  console.log(`Fetched ${Object.keys(out).length}/${ids.length} cited chunks into ${relative(ROOT, PASSAGES)} (git-ignored): hash verified ${by('verified').length}, no hash recorded on either side ${by('unrecorded').length}, changed ${by('changed').length}${by('changed').length ? ` (${by('changed').join(', ')})` : ''}; missing ${missing.length}`);
}

// ── judge ────────────────────────────────────────────────────────────────────
async function judge() {
  const { pairs } = load(PAIRS);
  const P = existsSync(PASSAGES) ? load(PASSAGES).passages : null;
  const usable = pairs.filter(p => P?.[p.chunkId] && P[p.chunkId].hashStatus !== 'changed');
  const LIMIT = argVal('--limit') ? Number(argVal('--limit')) : Infinity;
  if (has('--dry-run')) {
    const sample = (P ? usable : pairs).slice(0, 50);
    const avgChars = sample.reduce((s, p) => s + SYSTEM.length + (P ? userPrompt(p, P[p.chunkId]).length : 2400), 0) / Math.max(1, sample.length);
    const inTok = Math.round(avgChars / 3.6);
    console.log(`Dry run: ${pairs.length} pairs (${P ? `${usable.length} usable, ${usable.filter(p => P[p.chunkId].hashStatus === 'verified').length} of them hash-verified` : 'passages not fetched yet'}); ~${inTok} input tokens per call.`);
    console.log(`Estimated cost at ${MODEL} list price: US$${judgeCostEstimateUSD(MODEL, pairs.length, inTok, 350).toFixed(2)} (350 output tokens per call incl. thinking); spend cap US$${SPEND_CAP_USD}.`);
    return;
  }
  if (!P) { console.error('run `passages` first'); process.exit(1); }
  requireEnv({ openai: false, supabase: false, anthropic: true });
  const prev = existsSync(JUDGED) ? load(JUDGED) : null;
  const done = new Map((prev?.rows ?? []).filter(r => r.verdict).map(r => [r.pairId, r]));
  const todo = usable.filter(p => !done.has(p.pairId)).slice(0, LIMIT);
  const rate = { 'claude-sonnet-5-5': [2, 10], 'claude-opus-5-5': [4, 20] }[MODEL] ?? [5, 25];
  let spend = (prev?.usage?.costUSD ?? 0), inTok = prev?.usage?.inputTokens ?? 0, outTok = prev?.usage?.outputTokens ?? 0;
  const rows = [...done.values()];
  const startedAt = prev?.startedAt ?? new Date().toISOString();
  const save = (partial) => writeFileSync(JUDGED, JSON.stringify({
    generatedAt: new Date().toISOString(), startedAt, gitSha: gitSha(), generator: 'scripts/eval/citation-support.mjs judge', plan: 'docs/eval/plan-19b-propagation.md §19B.2',
    model: MODEL, effort: EFFORT, fallbacks: 'default (server-side-fallback-2026-07-01)', temperature: 'not settable on this model (default)',
    priceUSDPerMTok: { input: rate[0], output: rate[1], checked: '2026-10-08 (plan §18.2)' },
    systemPromptSha256: sha256(SYSTEM), pairsFileSha256: sha256(readFileSync(PAIRS)),
    partial, usage: { inputTokens: inTok, outputTokens: outTok, costUSD: Number(spend.toFixed(4)) },
    excludedPairs: pairs.length - usable.length,
    rows: rows.sort((a, b) => a.pairId.localeCompare(b.pairId)),
  }, null, 2) + '\n');
  console.log(`Judging ${todo.length} pairs with ${MODEL} (effort ${EFFORT}); ${done.size} already done; spend so far US$${spend.toFixed(3)}`);
  const CONC = Number(argVal('--concurrency') ?? 6);
  let next = 0, sinceSave = 0, stopped = false;
  async function worker() {
    while (!stopped && next < todo.length) {
      const p = todo[next++];
      let res, err = null;
      try { res = await judgeCall(MODEL, SYSTEM, userPrompt(p, P[p.chunkId]), { effort: EFFORT, maxTokens: 2000 }); }
      catch (e) { err = String(e?.message ?? e).slice(0, 200); }
      const u = res?.usage ?? {};
      const i = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), o = u.output_tokens ?? 0;
      inTok += i; outTok += o; spend += (i * rate[0] + o * rate[1]) / 1e6;
      const parsed = res?.text ? parseJsonObject(res.text) : null;
      const verdict = parsed ? normaliseLabel(parsed.verdict) : null;
      rows.push({ pairId: p.pairId, condition: p.condition, qid: p.qid, set: p.set, sentenceIndex: p.sentenceIndex, marker: p.marker, chunkId: p.chunkId,
        hashStatus: P[p.chunkId].hashStatus, verdict: verdict ?? null, reason: parsed?.reason ?? null, refused: res?.refused ?? false,
        error: err ?? (res && !res.refused && !verdict ? `unparsed: ${String(res?.text).slice(0, 120)}` : null),
        servedBy: res?.model ?? null, stopReason: res?.stopReason ?? null, inputTokens: i, outputTokens: o });
      if (++sinceSave >= 20) { save(true); sinceSave = 0; process.stdout.write(`  ${rows.length}/${usable.length} judged, US$${spend.toFixed(3)}\n`); }
      if (spend >= SPEND_CAP_USD) { stopped = true; console.error(`spend cap US$${SPEND_CAP_USD} reached — stopping`); }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  save(stopped || rows.length < usable.length);
  const c = (v) => rows.filter(r => r.verdict === v).length;
  console.log(`Wrote ${relative(ROOT, JUDGED)}: ${rows.length} rows — supported ${c('supported')}, partial ${c('partial')}, not_supported ${c('not_supported')}, unscored ${rows.filter(r => !r.verdict).length}; ${inTok} in / ${outTok} out tokens, US$${spend.toFixed(3)}`);
}

// ── sheet ────────────────────────────────────────────────────────────────────
function sheet() {
  const { pairs } = load(PAIRS);
  const P = load(PASSAGES).passages;
  const byId = Object.fromEntries(pairs.map(p => [p.pairId, p]));
  const key = parseCsv(readFileSync(KEY, 'utf8'));
  const items = key.map(k => { const p = byId[k.pair_id]; const ps = P[p.chunkId]; return { item: k.item, question: p.question, contextBefore: p.contextBefore, sentence: p.sentence, passageTitle: `${ps.title}${ps.source_org ? ` — ${ps.source_org}` : ''}`, passage: ps.content }; });
  // Blinding guard: no condition id, prompt version or file name may appear in the sheet.
  const blob = JSON.stringify(items);
  for (const banned of ['v2-nosafety', 'v2-oracle', 'nosafety', 'generation_8a92ecd', '8a92ecd', 'pairId', '"condition"']) {
    if (blob.includes(banned)) { console.error(`blinding check failed: "${banned}" appears in the sheet content`); process.exit(1); }
  }
  mkdirSync(SHEET_DIR, { recursive: true });
  writeFileSync(resolve(SHEET_DIR, 'citation-check_sheet.csv'), ['item,label,note,question,previous_sentence,sentence,passage_title,passage',
    ...items.map(it => [it.item, '', '', it.question, it.contextBefore, it.sentence, it.passageTitle, it.passage].map(csvEscape).join(','))].join('\n') + '\n');
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Citation check</title>
<style>:root{--bg:#fbfaf7;--fg:#1d1d1b;--muted:#5d5b55;--card:#fff;--line:#e3e0d8;--accent:#2f5d50}
@media (prefers-color-scheme:dark){:root{--bg:#171715;--fg:#ecebe6;--muted:#a9a69d;--card:#211f1c;--line:#3a3833;--accent:#8fc1b0}}
body{background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;margin:0;padding:16px}main{max-width:820px;margin:0 auto}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin:16px 0}.k{color:var(--muted);font-size:13px;text-transform:uppercase;letter-spacing:.04em;margin-top:10px}
.s{font-weight:600;border-left:3px solid var(--accent);padding-left:10px}.p{white-space:pre-wrap;font-size:15px;max-height:320px;overflow:auto;border:1px solid var(--line);padding:8px;border-radius:6px}
label{margin-right:16px;display:inline-block;padding:6px 0}textarea{width:100%;box-sizing:border-box;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:6px}
button{background:var(--accent);color:var(--bg);border:0;border-radius:8px;padding:10px 16px;font-size:16px;cursor:pointer}#status{color:var(--muted);margin-left:12px}</style></head><body><main>
<h1>Citation check — ${items.length} pairs</h1><p>For each pair, read the sentence and the passage it cites, then choose one label. Rules:</p><pre style="white-space:pre-wrap">${esc(RUBRIC)}</pre>
<p>Your choices are kept in this browser as you go. When every pair has a label, press <b>Download CSV</b> and send the file back.</p>
${items.map(it => `<section class="card" data-item="${it.item}"><h2>${it.item}</h2><div class="k">Question</div><div>${esc(it.question)}</div><div class="k">Previous sentence (context)</div><div>${esc(it.contextBefore || '(none)')}</div><div class="k">Sentence to judge</div><div class="s">${esc(it.sentence)}</div><div class="k">Cited passage: ${esc(it.passageTitle)}</div><div class="p">${esc(it.passage)}</div><div class="k">Label</div>
${LABELS.map(l => `<label><input type="radio" name="${it.item}" value="${l}"> ${l.replace('_', ' ')}</label>`).join('')}<div class="k">Note (optional)</div><textarea rows="2" name="${it.item}-note"></textarea></section>`).join('\n')}
<p><button id="dl">Download CSV</button><span id="status"></span></p></main>
<script>
const KEY='citation-check-s19b';let st={};try{st=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
document.querySelectorAll('section[data-item]').forEach(s=>{const it=s.dataset.item;const v=st[it]||{};if(v.label){const r=s.querySelector('input[value="'+v.label+'"]');if(r)r.checked=true}const t=s.querySelector('textarea');t.value=v.note||'';
s.addEventListener('change',()=>{const c=s.querySelector('input:checked');st[it]={label:c?c.value:'',note:t.value};try{localStorage.setItem(KEY,JSON.stringify(st))}catch(e){}upd()});t.addEventListener('input',()=>s.dispatchEvent(new Event('change')))});
function upd(){const n=Object.values(st).filter(v=>v.label).length;document.getElementById('status').textContent=n+' of ${items.length} labelled'}upd();
const q=v=>/[",\\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;
document.getElementById('dl').onclick=()=>{const rows=['item,label,note'];document.querySelectorAll('section[data-item]').forEach(s=>{const it=s.dataset.item;const v=st[it]||{};rows.push([it,v.label||'',v.note||''].map(q).join(','))});
const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([rows.join('\\n')+'\\n'],{type:'text/csv'}));a.download='citation-check_labels.csv';a.click()};
</script></body></html>`;
  writeFileSync(resolve(SHEET_DIR, 'citation-check.html'), html);
  writeFileSync(resolve(SHEET_DIR, 'HOW-TO.txt'), `CITATION CHECK — how to label (about 30 minutes)

What this is
  ${items.length} pairs, each one sentence from an answer the assistant gave and one reference passage
  that sentence cites. You decide whether the passage supports the sentence. Your labels decide
  whether an automatic checker can be trusted (plan docs/eval/plan-19b-propagation.md §19B.2).

How
  1. Open citation-check.html in a browser (double-click). Or use citation-check_sheet.csv in a
     spreadsheet: fill the "label" column only.
  2. For each pair choose ONE label: supported, partial, or not_supported (rules below).
     Work alone; do not look anything up; judge the passage as written.
  3. In the HTML page press "Download CSV" when all ${items.length} are labelled. Send back that file
     (citation-check_labels.csv), or the filled CSV, to the session that prepared it.
  4. Until you have sent it, do not open docs/report/eval/final/citation-support_* or
     citation-check_KEY_s19b.csv in the repository: they show the checker's verdicts and which
     version produced each answer.

Rules (the checker gets exactly the same words)
${RUBRIC.split('\n').map(l => '  ' + l).join('\n')}

Analysis once the file is back
  node scripts/eval/citation-support.mjs report --labels <path to the returned csv>
`);
  console.log(`Wrote the blinded sheet (${items.length} pairs) to ${SHEET_DIR}: citation-check.html, citation-check_sheet.csv, HOW-TO.txt`);
}

// ── report ───────────────────────────────────────────────────────────────────
function clusterBootstrap(rows, stat, { iters = 10000, seed = SEED } = {}) {
  const clusters = new Map();
  for (const r of rows) { const k = `${r.condition}|${r.qid}`; if (!clusters.has(k)) clusters.set(k, []); clusters.get(k).push(r); }
  const list = [...clusters.values()];
  const rnd = mulberry32(seed);
  const xs = [];
  for (let i = 0; i < iters; i++) { const s = []; for (let j = 0; j < list.length; j++) s.push(...list[Math.floor(rnd() * list.length)]); xs.push(stat(s)); }
  return { lo: quantile(xs, 0.025), hi: quantile(xs, 0.975), clusters: list.length };
}
function distribution(rows) {
  const n = rows.length; const share = (v) => (rows.filter(r => r.verdict === v).length / n);
  return Object.fromEntries(LABELS.map(v => [v, { k: rows.filter(r => r.verdict === v).length, p: share(v), ci: clusterBootstrap(rows, (s) => s.filter(r => r.verdict === v).length / s.length) }]));
}
function report() {
  const J = load(JUDGED);
  const scored = J.rows.filter(r => r.verdict);
  const md = [];
  const pc = (x) => `${(100 * x).toFixed(1)} %`;
  md.push('# §19B P2 — sentence-level citation support', '');
  md.push(`Pre-registered in \`docs/eval/plan-19b-propagation.md\` §19B.2. Generated ${new Date().toISOString()} by \`scripts/eval/citation-support.mjs report\`. Checker \`${J.model}\` (effort ${J.effort}, refusal fallback ${J.fallbacks}), run ${J.startedAt} → ${J.generatedAt} at \`${J.gitSha}\`; ${J.usage.inputTokens} input / ${J.usage.outputTokens} output tokens, **US$${J.usage.costUSD.toFixed(2)}** at US$${J.priceUSDPerMTok.input}/${J.priceUSDPerMTok.output} per 1M (${J.priceUSDPerMTok.checked}). Answers: the seeded \`generation_8a92ecd_{v2,v2-nosafety,v2_oracle}_final.json\` (gpt-4o, temperature 0, seed 42). Unit: one (sentence, cited passage) pair. Regenerate: \`node scripts/eval/citation-support.mjs extract && … passages && … judge && … report [--labels <csv>]\`.`, '');
  md.push(`Pairs: ${J.rows.length + J.excludedPairs} extracted; ${J.excludedPairs} excluded because the cited chunk's recorded content_hash differs from the 2026-09-13 snapshot; ${J.rows.length} judged (${J.rows.filter(r => r.hashStatus === 'verified').length} on a hash-verified passage, ${J.rows.filter(r => r.hashStatus === 'unrecorded').length} on an iSupport passage with no hash recorded on either side — plan §19B.2 clarification); ${scored.length} scored; ${J.rows.length - scored.length} unscored (${J.rows.filter(r => r.refused).length} refused, ${J.rows.filter(r => r.error).length} errors or unparsed).`, '');

  let gate = null;
  if (argVal('--labels')) {
    const labels = parseCsv(readFileSync(resolve(process.cwd(), argVal('--labels')), 'utf8'));
    const key = parseCsv(readFileSync(KEY, 'utf8'));
    const byItem = Object.fromEntries(labels.map(r => [String(r.item).trim(), r]));
    const byPair = Object.fromEntries(J.rows.map(r => [r.pairId, r]));
    const bad = labels.filter(r => normaliseLabel(r.label) === undefined).map(r => r.item);
    if (bad.length) { console.error(`unrecognised labels on items ${bad.join(', ')} — use supported, partial or not_supported`); process.exit(1); }
    const author = key.map(k => normaliseLabel(byItem[k.item]?.label) ?? null);
    const checker = key.map(k => byPair[k.pair_id]?.verdict ?? null);
    gate = gateStats(author, checker);
    gate.labelsFileSha256 = sha256(readFileSync(resolve(process.cwd(), argVal('--labels'))));
    gate.judgedFileSha256 = sha256(readFileSync(JUDGED));
    writeFileSync(resolve(FINAL, 'citation-check_gate_s19b.json'), JSON.stringify({ generatedAt: new Date().toISOString(), ...gate }, null, 2) + '\n');
    md.push('## Validation gate (author vs checker, blinded sample)', '');
    md.push(`Pre-registered: Cohen's κ ≥ ${gate.threshold} on **supported vs not fully supported** (partial and not_supported together), on ≥ ${gate.minLabelled} labelled pairs, with neither side giving one value on ≥ 95 % of them.`, '');
    md.push('| Pairs labelled by both | κ, supported vs not fully (primary) | Agreement | κ, any support vs none | κ, three labels | κ, three labels, linear | Degenerate | Gate |', '|---:|---:|---:|---:|---:|---:|---|---|');
    const k = (x) => (x == null ? '—' : x.toFixed(3));
    md.push(`| ${gate.n} | ${k(gate.kappaPrimary)} | ${pc(gate.agreementPrimary ?? 0)} | ${k(gate.kappaAny)} | ${k(gate.kappa3)} | ${k(gate.kappa3Linear)} | ${gate.degenerate ? 'yes' : 'no'} | **${gate.pass ? 'met' : 'not met'}**${gate.pass ? '' : ` — ${gate.reasons.join('; ')}`} |`, '');
    md.push('Confusion (rows author, columns checker):', '', `| | ${LABELS.join(' | ')} |`, `|---|${LABELS.map(() => '---:').join('|')}|`);
    for (const a of LABELS) md.push(`| ${a} | ${LABELS.map(c => gate.confusion[a][c]).join(' | ')} |`);
    md.push('');
  } else {
    md.push('## Validation gate', '', '**Not assessed: the author\'s labels have not been returned.** Under the pre-registered rule only the pooled rate below may be reported, as a descriptive, unvalidated checker result. Per-condition rates are not computed.', '');
  }

  md.push(`## Pooled support across all answers (${scored.length} pairs, ${new Set(scored.map(r => `${r.condition}|${r.qid}`)).size} answers)`, '');
  md.push(gate?.pass ? 'The checker passed the validation gate.' : '**Descriptive, checker-judged, not validated** (gate not met or not assessed).', '');
  const d = distribution(scored);
  md.push('| Verdict | Pairs | Share | 95 % CI (bootstrap over answers) |', '|---|---:|---:|---|');
  for (const v of LABELS) md.push(`| ${v} | ${d[v].k} | ${pc(d[v].p)} | ${pc(d[v].ci.lo)} – ${pc(d[v].ci.hi)} |`);
  const ver = scored.filter(r => r.hashStatus === 'verified');
  if (ver.length && ver.length < scored.length) {
    const dv = distribution(ver);
    md.push('', `Sensitivity (pre-registered in the clarification): hash-verified passages only, ${ver.length} pairs — ${LABELS.map(v => `${v} ${pc(dv[v].p)} [${pc(dv[v].ci.lo)}–${pc(dv[v].ci.hi)}]`).join(', ')}.`);
  }
  // sentence level: best verdict over the sentence's cited passages
  const sent = new Map();
  for (const r of scored) { const k = `${r.condition}|${r.qid}|${r.sentenceIndex}`; const rank = LABELS.indexOf(r.verdict); if (!sent.has(k) || rank < sent.get(k).rank) sent.set(k, { rank, verdict: r.verdict, condition: r.condition, qid: r.qid }); }
  const sRows = [...sent.values()];
  md.push('', `Sentence level (secondary; a sentence takes the best verdict among the passages it cites): ${sRows.length} cited sentences — supported ${pc(sRows.filter(r => r.verdict === 'supported').length / sRows.length)}, partial ${pc(sRows.filter(r => r.verdict === 'partial').length / sRows.length)}, not_supported ${pc(sRows.filter(r => r.verdict === 'not_supported').length / sRows.length)}.`, '');

  if (gate?.pass) {
    md.push('## Per condition (permitted: the gate was met)', '');
    md.push('| Condition | Pairs | supported | partial | not_supported |', '|---|---:|---|---|---|');
    for (const c of SOURCES.map(s => s.condition)) {
      const rs = scored.filter(r => r.condition === c); const dd = distribution(rs);
      md.push(`| ${c} | ${rs.length} | ${LABELS.map(v => `${pc(dd[v].p)} [${pc(dd[v].ci.lo)}–${pc(dd[v].ci.hi)}]`).join(' | ')} |`);
    }
    // oracle vs v2 on the shared A / A-neighbour questions
    const shared = scored.filter(r => r.condition === 'v2' && ['A', 'A-neighbour'].includes(r.set));
    const orc = scored.filter(r => r.condition === 'v2-oracle');
    md.push('', `On the shared A / A-neighbour questions: supported v2 ${pc(shared.filter(r => r.verdict === 'supported').length / shared.length)} (n ${shared.length}) vs v2-oracle ${pc(orc.filter(r => r.verdict === 'supported').length / orc.length)} (n ${orc.length}).`, '');
  }
  writeFileSync(resolve(FINAL, 'citation-support_s19b.md'), md.join('\n') + '\n');
  console.log(md.join('\n'));
  console.log(`\nWrote docs/report/eval/final/citation-support_s19b.md${gate ? ' and citation-check_gate_s19b.json' : ''}`);
}

const run = { extract, passages, judge, sheet, report }[cmd];
if (!run) { console.error('usage: citation-support.mjs extract | passages | judge [--dry-run] | sheet | report [--labels csv]'); process.exit(1); }
Promise.resolve(run()).catch(e => { console.error(e); process.exit(1); });
