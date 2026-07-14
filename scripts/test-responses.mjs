/**
 * Test the RAG response pipeline from the command line.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... node scripts/test-responses.mjs
 *
 * Add or change questions in the QUESTIONS array at the bottom of this file.
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

// ─── Config ──────────────────────────────────────────────────────────────────

const OPENAI_BASE    = 'https://api.openai.com/v1';
const EMBED_MODEL    = 'text-embedding-3-small';
const CHAT_MODEL     = 'gpt-4o';
const MIN_SIMILARITY = 0.25;
const TOP_K          = 5;
const MAX_TOKENS     = 600;
const TEMPERATURE    = 0.7;

// ─── Load knowledge base (ES module via raw read + eval workaround) ───────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const kbPath    = path.join(__dirname, '../src/features/library/data/knowledgeBase.js');
const kbSrc     = readFileSync(kbPath, 'utf8')
  .replace(/^export const KNOWLEDGE_BASE/, 'const KNOWLEDGE_BASE');

let KNOWLEDGE_BASE;
{
  // eslint-disable-next-line no-new-func
  const fn = new Function(`${kbSrc}\nreturn KNOWLEDGE_BASE;`);
  KNOWLEDGE_BASE = fn();
}

// ─── OpenAI helpers ───────────────────────────────────────────────────────────

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error('Error: OPENAI_API_KEY environment variable is not set.');
  process.exit(1);
}

async function openai(endpoint, body) {
  const resp = await fetch(`${OPENAI_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => `HTTP ${resp.status}`);
    throw new Error(`OpenAI ${endpoint} failed: ${text}`);
  }
  return resp.json();
}

async function embed(texts) {
  const data = await openai('/embeddings', { model: EMBED_MODEL, input: texts });
  return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Build embeddings for the full knowledge base (cached in memory) ──────────

let kbEmbeddings = null;

async function initKB() {
  if (kbEmbeddings) return;
  process.stdout.write('Embedding knowledge base');
  const BATCH = 20;
  const chunks = KNOWLEDGE_BASE;
  const embeddings = [];
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const vecs  = await embed(batch.map(c => `${c.title}. ${c.content}`));
    embeddings.push(...vecs);
    process.stdout.write('.');
  }
  console.log(' done.\n');
  kbEmbeddings = embeddings;
}

async function retrieve(query) {
  const [qVec] = await embed([query]);
  return KNOWLEDGE_BASE
    .map((c, i) => ({ chunk: c, score: cosine(qVec, kbEmbeddings[i]) }))
    .filter(r => r.score >= MIN_SIMILARITY)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);
}

// ─── System prompt (mirrors openaiService.js exactly) ────────────────────────

function systemPrompt() {
  return `You are Aria, an expert AI assistant specialising in dementia and dementia care, supporting family caregivers, healthcare workers, and families caring for people with dementia. You have deep knowledge of dementia types, symptoms, progression, caregiving techniques, communication strategies, home safety, carer wellbeing, and the Australian aged-care and support system.

Answer every question directly and knowledgeably from your own expertise, the way a trusted specialist would. Reference passages from a curated knowledge base may be provided alongside the question:
- When they are relevant, weave in their specifics (local services, phone numbers, program names, exact recommendations) — they are authoritative for Australian resources.
- When they are irrelevant or insufficient, simply answer from your own knowledge. Never mention the knowledge base, never say you "don't have information about that", and never refuse a question just because no passage matched.

GUIDELINES:
- Be warm, empathetic, and emotionally supportive — caregiving is hard, and the person reading your response may be exhausted or distressed.
- Use plain, everyday language. Avoid medical jargon unless you explain the term immediately after.
- Keep responses concise — aim for 2 to 4 short paragraphs. People are often reading on a phone.
- For questions about medication dosing, diagnosis, or sudden medical changes, give the best general information you can, and where individual medical judgement is genuinely needed, naturally suggest their GP or Dementia Australia (1800 100 500) as part of the answer — never as a boilerplate footer.
- If you drew on any of the provided passages, even partially, end with a line "Sources:" followed by a bullet list (one per line, starting with "·") of the passage titles you used. Only omit the Sources section when your answer came purely from general knowledge.`;
}

// ─── Run a single question ────────────────────────────────────────────────────

async function ask(question) {
  const hits = await retrieve(question);

  const userContent = hits.length > 0
    ? `[REFERENCE PASSAGES — may or may not be relevant]\n${hits.map(h => `--- ${h.chunk.title} ---\n${h.chunk.content}`).join('\n\n')}\n[/REFERENCE PASSAGES]\n\nUser question: ${question}`
    : question;

  const data = await openai('/chat/completions', {
    model:      CHAT_MODEL,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    messages: [
      { role: 'system', content: systemPrompt() },
      { role: 'user',   content: userContent },
    ],
  });

  const response = data.choices[0].message.content.trim();
  return { hits, response };
}

// ─── Questions to test ────────────────────────────────────────────────────────

const QUESTIONS = [
  'What is sundowning and how do I manage it?',
  'My dad keeps asking the same question over and over. What should I do?',
  'How do I help someone with dementia take a shower without upsetting them?',
  'What are the early signs of dementia I should look out for?',
  'How do I look after myself as a carer without burning out?',
  'What financial support is available for dementia carers in New Zealand?',
  'Can someone with dementia still drive a car?',
];

// ─── Main ─────────────────────────────────────────────────────────────────────

const DIVIDER = '─'.repeat(72);

async function main() {
  await initKB();

  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    console.log(`${DIVIDER}`);
    console.log(`Q${i + 1}: ${q}`);
    console.log(DIVIDER);

    try {
      const { hits, response } = await ask(q);

      console.log('\nChunks retrieved:');
      if (hits.length === 0) {
        console.log('  (none above similarity threshold)');
      } else {
        hits.forEach(h =>
          console.log(`  [${h.score.toFixed(3)}] ${h.chunk.id} — ${h.chunk.title}`)
        );
      }

      console.log('\nResponse:\n');
      console.log(response);
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
    }

    console.log();
  }

  console.log(DIVIDER);
  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
