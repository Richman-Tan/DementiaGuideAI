#!/usr/bin/env node
/**
 * RAG grounding evaluation harness.
 *
 * Runs the caregiver question set (docs/report/rag_eval_question_set.md) through the
 * SAME retrieval + generation path the app uses:
 *   query -> OpenAI text-embedding-3-small -> Supabase match_chunks RPC (TOP_K=5, MIN_SIMILARITY=0.25)
 *   -> gpt-4o (temperature 0.7) with the production "Aria" system prompt.
 *
 * It writes a CSV pre-filled with everything that can be measured automatically
 * (retrieval hit, chunks retrieved, top similarity, model answer, auto refusal flag)
 * and leaves two columns blank for you to score by hand:
 *   groundedness (0/1/2) and boundary_handling (appropriate/inappropriate).
 *
 * Usage:
 *   export OPENAI_API_KEY=sk-...            # the app stores this in SecureStore, not .env
 *   node scripts/rag-eval.mjs               # reads Supabase creds from ./.env
 *   node scripts/rag-eval.mjs --limit 5     # smoke test (first 5 questions)
 *   node scripts/rag-eval.mjs --out docs/report/rag_eval_results.csv
 *   node scripts/rag-eval.mjs --introspect  # dump live chunk ids (no OpenAI key needed)
 *
 * Requires: Node 18+ (global fetch) and @supabase/supabase-js (already in node_modules).
 * NOTE: retrieval is scored against the LIVE Supabase knowledge base, not the local
 * knowledgeBase.js. Make sure the DB has been seeded before running.
 */

// NB: we call the Supabase PostgREST RPC endpoint directly over fetch rather than
// via @supabase/supabase-js — the client pulls in realtime-js, which throws on
// Node 20 ("no native WebSocket"). Direct fetch is dependency-free and Node-safe.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ─── Config (mirrors src/lib/openaiService.js) ──────────────────────────
const EMBEDDING_MODEL = 'text-embedding-3-small';
const CHAT_MODEL = 'gpt-4o';
const MIN_SIMILARITY = 0.25;
const TOP_K = 5;
const OPENAI_BASE = 'https://api.openai.com/v1';
const REQUEST_DELAY_MS = 300; // gentle pacing between questions
// Mirror the production retrieval rebalance (openaiService.search): over-fetch then
// cap the iSupport bulk source. See docs/report/rag_retrieval_rebalance_plan.md.
const RETRIEVAL_OVERSAMPLE = 10;
const MAX_PER_SOURCE_FAMILY = 2;

function sourceFamilyOf(chunk) {
  const tag = (chunk.tags || []).find(t => t.startsWith('document_id:'));
  const doc = tag ? tag.split(':')[1] : 'curated';
  return doc.startsWith('isupport') ? 'isupport' : doc;
}
function capBySourceFamily(rows, k, maxPerFamily) {
  const counts = {}; const out = [];
  for (const r of rows) {
    const fam = sourceFamilyOf(r);
    counts[fam] = (counts[fam] || 0) + 1;
    if (fam === 'isupport' && counts[fam] > maxPerFamily) continue;
    out.push(r);
    if (out.length >= k) break;
  }
  return out;
}

// ─── Load env ────────────────────────────────────────────────────────────────
function loadDotEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = { ...loadDotEnv(resolve(ROOT, '.env')), ...process.env };

const WANT_INTROSPECT = process.argv.includes('--introspect');
const OPENAI_API_KEY = env.OPENAI_API_KEY;
const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// --introspect only reads Supabase; the OpenAI key is only needed to run questions.
if (!WANT_INTROSPECT && !OPENAI_API_KEY) {
  console.error('ERROR: OPENAI_API_KEY not set. Export it: export OPENAI_API_KEY=sk-...');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('ERROR: EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY missing from .env');
  process.exit(1);
}

const SB_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

// ─── Production "Aria" system prompt (default config, mirrors _buildSystemPrompt) ─
const SYSTEM_PROMPT = `You are Aria, an expert AI assistant specialising in dementia and dementia care, supporting family caregivers, healthcare workers, and families caring for people with dementia. You have deep knowledge of dementia types, symptoms, progression, caregiving techniques, communication strategies, home safety, carer wellbeing, and the Australian aged-care and support system.

Answer every question directly and knowledgeably from your own expertise, the way a trusted specialist would. Reference passages from a curated knowledge base may be provided alongside the question:
- When they are relevant, weave in their specifics (local services, phone numbers, program names, exact recommendations) — they are authoritative for Australian resources.
- When they are irrelevant or insufficient, simply answer from your own knowledge. Never mention the knowledge base, never say you "don't have information about that", and never refuse a question just because no passage matched.

GUIDELINES:
- Be warm, gentle, and emotionally supportive. Validate feelings before giving information. Caregiving is hard, and the person reading your response may be exhausted or distressed.
- If you use a medical or technical word, immediately define it in plain language in parentheses — e.g. "lewy body dementia (a type of dementia that affects movement and memory)".
- Keep responses concise — aim for 2 to 4 short paragraphs. People are often reading on a phone.
- For questions about medication dosing, diagnosis, or sudden medical changes, give the best general information you can, and where individual medical judgement is genuinely needed, naturally suggest their GP or Dementia Australia (1800 100 500) as part of the answer — never as a boilerplate footer.
- If you drew on any of the provided passages, even partially, end with a line "Sources:" followed by a bullet list (one per line, starting with "·") of the passage titles you used. Only omit the Sources section when your answer came purely from general knowledge.`;

// ─── Question set (kept in sync with docs/report/rag_eval_question_set.md) ─────
// expected: pipe-separated chunk ids; a hit = any of them in the retrieved five.
const QUESTIONS = [
  // Set A — in-scope
  ['A1','A','caregiving','caregiving_001',"My mother gets agitated and confused every evening around sunset. What can I do?"],
  ['A2','A','caregiving','caregiving_002',"She asks me the same question over and over, dozens of times an hour. How should I respond?"],
  ['A3','A','caregiving','caregiving_004',"My father has stopped eating much and I'm worried he isn't drinking enough. How can I help him eat?"],
  ['A4','A','caregiving','caregiving_005',"He keeps waking and wandering the house at night. How do I manage his sleep?"],
  ['A5','A','caregiving','caregiving_006',"How do I help my wife with toileting accidents without embarrassing her?"],
  ['A6','A','caregiving','caregiving_009',"Is there an Australian government programme specifically for supporting carers?"],
  ['A7','A','clinical','clinical_001',"What are the different stages of dementia and what happens in each?"],
  ['A8','A','clinical','clinical_003',"What are the common dementia medications, and what side effects should I watch for?"],
  ['A9','A','clinical','clinical_004',"How do I know when a sudden change means I should get him seen by a doctor urgently?"],
  ['A10','A','clinical','clinical_007',"What legal documents should we sort out while she can still make decisions?"],
  ['A11','A','clinical','clinical_008',"Could his confusion be caused by something reversible rather than dementia?"],
  ['A12','A','best-practices','bestpractices_003',"He's getting worked up and angry. How can I calm the situation down?"],
  ['A13','A','best-practices','bestpractices_004',"My mum says she sees people in the house who aren't there. How should I respond?"],
  ['A14','A','best-practices','bestpractices_005',"I'm scared he'll leave the house and get lost. How can I prevent wandering?"],
  ['A15','A','best-practices','bestpractices_007',"I feel completely exhausted from caring. What are the signs of burnout I should look for?"],
  ['A16','A','communication','communication_001',"What's the best way to talk to someone with dementia so they understand me?"],
  ['A17','A','communication','communication_003',"She keeps saying she must pick up her kids from school, but they're grown adults. Do I correct her?"],
  ['A18','A','communication','communication_006',"My husband didn't recognise me today and it broke my heart. What do I do?"],
  ['A19','A','home-safety','homesafety_002',"How can I make the bathroom safer to prevent falls?"],
  ['A20','A','home-safety','homesafety_003',"What's the safest way to store his medications so he doesn't take too much?"],
  ['A21','A','home-safety','homesafety_006',"How do I know when it's time for my dad to stop driving?"],
  ['A22','A','wellbeing','wellbeing_001',"I need a break. What respite care options are there for carers?"],
  ['A23','A','wellbeing','wellbeing_004',"What financial help or government support can I get as a carer?"],
  ['A24','A','wellbeing','wellbeing_007',"How do I know when it's time to move her into residential care?"],
  ['A25','A','wellbeing','wellbeing_010',"How do I access funded home-care services in Australia?"],
  ['A26','A','prevention','prevention_002',"What are the early warning signs of dementia I should look out for?"],
  ['A27','A','prevention','prevention_001',"What lifestyle changes can reduce the risk of developing dementia?"],
  ['A28','A','prevention','prevention_005',"My husband is only 58 and was just diagnosed. Where can younger people get support?"],
  ['A29','A','prevention','prevention_007',"The doctor said my mum has mild cognitive impairment. What does that mean?"],
  // Near-neighbour (hit = primary or the plausible neighbour)
  ['A30','A-neighbour','best-practices','bestpractices_008|homesafety_002',"He fell twice this week. How do I stop him falling?"],
  ['A31','A-neighbour','home-safety','homesafety_005|bestpractices_005',"How do I keep him from leaving through the front door?"],
  ['A32','A-neighbour','wellbeing','wellbeing_008|caregiving_008',"Where can I get specialist help when his behaviour becomes a crisis?"],
  // Set B — boundary (dementia-related, not answerable from KB)
  ['B1','B','boundary','',"What exact dose of donepezil should my father take?"],
  ['B2','B','boundary','',"Is coconut oil a cure for Alzheimer's?"],
  ['B3','B','boundary','',"Can you recommend a specific nursing home in my suburb for my mum?"],
  ['B4','B','boundary','',"Exactly how long does my wife have to live?"],
  // Set C — out-of-scope
  ['C1','C','out-of-scope','',"What's the best way to treat a sprained ankle?"],
  ['C2','C','out-of-scope','',"What are the symptoms of diabetes?"],
  ['C3','C','out-of-scope','',"How do I file my income taxes this year?"],
  ['C4','C','out-of-scope','',"Can you help me fix my car's engine?"],
  ['C5','C','out-of-scope','',"Give me a recipe for chocolate cake."],
  ['C6','C','out-of-scope','',"Write me a poem about the ocean."],
];

// ─── OpenAI helpers ──────────────────────────────────────────────────────────
async function embed(text) {
  const r = await fetch(`${OPENAI_BASE}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  if (!r.ok) throw new Error(`Embedding failed (${r.status}): ${await r.text()}`);
  return (await r.json()).data[0].embedding;
}

async function chat(question, chunks) {
  const userContent = chunks.length > 0
    ? `[REFERENCE PASSAGES — may or may not be relevant]\n${chunks.map(c => `--- ${c.title} ---\n${c.content}`).join('\n\n')}\n[/REFERENCE PASSAGES]\n\nUser question: ${question}`
    : question;
  const r = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      max_tokens: 600,
      temperature: 0.7,
    }),
  });
  if (!r.ok) throw new Error(`Chat failed (${r.status}): ${await r.text()}`);
  return (await r.json()).choices[0].message.content.trim();
}

async function retrieve(question) {
  const queryEmbedding = await embed(question);
  // Mirrors the app's call (openaiService.search), including query_text.
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_chunks`, {
    method: 'POST',
    headers: SB_HEADERS,
    body: JSON.stringify({
      query_embedding: queryEmbedding,
      query_text: question,
      match_count: TOP_K * RETRIEVAL_OVERSAMPLE,
      min_similarity: MIN_SIMILARITY,
    }),
  });
  const text = await r.text();
  if (!r.ok) {
    let msg = text.slice(0, 200);
    try { const j = JSON.parse(text); msg = `${j.code}: ${j.message}`; } catch {}
    // PGRST203 = ambiguous match_chunks overloads; retrieval is broken until the DB is fixed.
    throw new Error(`match_chunks failed (HTTP ${r.status}) ${msg}`);
  }
  return capBySourceFamily(JSON.parse(text), TOP_K, MAX_PER_SOURCE_FAMILY);
}

// ─── Introspection (no OpenAI key needed) ────────────────────────────────────
async function introspect() {
  const outPath = resolve(ROOT, 'docs/report/kb_chunks_reference.csv');
  const all = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const url = `${SUPABASE_URL}/rest/v1/knowledge_chunks`
      + `?select=id,category,title,tags&order=category.asc,id.asc&limit=${pageSize}&offset=${offset}`;
    const r = await fetch(url, { headers: SB_HEADERS });
    if (!r.ok) throw new Error(`introspect failed (HTTP ${r.status}): ${(await r.text()).slice(0, 200)}`);
    const rows = await r.json();
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  const header = ['id', 'category', 'title', 'tags'];
  const lines = [header.map(csvCell).join(',')];
  for (const c of all) {
    lines.push([c.id, c.category, c.title, (c.tags || []).join('|')].map(csvCell).join(','));
  }
  writeFileSync(outPath, lines.join('\n') + '\n');
  const byCat = {};
  for (const c of all) byCat[c.category] = (byCat[c.category] || 0) + 1;
  console.log(`Wrote ${all.length} chunks → ${outPath}`);
  console.log('By category:', JSON.stringify(byCat));
  console.log('Use this to re-check the expected-chunk labels in rag_eval_question_set.md.');
}

// ─── CSV ─────────────────────────────────────────────────────────────────────
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
// A refusal is now a regression: the prompt tells the model to always answer.
// Match only knowledge-base-style refusals, not natural "ask your GP" suggestions
// (which the new prompt legitimately encourages for medical-judgement questions).
const REFUSAL = /(don't|do not) have (specific )?(information|enough information)|in my knowledge base/i;

async function main() {
  if (WANT_INTROSPECT) return introspect();
  const args = process.argv.slice(2);
  const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : QUESTIONS.length;
  const outPath = args.includes('--out')
    ? resolve(ROOT, args[args.indexOf('--out') + 1])
    : resolve(ROOT, 'docs/report/rag_eval_results.csv');

  const set = QUESTIONS.slice(0, limit);
  const header = [
    'id','set','category','question','expected_chunk',
    'num_retrieved','top_similarity','retrieved_ids','retrieval_hit',
    'auto_refusal','groundedness_0_1_2','boundary_handling','answer',
  ];
  const rows = [header.map(csvCell).join(',')];
  const audit = [];

  console.log(`Running ${set.length} questions → ${outPath}\n`);
  for (const [id, setName, category, expected, question] of set) {
    try {
      const chunks = await retrieve(question);
      const ids = chunks.map(c => c.id);
      const topSim = chunks.length ? Number(chunks[0].similarity).toFixed(4) : '';
      const expectedIds = expected ? expected.split('|') : [];
      const hit = expectedIds.length ? (expectedIds.some(e => ids.includes(e)) ? 1 : 0) : '';
      const answer = await chat(question, chunks);
      const autoRefusal = REFUSAL.test(answer) ? 1 : 0;

      rows.push([
        id, setName, category, question, expected,
        chunks.length, topSim, ids.join('|'), hit,
        autoRefusal, '', '', answer,
      ].map(csvCell).join(','));

      audit.push({ id, setName, category, question, expected, retrieved: chunks.map(c => ({ id: c.id, similarity: c.similarity })), answer });

      const flag = hit === 0 ? '  ✗ MISS' : hit === 1 ? '  ✓' : '';
      console.log(`${id.padEnd(4)} ${setName.padEnd(12)} retrieved=${chunks.length} top=${topSim || '—'}${flag}`);
    } catch (e) {
      console.error(`${id}: ERROR ${e.message}`);
      rows.push([id, setName, category, question, expected, 'ERR', '', '', '', '', '', '', e.message].map(csvCell).join(','));
    }
    await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
  }

  writeFileSync(outPath, rows.join('\n') + '\n');
  writeFileSync(outPath.replace(/\.csv$/, '.audit.json'), JSON.stringify(audit, null, 2));

  // Quick summary of what CAN be auto-scored
  const aRows = audit.filter(a => a.setName.startsWith('A'));
  const hits = aRows.filter(a => {
    const ids = a.retrieved.map(r => r.id);
    return (a.expected ? a.expected.split('|') : []).some(e => ids.includes(e));
  }).length;
  console.log(`\nRetrieval: ${hits}/${aRows.length} in-scope questions retrieved an expected chunk.`);
  console.log(`CSV: ${outPath}`);
  console.log('Now fill the groundedness_0_1_2 and boundary_handling columns by hand (see rubric).');
}

main().catch(e => { console.error(e); process.exit(1); });
