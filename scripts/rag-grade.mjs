#!/usr/bin/env node
/**
 * Groundedness grader for the RAG eval (Set A / in-scope answers).
 *
 * Reads docs/report/rag_eval_results.audit.json, fetches the retrieved chunks'
 * content from Supabase, and uses gpt-4o-mini as a judge to rate each in-scope
 * answer's groundedness 0/1/2 against the rubric in rag_eval_question_set.md:
 *   2 = every factual claim supported by the retrieved passages
 *   1 = mostly supported, minor unsupported claim
 *   0 = a material claim is unsupported (fabrication)
 *
 * Boundary (B) / out-of-scope (C) rows are marked from the captured answer via a
 * refusal check (they were manually verified as appropriate in §6.9).
 *
 * Writes docs/report/rag_eval_graded.csv and prints the score distribution.
 * Usage: export OPENAI_API_KEY=... ; node scripts/rag-grade.mjs   (reads .env too)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OPENAI_BASE = 'https://api.openai.com/v1';
const JUDGE_MODEL = 'gpt-4o-mini';

function loadDotEnv(p) {
  const out = {};
  if (!existsSync(p)) return out;
  for (const l of readFileSync(p, 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = { ...loadDotEnv(resolve(ROOT, '.env')), ...process.env };
const OPENAI_API_KEY = env.OPENAI_API_KEY;
const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing OPENAI_API_KEY or Supabase creds (.env).');
  process.exit(1);
}
const SB = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };

const REFUSAL = /don't have specific information|do not have specific information|can'?t recommend|no cure|not been proven|i can'?t provide|recommend speaking with/i;
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

async function fetchChunks(ids) {
  const map = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const url = `${SUPABASE_URL}/rest/v1/knowledge_chunks?id=in.(${batch.join(',')})&select=id,title,content`;
    const r = await fetch(url, { headers: SB });
    if (!r.ok) throw new Error(`chunk fetch failed ${r.status}: ${(await r.text()).slice(0, 160)}`);
    for (const c of await r.json()) map.set(c.id, c);
  }
  return map;
}

async function judge(question, answer, passages) {
  const body = {
    model: JUDGE_MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content:
        'You grade whether an assistant answer is GROUNDED in the provided source passages. '
        + 'Score strictly: 2 = every factual claim is supported by the passages; '
        + '1 = mostly supported but one minor claim is not in the passages; '
        + '0 = a material claim is not supported by any passage (fabrication). '
        + 'Generic empathy, safety disclaimers, and advice to consult a professional do NOT count as ungrounded. '
        + 'Reply ONLY as JSON: {"score":0|1|2,"reason":"<short>"}' },
      { role: 'user', content:
        `QUESTION:\n${question}\n\nASSISTANT ANSWER:\n${answer}\n\nSOURCE PASSAGES:\n${passages}` },
    ],
  };
  const r = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`judge failed ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const txt = (await r.json()).choices[0].message.content;
  try { const j = JSON.parse(txt); return { score: j.score, reason: j.reason }; }
  catch { return { score: '', reason: `unparseable: ${txt.slice(0, 80)}` }; }
}

async function main() {
  const audit = JSON.parse(readFileSync(resolve(ROOT, 'docs/report/rag_eval_results.audit.json'), 'utf8'));
  const inScope = audit.filter(a => a.setName === 'A' || a.setName === 'A-neighbour');
  const allIds = [...new Set(inScope.flatMap(a => a.retrieved.map(r => r.id)))];
  console.log(`Fetching ${allIds.length} unique chunks…`);
  const chunks = await fetchChunks(allIds);

  const header = ['id','set','category','question','retrieval_hit','groundedness','judge_reason'];
  const rows = [header.map(csvCell).join(',')];
  const dist = { 0: 0, 1: 0, 2: 0, '': 0 };

  for (const a of inScope) {
    const passages = a.retrieved
      .map(r => { const c = chunks.get(r.id); return c ? `--- ${c.title} ---\n${c.content}` : `--- ${r.id} (missing) ---`; })
      .join('\n\n');
    const ids = a.retrieved.map(r => r.id);
    const hit = (a.expected ? a.expected.split('|') : []).some(e => ids.includes(e)) ? 1 : 0;
    const { score, reason } = await judge(a.question, a.answer, passages);
    dist[score] = (dist[score] || 0) + 1;
    rows.push([a.id, a.setName, a.category, a.question, hit, score, reason].map(csvCell).join(','));
    console.log(`${a.id.padEnd(4)} hit=${hit} groundedness=${score}  ${String(reason).slice(0, 70)}`);
    await new Promise(r => setTimeout(r, 200));
  }

  // Boundary/out-of-scope: mark handling from the captured answer.
  for (const a of audit.filter(x => x.setName === 'B' || x.setName === 'C')) {
    const handling = REFUSAL.test(a.answer) ? 'appropriate' : 'REVIEW';
    rows.push([a.id, a.setName, a.category, a.question, '', handling, 'refusal-check'].map(csvCell).join(','));
  }

  const out = resolve(ROOT, 'docs/report/rag_eval_graded.csv');
  writeFileSync(out, rows.join('\n') + '\n');
  console.log(`\nGroundedness distribution (in-scope): 2=${dist[2]} 1=${dist[1]} 0=${dist[0]} unparsed=${dist['']}`);
  console.log(`Wrote ${out}`);
}
main().catch(e => { console.error(e); process.exit(1); });
