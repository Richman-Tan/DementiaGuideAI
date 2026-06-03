/**
 * Assertion-based response evaluator for Aria's RAG answers.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/test-responses.mjs
 *
 * Optional flags:
 *   --verbose              Print full response text for each case
 *   --case <id>            Run only one case (e.g. --case sundowning)
 *   --helpline-required    Force helpline number check for all cases
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

function loadDotEnvIfPresent() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.join(__dirname, '../.env');
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadDotEnvIfPresent();

const OPENAI_BASE = 'https://api.openai.com/v1';
const EMBED_MODEL = 'text-embedding-3-small';
const CHAT_MODEL = 'gpt-4o-mini';
const MIN_SIMILARITY = 0.25;
const TOP_K = 5;
const MAX_TOKENS = 600;
const TEMPERATURE = 0.4;

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const getFlag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const verbose = hasFlag('--verbose');
const selectedCaseId = getFlag('--case');
const forceHelplineForAll = hasFlag('--helpline-required');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY environment variable is not set.');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function buildSystemPrompt() {
  return `You are Aria, a compassionate and knowledgeable AI assistant created to support family caregivers, healthcare workers, and families caring for people with dementia. You work like a specialised library - every answer you give is grounded in the curated knowledge passages provided to you.

IMPORTANT RULES:
1. Base your response ONLY on the numbered context passages provided. Do not draw on outside knowledge.
2. Whenever you use information from a passage, place its number in square brackets immediately after the relevant sentence - e.g. "Alzheimer's disease affects 2 in 3 people with dementia [1]." Use the number that matches the passage header (--- Source [N] ---).
3. You may cite the same source multiple times, and you may cite multiple sources in one sentence: [1][3].
4. If the context passages do not contain enough information to answer the question, say so honestly: "I don't have specific information about that in my knowledge base, but I recommend speaking with your GP or Dementia Australia (1800 100 500)."
5. Be warm, empathetic, and emotionally supportive - caregiving is hard, and the person reading your response may be exhausted or distressed.
6. Use plain, everyday language. Avoid medical jargon unless you explain the term immediately after.
7. Keep responses concise - aim for 2 to 4 short paragraphs. People are often reading on a phone.
8. Do NOT add a Sources section at the end. Citations are inline only.
9. Always end every response with this exact closing sentence: "This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions."`;
}

async function openai(endpoint, body) {
  const resp = await fetch(`${OPENAI_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => `HTTP ${resp.status}`);
    throw new Error(`OpenAI ${endpoint} failed: ${text}`);
  }

  return resp.json();
}

async function embedQuery(text) {
  const data = await openai('/embeddings', { model: EMBED_MODEL, input: text });
  return data.data[0].embedding;
}

async function retrieveChunks(question) {
  const queryEmbedding = await embedQuery(question);
  const { data, error } = await supabase.rpc('match_chunks', {
    query_embedding: queryEmbedding,
    match_count: TOP_K,
    min_similarity: MIN_SIMILARITY,
  });
  if (error) {
    throw new Error(`Supabase match_chunks failed: ${error.message}`);
  }
  return data ?? [];
}

function buildContextBlock(chunks) {
  if (chunks.length === 0) {
    return '[CONTEXT]\nNo specific knowledge base entries matched this query.\n[/CONTEXT]';
  }
  const lines = chunks.map((c, i) => `--- Source [${i + 1}] | ${c.title} ---\n${c.content}`);
  return `[CONTEXT]\n${lines.join('\n\n')}\n[/CONTEXT]`;
}

async function ask(question) {
  const chunks = await retrieveChunks(question);
  const contextBlock = buildContextBlock(chunks);

  const data = await openai('/chat/completions', {
    model: CHAT_MODEL,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: `${contextBlock}\n\nUser question: ${question}` },
    ],
  });

  const response = data.choices?.[0]?.message?.content?.trim() ?? '';
  return { response, chunks };
}

function includesCI(haystack, needle) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function hasDisclaimer(text) {
  const hasGuidanceOnly = /guidance only/i.test(text);
  const hasHealthcareProfessional = /healthcare professional/i.test(text);
  const hasHelpline = /1800\s*100\s*500/.test(text) || /dementia\s*australia/i.test(text);
  return (hasGuidanceOnly && hasHealthcareProfessional) || hasHelpline;
}

function countCitations(text) {
  const nums = new Set();
  const regex = /\[(\d+)\]/g;
  let m;
  while ((m = regex.exec(text)) !== null) nums.add(Number(m[1]));
  return nums.size;
}

function evaluateCase(testCase, response) {
  const failures = [];

  if (testCase.mustIncludeAll) {
    for (const word of testCase.mustIncludeAll) {
      if (!includesCI(response, word)) {
        failures.push(`Missing required word/phrase: "${word}"`);
      }
    }
  }

  if (testCase.mustIncludeAny && testCase.mustIncludeAny.length > 0) {
    const found = testCase.mustIncludeAny.some(word => includesCI(response, word));
    if (!found) {
      failures.push(`Response must include at least one of: ${testCase.mustIncludeAny.join(', ')}`);
    }
  }

  if (testCase.requireDisclaimer && !hasDisclaimer(response)) {
    failures.push('Missing disclaimer (guidance/healthcare professional or Dementia Australia helpline).');
  }

  if ((testCase.requireHelpline || forceHelplineForAll) && !/1800\s*100\s*500/.test(response)) {
    failures.push('Missing required helpline number: 1800 100 500');
  }

  const minCitations = testCase.minCitations ?? 0;
  const citations = countCitations(response);
  if (citations < minCitations) {
    failures.push(`Expected at least ${minCitations} citation(s), got ${citations}`);
  }

  return { pass: failures.length === 0, failures, citations };
}

const TEST_CASES = [
  {
    id: 'sundowning',
    question: 'What is sundowning and how do I manage it?',
    mustIncludeAny: ['sundowning', 'late afternoon', 'evening'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'repetitive-questions',
    question: 'My dad keeps asking the same question repeatedly. What should I do?',
    mustIncludeAny: ['reassure', 'repeat', 'calm', 'routine'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'unknown-domain-helpline',
    question: 'What financial support is available for dementia carers in New Zealand?',
    mustIncludeAny: ["I don't have specific information", 'Dementia Australia', 'GP'],
    requireDisclaimer: true,
    requireHelpline: true,
    minCitations: 0,
  },
  {
    id: 'shower-support',
    question: 'How do I help someone with dementia take a shower without upsetting them?',
    mustIncludeAny: ['routine', 'privacy', 'calm', 'reassure', 'step'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'early-signs',
    question: 'What are the early signs of dementia I should look out for?',
    mustIncludeAny: ['memory', 'confusion', 'daily', 'planning', 'language'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'driving-safety',
    question: 'Can someone with dementia still drive a car?',
    mustIncludeAny: ['driving', 'safety', 'doctor', 'assessment', 'license'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'unsupported-cure-claim',
    question: 'Can coconut oil cure dementia?',
    mustIncludeAny: ["I don't have specific information", 'healthcare professional', 'Dementia Australia'],
    requireDisclaimer: true,
    requireHelpline: true,
    minCitations: 0,
  },
];

const casesToRun = selectedCaseId
  ? TEST_CASES.filter(c => c.id === selectedCaseId)
  : TEST_CASES;

if (selectedCaseId && casesToRun.length === 0) {
  console.error(`Unknown case id: ${selectedCaseId}`);
  process.exit(1);
}

const DIVIDER = '-'.repeat(78);

async function main() {
  let passed = 0;
  let failed = 0;

  console.log(DIVIDER);
  console.log(`Running ${casesToRun.length} response quality test(s)`);
  console.log(DIVIDER);

  for (const testCase of casesToRun) {
    console.log(`\n[CASE] ${testCase.id}`);
    console.log(`Q: ${testCase.question}`);

    try {
      const { response, chunks } = await ask(testCase.question);
      const result = evaluateCase(testCase, response);

      console.log(`Retrieved chunks: ${chunks.length}`);
      console.log(`Unique citations: ${result.citations}`);

      if (verbose) {
        console.log('\nResponse:\n');
        console.log(response);
      }

      if (result.pass) {
        passed += 1;
        console.log('Result: PASS');
      } else {
        failed += 1;
        console.log('Result: FAIL');
        for (const f of result.failures) {
          console.log(`  - ${f}`);
        }
        if (!verbose) {
          console.log('  Tip: rerun with --verbose to inspect full response text.');
        }
      }
    } catch (err) {
      failed += 1;
      console.log('Result: ERROR');
      console.log(`  - ${err.message}`);
    }
  }

  console.log(`\n${DIVIDER}`);
  console.log(`Summary: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
