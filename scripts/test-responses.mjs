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
const CHAT_MODEL     = 'gpt-4o-mini';
const MIN_SIMILARITY = 0.25;
const TOP_K          = 5;
const MAX_TOKENS     = 600;
const TEMPERATURE    = 0.4;

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
  return `You are Aria, a compassionate and knowledgeable AI assistant created to support family caregivers, healthcare workers, and families caring for people with dementia. You work like a specialised library — every answer you give is grounded in the curated knowledge passages provided to you.

IMPORTANT RULES:
1. Base your response ONLY on the context passages provided. Do not draw on outside knowledge.
2. If the context passages do not contain enough information to answer the question, say so honestly: "I don't have specific information about that in my knowledge base, but I recommend speaking with your GP or Dementia Australia (1800 100 500)."
3. Be warm, empathetic, and emotionally supportive — caregiving is hard, and the person reading your response may be exhausted or distressed.
4. Use plain, everyday language. Avoid medical jargon unless you explain the term immediately after.
5. Keep responses concise — aim for 2 to 4 short paragraphs. People are often reading on a phone.
6. After your response, on a new line, write "Sources:" followed by a bullet list of the knowledge base titles you drew from (one per line, starting with "·"). Only list sources you actually used.
7. Always end with a brief reminder that your information is for guidance only and that a healthcare professional should be consulted for individual medical decisions.`;
}

// ─── Run a single question ────────────────────────────────────────────────────

async function ask(question) {
  const hits = await retrieve(question);

  const contextBlock = hits.length > 0
    ? `[CONTEXT]\n${hits.map(h => `--- ${h.chunk.title} ---\n${h.chunk.content}`).join('\n\n')}\n[/CONTEXT]`
    : '[CONTEXT]\nNo specific knowledge base entries matched this query.\n[/CONTEXT]';

  const data = await openai('/chat/completions', {
    model:      CHAT_MODEL,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    messages: [
      { role: 'system', content: systemPrompt() },
      { role: 'user',   content: `${contextBlock}\n\nUser question: ${question}` },
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
