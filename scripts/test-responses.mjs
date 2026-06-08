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
const MIN_SIMILARITY = 0.35;
const TOP_K = 8;
const MAX_TOKENS = 600;
const TEMPERATURE = 0.4;

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const getFlag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const getFlags = (name) => {
  const vals = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === name && args[i + 1]) vals.push(args[i + 1]);
  }
  return vals;
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
    query_text: question,
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
  {
    id: 'night-wandering',
    question: 'My mum keeps waking at 3am and trying to leave the house. How can I keep her safe?',
    mustIncludeAny: ['safe', 'night', 'routine', 'door', 'wandering'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'hallucinations',
    question: 'He says strangers are in the room when nobody is there. What should I do when this happens?',
    mustIncludeAny: ['reassure', 'calm', 'argue', 'environment', 'doctor'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'bathroom-falls',
    question: 'Any tips to stop bathroom falls for someone with dementia?',
    mustIncludeAny: ['bathroom', 'fall', 'safety', 'non-slip', 'grab'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'incontinence',
    question: 'How do I handle toileting accidents without embarrassing my dad?',
    mustIncludeAny: ['dignity', 'toilet', 'routine', 'accident', 'skin'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'caregiver-burnout',
    question: 'I am exhausted and feeling guilty all the time while caring for my wife. What can I do?',
    mustIncludeAny: ['support', 'respite', 'burnout', 'help', 'health'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'diagnosis-process',
    question: 'What happens during a dementia diagnosis appointment?',
    mustIncludeAny: ['assessment', 'history', 'tests', 'doctor', 'memory'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'reversible-causes',
    question: 'Could confusion be something else and not dementia?',
    mustIncludeAny: ['reversible', 'assessment', 'medical', 'cause', 'doctor'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'legal-planning',
    question: 'When should we sort power of attorney and future care wishes?',
    mustIncludeAny: ['advance', 'planning', 'power of attorney', 'legal', 'early'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'younger-onset',
    question: 'Can someone in their 50s get dementia?',
    mustIncludeAny: ['younger onset', 'under 65', 'support', 'assessment', 'symptoms'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'prevention-risk-factors',
    question: 'What lifestyle changes reduce dementia risk?',
    mustIncludeAny: ['risk', 'exercise', 'blood pressure', 'hearing', 'smoking'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'sleep-disturbance',
    question: 'Dad is up all night and sleeps all day. How can we reset his sleep routine?',
    mustIncludeAny: ['sleep', 'routine', 'daylight', 'activity', 'night'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'swallowing-safety',
    question: 'She coughs while eating and sometimes chokes. What should we do?',
    mustIncludeAny: ['swallow', 'choking', 'speech', 'texture', 'doctor'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'medication-storage',
    question: 'How can I prevent medication mix-ups at home?',
    mustIncludeAny: ['medication', 'safe', 'storage', 'routine', 'doctor'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'kitchen-safety',
    question: 'He forgets the stove is on. How can I make the kitchen safer?',
    mustIncludeAny: ['kitchen', 'safety', 'stove', 'supervision', 'hazard'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'non-recognition',
    question: 'My mum sometimes says I am a stranger. How should I respond?',
    mustIncludeAny: ['reassure', 'calm', 'argue', 'validation', 'emotion'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'urgent-review',
    question: 'There was a sudden big change today with confusion and agitation. When should I seek urgent medical help?',
    mustIncludeAny: ['urgent', 'doctor', 'sudden', 'medical', 'review'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'mobility-transfers',
    question: 'What is the safest way to help someone stand up and transfer from bed to chair?',
    mustIncludeAny: ['transfer', 'mobility', 'safe', 'fall', 'support'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'respite-options',
    question: 'What respite options are there if I need a short break from caring?',
    mustIncludeAny: ['respite', 'support', 'carer', 'services', 'help'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'dementia-medication',
    question: 'What do dementia medicines actually do and what side effects should I watch for?',
    mustIncludeAny: ['medication', 'side effects', 'benefit', 'doctor', 'symptom'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'pain-recognition',
    question: 'How can I tell if my dad is in pain when he cannot explain it clearly?',
    mustIncludeAny: ['pain', 'behaviour', 'sign', 'doctor', 'comfort'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'dementia-types',
    question: 'What is the difference between Alzheimer\'s, vascular dementia, and Lewy body dementia?',
    mustIncludeAny: ['alzheimers', 'vascular', 'lewy', 'type', 'dementia'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'mci-expectations',
    question: 'My mum has mild cognitive impairment. Does that mean it will turn into dementia?',
    mustIncludeAny: ['mild cognitive impairment', 'mci', 'expect', 'assessment', 'symptom'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'verbal-communication',
    question: 'What is the best way to talk to someone with dementia when they get upset?',
    mustIncludeAny: ['calm', 'simple', 'validate', 'short', 'communication'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'nonverbal-communication',
    question: 'How should I use body language and gestures to help my dad understand me?',
    mustIncludeAny: ['body language', 'gesture', 'eye contact', 'non-verbal', 'communication'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'validation-therapy',
    question: 'Someone with dementia keeps insisting they need to go home. Should I correct them?',
    mustIncludeAny: ['validate', 'argue', 'feelings', 'reassure', 'emotion'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'reminiscence-therapy',
    question: 'Are there simple activities or memory prompts that can help my mum feel more engaged?',
    mustIncludeAny: ['reminiscence', 'memory', 'familiar', 'activity', 'life'],
    requireDisclaimer: true,
    minCitations: 1,
  },
];

let casesToRun = TEST_CASES;

if (selectedCaseId) {
  casesToRun = TEST_CASES.filter(c => c.id === selectedCaseId);
}

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
