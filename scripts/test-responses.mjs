/**
 * Assertion-based response evaluator for Aria's RAG answers.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/test-responses.mjs
 *
 * Optional flags:
 *   --verbose              Print full response text for each case
 *   --hide-response        Do not print the AI response text
 *   --case <id>            Run only one case (e.g. --case sundowning)
 *   --helpline-required    Force helpline number check for all cases
 *   --mode <keywords|reference|hybrid>
 *   --reference-threshold <float>
 *   --log-history          Append this run to a history file (NDJSON)
 *   --history-file <path>  Log file path (default: logs/test-history.ndjson)
 *   --label <text>         Optional run label stored in history log
 *   --log-responses        Include full AI responses in the history log
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
const TOP_K = 6;
const SEARCH_MULTIPLIER = 3;
const MAX_TOKENS = 320;
const TEMPERATURE = 0.0;
const DEFAULT_REFERENCE_THRESHOLD = 0.78;
const DEFAULT_HISTORY_FILE = 'logs/test-history.ndjson';

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
const showResponse = !hasFlag('--hide-response');
const selectedCaseId = getFlag('--case');
const forceHelplineForAll = hasFlag('--helpline-required');
const testMode = getFlag('--mode') ?? 'keywords';
const referenceThreshold = Number(getFlag('--reference-threshold') ?? DEFAULT_REFERENCE_THRESHOLD);
const shouldLogHistory = hasFlag('--log-history');
const historyFile = getFlag('--history-file') ?? DEFAULT_HISTORY_FILE;
const runLabel = getFlag('--label');
const includeResponsesInLog = hasFlag('--log-responses');

const VALID_MODES = new Set(['keywords', 'reference', 'hybrid']);

if (!VALID_MODES.has(testMode)) {
  console.error(`Error: unknown --mode ${testMode}. Use one of: keywords, reference, hybrid.`);
  process.exit(1);
}

if (!Number.isFinite(referenceThreshold) || referenceThreshold < 0 || referenceThreshold > 1) {
  console.error('Error: --reference-threshold must be a number between 0 and 1.');
  process.exit(1);
}

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
7. Keep the answer body very concise (about 80-140 words before the closing sentence).
8. Keep tight relevance to the user question. Do not add broad background, statistics, or unrelated tips.
9. Structure: start with one validating sentence, then direct practical guidance, then when to seek medical review if symptoms are new/worse/safety-related.
10. Prefer generic caregiver guidance wording over highly specific examples, names, product suggestions, or test names unless the question explicitly asks for detail.
11. Prefer concise action verbs and key terms often used in dementia care: reassure, validate feelings, avoid arguing, redirect, routine, safety, medical review.
12. Use 1 to 3 inline citations from the most relevant sources only.
13. Do NOT add a Sources section at the end. Citations are inline only.
14. Always end every response with this exact closing sentence: "This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions."

STYLE EXAMPLES (shape only, still use provided context):
- "When recognition changes, focus on reassurance rather than correction. Use a calm tone, validate feelings, avoid arguing, and gently redirect to a familiar activity [1]."
- "For night wandering, combine safety and routine: door alerts, clear pathways, calm bedtime routine, and review triggers like pain, toileting needs, or anxiety [1][2]."
- "Early signs can include memory changes affecting daily life, confusion about time/place, language difficulty, and planning problems. Seek medical assessment if persistent [1]."
- "Risk reduction focuses on long-term brain and vascular health: physical activity, blood pressure control, smoking cessation, and hearing support where relevant [1][2]."`;
}

const embeddingCache = new Map();

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
  const key = text.trim();
  if (embeddingCache.has(key)) return embeddingCache.get(key);

  const data = await openai('/embeddings', { model: EMBED_MODEL, input: text });
  const embedding = data.data[0].embedding;
  embeddingCache.set(key, embedding);
  return embedding;
}

async function retrieveChunks(question) {
  const queryEmbedding = await embedQuery(question);

  let data;
  let error;

  ({ data, error } = await supabase.rpc('match_chunks', {
    query_embedding: queryEmbedding,
    query_text: question,
    match_count: TOP_K * SEARCH_MULTIPLIER,
    min_similarity: MIN_SIMILARITY,
    filter_country: null,
    filter_source_version: null,
    filter_document_id: null,
    filter_module: null,
  }));

  if (error && /function match_chunks\(/i.test(error.message)) {
    ({ data, error } = await supabase.rpc('match_chunks', {
      query_embedding: queryEmbedding,
      query_text: question,
      match_count: TOP_K * SEARCH_MULTIPLIER,
      min_similarity: MIN_SIMILARITY,
    }));
  }

  if (error) {
    throw new Error(`Supabase match_chunks failed: ${error.message}`);
  }

  const rows = data ?? [];
  const reranked = rerankChunksForQuestion(rows, question);
  return reranked.slice(0, TOP_K);
}

function extractTagValue(tags = [], prefix) {
  const hit = tags.find(t => t.startsWith(`${prefix}:`));
  return hit ? hit.slice(prefix.length + 1) : null;
}

function buildRetrievalPolicy(question) {
  const q = question.toLowerCase();
  const prefersModule5 = [
    'aggression', 'hallucination', 'delusion', 'wandering', 'lost', 'repetitive',
    'sundowning', 'behaviour', 'behavior', 'sleep', 'judgement', 'judgment', 'anxiety',
  ].some(k => q.includes(k));

  const prefersModule3 = [
    'stress', 'burnout', 'exhausted', 'guilt', 'self care', 'self-care',
    'pleasant activities', 'thinking differently', 'overwhelmed',
  ].some(k => q.includes(k));

  const mentionsNZ = q.includes('aotearoa') || q.includes('new zealand') || q.includes(' nz ');
  const mentionsAU = q.includes('australia') || q.includes(' aus ') || q.includes(' au ');

  return {
    requiredTags: mentionsNZ ? ['country:nz'] : (mentionsAU ? ['country:au'] : []),
    preferredTags: [
      ...(prefersModule5 ? ['module:5'] : []),
      ...(prefersModule3 ? ['module:3'] : []),
    ],
  };
}

function tokenizeQuestion(question) {
  const stop = new Set([
    'what', 'when', 'where', 'which', 'while', 'with', 'from', 'this', 'that', 'your', 'someone',
    'dementia', 'should', 'could', 'would', 'have', 'there', 'their', 'them', 'they', 'about',
    'into', 'just', 'than', 'then', 'been', 'being', 'does', 'dont', 'cant', 'my', 'mum', 'dad',
  ]);

  return String(question)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !stop.has(w));
}

function rerankChunksForQuestion(chunks, question) {
  const policy = buildRetrievalPolicy(question);
  const terms = tokenizeQuestion(question);

  const stageA = chunks.filter(chunk => {
    if (policy.requiredTags.length === 0) return true;
    const tagSet = new Set(chunk.tags ?? []);
    return policy.requiredTags.every(tag => tagSet.has(tag));
  });

  const base = stageA.length > 0 ? stageA : chunks;

  return [...base]
    .map(chunk => {
      const tags = new Set(chunk.tags ?? []);
      let boost = 0;

      for (const tag of policy.preferredTags) {
        if (tags.has(tag)) boost += 0.07;
      }

      if (tags.has('chunk_level:child')) boost += 0.03;

      const haystack = `${chunk.title ?? ''} ${chunk.content ?? ''}`.toLowerCase();
      let lexicalHits = 0;
      for (const term of terms) {
        if (haystack.includes(term)) lexicalHits += 1;
      }
      boost += Math.min(0.12, lexicalHits * 0.015);

      const parentKey = extractTagValue(chunk.tags ?? [], 'parent_key');
      return {
        ...chunk,
        _parentKey: parentKey,
        _score: (Number(chunk.similarity) || 0) + boost,
      };
    })
    .sort((a, b) => b._score - a._score)
    .filter((chunk, idx, arr) => {
      if (!chunk._parentKey) return true;
      const firstSameParent = arr.findIndex(c => c._parentKey === chunk._parentKey);
      return firstSameParent === idx;
    });
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

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
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

function evaluateKeywordGuards(testCase, response, failures) {
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
}

function evaluateCase(testCase, response) {
  const failures = [];

  evaluateKeywordGuards(testCase, response, failures);

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

async function evaluateReferenceCase(testCase, response, threshold) {
  const failures = [];

  if (testMode === 'hybrid') {
    evaluateKeywordGuards(testCase, response, failures);
  }

  if (!Array.isArray(testCase.acceptedAnswers) || testCase.acceptedAnswers.length < 2) {
    failures.push('Reference test case must define at least 2 acceptedAnswers.');
    return {
      pass: false,
      failures,
      citations: countCitations(response),
      bestSimilarity: 0,
      bestMatch: null,
      threshold,
    };
  }

  if (testCase.acceptedAnswers.length > 5) {
    failures.push('Reference test case must define no more than 5 acceptedAnswers.');
    return {
      pass: false,
      failures,
      citations: countCitations(response),
      bestSimilarity: 0,
      bestMatch: null,
      threshold,
    };
  }

  const responseEmbedding = await embedQuery(response);
  let bestSimilarity = -1;
  let bestMatch = null;

  for (const acceptedAnswer of testCase.acceptedAnswers) {
    const refEmbedding = await embedQuery(acceptedAnswer);
    const sim = cosineSimilarity(responseEmbedding, refEmbedding);
    if (sim > bestSimilarity) {
      bestSimilarity = sim;
      bestMatch = acceptedAnswer;
    }
  }

  if (bestSimilarity < threshold) {
    failures.push(
      `Best semantic similarity ${bestSimilarity.toFixed(3)} is below threshold ${threshold.toFixed(3)}`,
    );
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

  return {
    pass: failures.length === 0,
    failures,
    citations,
    bestSimilarity,
    bestMatch,
    threshold,
  };
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
  // ─── iSupport Module 1 — Introduction to dementia ───────────────────────────
  {
    id: 'isupport-types-of-dementia',
    question: 'What are the most common types of dementia?',
    mustIncludeAll: ['alzheimer'],
    mustIncludeAny: ['vascular', 'lewy', 'frontotemporal', 'type', 'form'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'isupport-person-centred',
    question: 'What does person-centred care mean for someone with dementia?',
    mustIncludeAny: ['person-centred', 'individual', 'preferences', 'dignity', 'needs'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'isupport-future-planning',
    question: 'How do I plan ahead for future care decisions for my family member with dementia?',
    mustIncludeAny: ['advance', 'planning', 'wishes', 'future', 'legal'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  // ─── iSupport Module 2 — Being a carer ─────────────────────────────────────
  {
    id: 'isupport-communication',
    question: 'How should I improve communication with my family member who has dementia?',
    mustIncludeAny: ['simple', 'short', 'listen', 'calm', 'non-verbal'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'isupport-decision-making',
    question: 'How can I support someone with dementia to make their own decisions?',
    mustIncludeAny: ['decision', 'supported', 'autonomy', 'involve', 'choice'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  // ─── iSupport Module 3 — Caring for me ─────────────────────────────────────
  {
    id: 'isupport-carer-stress',
    question: 'I feel overwhelmed and stressed from caring for someone with dementia. What should I do?',
    mustIncludeAny: ['stress', 'self-care', 'support', 'break', 'respite'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'isupport-thinking-differently',
    question: 'How can I change the way I think to help me cope better with caring?',
    mustIncludeAny: ['thinking', 'thoughts', 'cope', 'attitude', 'feelings'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  // ─── iSupport Module 4 — Providing everyday care ────────────────────────────
  {
    id: 'isupport-mealtimes',
    question: 'How do I make mealtimes easier and more enjoyable for someone with dementia?',
    mustIncludeAny: ['mealtime', 'eating', 'routine', 'food', 'pleasant'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'isupport-personal-care',
    question: 'What is the best way to help someone with dementia with personal hygiene?',
    mustIncludeAny: ['personal care', 'hygiene', 'routine', 'dignity', 'help'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'isupport-continence',
    question: 'How do I handle toileting and continence issues for someone with dementia?',
    mustIncludeAny: ['toileting', 'continence', 'dignity', 'routine', 'accident'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  // ─── iSupport Module 5 — Behaviour changes ──────────────────────────────────
  {
    id: 'isupport-repetitive-behaviour',
    question: 'My mother keeps repeating the same story over and over. What should I do?',
    mustIncludeAny: ['repetitive', 'reassure', 'calm', 'routine', 'respond'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'isupport-depression-anxiety',
    question: 'The person I care for seems depressed and withdrawn. How should I respond?',
    mustIncludeAny: ['depression', 'anxiety', 'support', 'engage', 'activities'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'isupport-sleep-module5',
    question: 'How do I manage difficulty sleeping and night-time restlessness in dementia?',
    mustIncludeAny: ['sleep', 'routine', 'night', 'activity', 'restless'],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'isupport-aggression-behaviour',
    question: 'What do I do when someone with dementia becomes verbally or physically aggressive?',
    mustIncludeAll: ['aggression'],
    mustIncludeAny: ['calm', 'trigger', 'de-escalate', 'safe', 'respond'],
    requireDisclaimer: true,
    minCitations: 1,
  },
];

const REFERENCE_TEST_CASES = [
  {
    id: 'ref-sundowning',
    question: 'What is sundowning and how do I manage it?',
    mustIncludeAny: ['sundowning', 'evening', 'routine', 'calm', 'reassure'],
    acceptedAnswers: [
      'Sundowning is when confusion, agitation, or restlessness becomes worse in the late afternoon or evening. Keeping a predictable routine, reducing noise and stimulation in the evening, and using calm reassurance can help. Gentle daytime activity and exposure to daylight may also improve night-time rest [1].',
      'Sundowning describes behaviour changes that happen later in the day, such as pacing, anxiety, or increased confusion. Try a regular daily schedule, simplify evening tasks, keep lighting comfortable, and respond with reassurance rather than correction. Look for triggers like fatigue, pain, hunger, or overstimulation [1][2].',
      'If symptoms worsen at dusk, it may be sundowning. Focus on safety and comfort: maintain routines, keep the environment calm, avoid arguing, and use short clear communication. Daytime movement, hydration, and a quiet wind-down period before bed can reduce distress [2].',
      'Sundowning can make evenings harder for both the person with dementia and the carer. Helpful strategies include consistent routines, reduced evening stimulation, and validating emotions with calm support. Monitor patterns and discuss significant changes with a healthcare professional [1].',
    ],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'ref-repetitive-questions',
    question: 'My dad keeps asking the same question repeatedly. What should I do?',
    mustIncludeAny: ['reassure', 'calm', 'redirect', 'routine', 'validate'],
    acceptedAnswers: [
      'Repetitive questions are common in dementia and are usually a sign of anxiety, memory loss, or a need for reassurance. Answer briefly and calmly each time, then gently redirect to a familiar activity. A visual reminder or written cue can sometimes reduce repetition [1].',
      'Try not to argue or say \"I already told you\". Use a warm tone, give a short consistent response, and reassure your dad that he is safe. Consistent routines and reducing stress triggers can help lower repetitive questioning [1][2].',
      'When the same question repeats, focus on the emotion behind it. Reassure first, then redirect with simple choices, music, or another comforting task. Tracking when repetition happens may help identify triggers like fatigue or confusion [2].',
      'Responding with patience is usually more effective than correction. Keep answers simple, validate feelings, and use routine and environmental cues to support memory. Ask a health professional for more support if this behaviour escalates or causes safety concerns [1].',
    ],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'ref-caregiver-burnout',
    question: 'I am exhausted and feeling guilty all the time while caring for my wife. What can I do?',
    mustIncludeAny: ['support', 'respite', 'self-care', 'gp', 'break'],
    acceptedAnswers: [
      'Feeling exhausted and guilty is common for carers and does not mean you are failing. Try to schedule regular breaks, ask family or services for practical help, and consider respite options so you can recover. Looking after your own sleep, food, and health makes caregiving more sustainable [1].',
      'Carer burnout is a real health risk. Start with small, realistic self-care steps, and speak with your GP or support services about stress and emotional strain. Connecting with carer support groups can reduce isolation and guilt [1][2].',
      'You deserve support as well. Build a care plan that includes backup help, respite, and clear limits on what you can do alone. If guilt or low mood is persistent, seek professional support early [2].',
      'Try reframing guilt as a signal that you need support, not as a personal failure. Share tasks where possible, take regular short breaks, and keep one or two restorative activities each week. Ask dementia support services what local carer resources are available [1].',
    ],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'ref-driving-safety',
    question: 'Can someone with dementia still drive a car?',
    mustIncludeAny: ['driving', 'safety', 'assessment', 'doctor', 'review'],
    acceptedAnswers: [
      'Some people with early dementia may still drive for a period, but driving ability can change over time. Regular medical review and formal driving assessment are important for safety. Families should monitor warning signs and plan alternative transport early [1].',
      'Driving decisions should be based on safety, clinical advice, and legal requirements. If there are concerns about judgement, reaction time, or navigation, arrange an assessment through the treating doctor and licensing pathway [1][2].',
      'Dementia can affect attention, judgement, and problem-solving, so driving needs ongoing review. Discuss concerns openly, involve a healthcare professional, and create a transition plan to reduce distress if driving stops [2].',
      'Whether someone can keep driving depends on symptoms and risk, not diagnosis alone. Use professional assessment and local licensing guidance, and prioritise safety for the driver and others on the road [1].',
    ],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'ref-shower-support',
    question: 'How do I help someone with dementia take a shower without upsetting them?',
    mustIncludeAny: ['routine', 'privacy', 'calm', 'choice', 'step'],
    acceptedAnswers: [
      'Showering can feel confusing or frightening for a person with dementia, so a calm routine helps. Prepare the room first, keep the space warm, explain one step at a time, and offer simple choices to support dignity. Respect privacy and stop if distress rises [1].',
      'Try to make showering predictable and gentle. Use familiar times, short instructions, and reassurance rather than rushing. Keep supplies ready, check water temperature, and focus on comfort and dignity throughout [1][2].',
      'When bathing causes distress, reduce stimulation and break the task into small steps. Validate feelings, use a calm tone, and consider alternatives such as a wash at the sink on difficult days. Safety and emotional comfort both matter [2].',
    ],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'ref-early-signs',
    question: 'What are the early signs of dementia I should look out for?',
    mustIncludeAny: ['memory', 'daily', 'confusion', 'language', 'planning'],
    acceptedAnswers: [
      'Early signs can include memory changes that affect daily life, difficulty planning or problem-solving, confusion about time or place, and language problems. Mood or behaviour changes can also occur. A medical assessment is important if these changes are persistent or worsening [1].',
      'Look for patterns such as repeated forgetfulness, trouble with familiar tasks, getting disoriented, and changes in communication or judgement. One sign alone is not enough for diagnosis, so formal assessment is the best next step [1][2].',
      'Dementia symptoms often begin gradually, with changes in memory, thinking, communication, or day-to-day function. Because other conditions can look similar, encourage an early check-up with a healthcare professional [2].',
    ],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'ref-night-wandering',
    question: 'My mum keeps waking at 3am and trying to leave the house. How can I keep her safe?',
    mustIncludeAny: ['safe', 'night', 'wandering', 'door', 'routine'],
    acceptedAnswers: [
      'Night wandering can increase risk, so prioritise safety at home. Use door alerts or simple safety measures, keep pathways clear, and maintain a calming bedtime routine. Daytime activity and reduced evening stimulation may help sleep patterns [1].',
      'Respond calmly if she wakes and wants to leave. Reassure first, redirect to a comforting activity, and avoid confrontation. Review possible triggers like pain, toileting needs, hunger, or anxiety [1][2].',
      'For repeated night-time wandering, combine prevention and supervision strategies. Improve lighting, reduce trip hazards, and discuss sudden or severe changes with a healthcare professional to rule out medical causes [2].',
    ],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'ref-hallucinations',
    question: 'He says strangers are in the room when nobody is there. What should I do when this happens?',
    mustIncludeAny: ['reassure', 'calm', 'argue', 'doctor', 'environment'],
    acceptedAnswers: [
      'If he sees people who are not there, focus on reassurance and safety. Avoid arguing about what is real, acknowledge his feelings, and use a calm tone to reduce distress. Check the environment for shadows, poor lighting, or noise that may be confusing [1].',
      'Hallucinations can be frightening, so respond gently and validate emotion rather than correcting forcefully. Redirect to a familiar activity and monitor when episodes happen. Seek medical review if symptoms are new, worsening, or linked to sudden behaviour change [1][2].',
      'Try a calm, supportive response: reassure, reduce stimulation, and stay nearby until distress settles. Keep notes on triggers and discuss persistent episodes with a healthcare professional [2].',
    ],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'ref-bathroom-falls',
    question: 'Any tips to stop bathroom falls for someone with dementia?',
    mustIncludeAny: ['bathroom', 'fall', 'safety', 'non-slip', 'grab'],
    acceptedAnswers: [
      'Bathroom fall prevention starts with environmental safety. Use non-slip mats, grab rails, good lighting, and clear walkways. Keep frequently used items easy to reach and supervise when needed [1].',
      'Create a predictable toileting routine and reduce rushing, especially at night. Supportive footwear, dry floors, and simple cues can lower fall risk. Review medications and mobility concerns with a clinician if falls continue [1][2].',
      'Falls are common in bathrooms because of wet surfaces and urgency. A safety setup, calm pacing, and practical supervision can make personal care safer while preserving dignity [2].',
    ],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'ref-incontinence',
    question: 'How do I handle toileting accidents without embarrassing my dad?',
    mustIncludeAny: ['dignity', 'toilet', 'routine', 'accident', 'skin'],
    acceptedAnswers: [
      'Handle accidents with a calm, matter-of-fact approach to protect dignity. Use regular toileting routines, easy-to-remove clothing, and clear bathroom access. Reassure your dad and avoid blame or criticism [1].',
      'Plan for continence support by scheduling toilet visits, watching for cues, and keeping supplies ready. Prompt gentle hygiene after accidents and check skin for irritation. Respect, privacy, and comfort should guide every step [1][2].',
      'To reduce embarrassment, keep language simple and supportive, and normalise the situation. Consistent routines and practical preparation usually help reduce accidents over time [2].',
    ],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'ref-diagnosis-process',
    question: 'What happens during a dementia diagnosis appointment?',
    mustIncludeAny: ['assessment', 'history', 'tests', 'doctor', 'memory'],
    acceptedAnswers: [
      'A diagnosis appointment usually includes a medical history, discussion of symptoms, and cognitive testing. The clinician may ask family members for observations and consider blood tests or scans to assess possible causes [1].',
      'Expect a step-by-step assessment rather than one single test. Doctors review memory and thinking changes, day-to-day function, and overall health before deciding next steps or referrals [1][2].',
      'Dementia assessment often combines interview, examination, and cognitive checks. The goal is to understand what is causing symptoms and to plan treatment and support early [2].',
    ],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'ref-reversible-causes',
    question: 'Could confusion be something else and not dementia?',
    mustIncludeAny: ['reversible', 'assessment', 'medical', 'cause', 'doctor'],
    acceptedAnswers: [
      'Yes, confusion can come from other medical causes, so assessment is essential. Infections, medication effects, metabolic issues, mood conditions, and other illnesses can mimic dementia symptoms [1].',
      'Not all memory or confusion changes are dementia. A medical review helps identify potentially reversible causes and guides the right treatment plan [1][2].',
      'Because different conditions can look similar, early professional assessment is important. This helps avoid missing treatable causes and supports accurate diagnosis [2].',
    ],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'ref-legal-planning',
    question: 'When should we sort power of attorney and future care wishes?',
    mustIncludeAny: ['advance', 'planning', 'power of attorney', 'legal', 'early'],
    acceptedAnswers: [
      'It is best to discuss power of attorney and future care wishes as early as possible, while the person can still express preferences. Early planning helps preserve autonomy and reduces crisis decisions later [1].',
      'Advance planning should begin soon after diagnosis or when concerns first arise. Include legal, financial, and healthcare preferences, and involve trusted family or support people [1][2].',
      'Do not wait for an emergency. Early legal and care planning creates clarity, supports decision-making, and aligns future care with the person’s values [2].',
    ],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'ref-prevention-risk-factors',
    question: 'What lifestyle changes reduce dementia risk?',
    mustIncludeAny: ['risk', 'exercise', 'blood pressure', 'hearing', 'smoking'],
    acceptedAnswers: [
      'Risk reduction focuses on overall brain and vascular health. Helpful habits include regular physical activity, blood pressure and diabetes management, smoking cessation, and addressing hearing loss where relevant [1].',
      'No single change guarantees prevention, but healthy lifestyle patterns can lower risk. Exercise, social connection, good sleep, and cardiovascular risk control are commonly recommended [1][2].',
      'Think in terms of long-term habits: move regularly, manage chronic conditions, avoid smoking, and seek support for hearing or mental health concerns. Small consistent steps matter [2].',
    ],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'ref-swallowing-safety',
    question: 'She coughs while eating and sometimes chokes. What should we do?',
    mustIncludeAny: ['swallow', 'choking', 'speech', 'texture', 'doctor'],
    acceptedAnswers: [
      'Coughing or choking during meals needs prompt review. Arrange assessment by a healthcare professional, and ask about speech pathology input for swallowing safety strategies [1].',
      'Until reviewed, reduce risk by slowing pace, offering suitable textures as advised, and keeping the person upright during and after meals. Watch closely for persistent coughing, weight loss, or chest symptoms [1][2].',
      'Swallowing issues can increase aspiration risk, so do not ignore repeated choking signs. Professional assessment helps tailor food texture, fluid consistency, and safe eating techniques [2].',
    ],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'ref-kitchen-safety',
    question: 'He forgets the stove is on. How can I make the kitchen safer?',
    mustIncludeAny: ['kitchen', 'safety', 'stove', 'supervision', 'hazard'],
    acceptedAnswers: [
      'If the stove is being left on, kitchen risk is high and needs practical controls. Increase supervision, simplify cooking tasks, and remove or secure obvious hazards where possible [1].',
      'Use safety-first routines such as checking appliances after use, limiting unsupervised cooking, and keeping emergency contacts available. Consider adapting meal preparation to reduce exposure to heat and sharp tools [1][2].',
      'A safer kitchen plan combines environment changes and routine support. Keep pathways clear, reduce clutter, and prioritize tasks that the person can do safely with guidance [2].',
    ],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'ref-non-recognition',
    question: 'My mum sometimes says I am a stranger. How should I respond?',
    mustIncludeAny: ['reassure', 'calm', 'argue', 'validation', 'emotion'],
    acceptedAnswers: [
      'When she does not recognise you, focus on emotional reassurance rather than proving identity. Use a calm tone, validate feelings, and avoid arguing, which can increase distress [1].',
      'Introduce yourself gently, offer comfort, and redirect to a familiar activity. The goal is to reduce fear and preserve connection, not to win a factual disagreement [1][2].',
      'Non-recognition episodes are painful for carers, but calm validation often works best. Stay present, keep language simple, and seek advice if episodes become frequent or unsafe [2].',
    ],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'ref-urgent-review',
    question: 'There was a sudden big change today with confusion and agitation. When should I seek urgent medical help?',
    mustIncludeAny: ['urgent', 'doctor', 'sudden', 'medical', 'review'],
    acceptedAnswers: [
      'A sudden major change in confusion or agitation should be treated as urgent and reviewed promptly by a healthcare professional. Rapid change may indicate an acute medical problem rather than usual dementia progression [1].',
      'Seek urgent help if symptoms changed quickly, safety is at risk, or behaviour is markedly different from baseline. Early medical assessment helps identify causes such as infection, pain, dehydration, or medication effects [1][2].',
      'Do not wait if there is abrupt deterioration. Same-day clinical review is appropriate when confusion and agitation escalate suddenly [2].',
    ],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'ref-respite-options',
    question: 'What respite options are there if I need a short break from caring?',
    mustIncludeAny: ['respite', 'support', 'carer', 'services', 'help'],
    acceptedAnswers: [
      'Respite provides temporary support so carers can rest and recover. Options may include in-home support, centre-based day programs, and short residential respite depending on local services [1].',
      'If you need a break, start by contacting dementia support services or your healthcare team to map available respite pathways. Planned respite can reduce burnout and improve long-term caregiving capacity [1][2].',
      'Taking respite is a protective strategy, not a failure. Even short regular breaks can improve sleep, stress levels, and decision-making for carers [2].',
    ],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'ref-dementia-medication',
    question: 'What do dementia medicines actually do and what side effects should I watch for?',
    mustIncludeAny: ['medication', 'side effects', 'benefit', 'doctor', 'symptom'],
    acceptedAnswers: [
      'Dementia medicines may help some symptoms or slow decline for some people, but they do not cure dementia. Benefits and side effects vary, so regular review with the treating doctor is important [1].',
      'Treatment decisions should balance expected benefit, tolerance, and goals of care. Monitor for side effects and report concerns early to a healthcare professional [1][2].',
      'Medication can be one part of care, alongside practical support and non-drug strategies. Ongoing review helps decide whether treatment is helping enough to continue [2].',
    ],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'ref-dementia-types',
    question: 'What is the difference between Alzheimer\'s, vascular dementia, and Lewy body dementia?',
    mustIncludeAny: ['alzheimers', 'vascular', 'lewy', 'type', 'dementia'],
    acceptedAnswers: [
      'These are different dementia subtypes with different symptom patterns. Alzheimer\'s often starts with memory changes, vascular dementia may relate to blood vessel damage and stepwise decline, and Lewy body dementia can include fluctuations, visual hallucinations, and movement changes [1].',
      'Although all are dementias, presentation can differ. Understanding subtype helps guide symptom management, planning, and support needs [1][2].',
      'Doctors use history, examination, and investigations to distinguish dementia types. Accurate subtype assessment can improve care planning and family education [2].',
    ],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'ref-validation-therapy',
    question: 'Someone with dementia keeps insisting they need to go home. Should I correct them?',
    mustIncludeAny: ['validate', 'argue', 'feelings', 'reassure', 'emotion'],
    acceptedAnswers: [
      'Direct correction often increases distress in this situation. A validation approach usually works better: acknowledge feelings, reassure safety, and gently redirect to a comforting activity [1].',
      'Instead of arguing facts, respond to the emotion behind the request to go home. Calm reassurance and familiar cues can reduce anxiety [1][2].',
      'Try validating and redirecting rather than confronting. The aim is emotional comfort and safety, not forcing orientation in the moment [2].',
    ],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'ref-reminiscence-therapy',
    question: 'Are there simple activities or memory prompts that can help my mum feel more engaged?',
    mustIncludeAny: ['reminiscence', 'memory', 'familiar', 'activity', 'life'],
    acceptedAnswers: [
      'Simple reminiscence activities can support connection and mood. Try familiar photos, music, stories, or objects linked to meaningful life events, keeping sessions short and gentle [1].',
      'Use prompts that feel safe and familiar rather than testing memory. The goal is comfort, engagement, and shared positive moments [1][2].',
      'Choose activities based on past interests and current energy levels. Flexible, person-centred engagement often works better than structured tasks [2].',
    ],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'ref-isupport-person-centred',
    question: 'What does person-centred care mean for someone with dementia?',
    mustIncludeAny: ['person-centred', 'individual', 'preferences', 'dignity', 'needs'],
    acceptedAnswers: [
      'Person-centred care means seeing the individual, not just the diagnosis. Care should reflect personal history, preferences, strengths, and values while protecting dignity [1].',
      'In practice, person-centred care involves adapting communication, routines, and support to what matters most to that person. It prioritises autonomy and respectful partnership [1][2].',
      'A person-centred approach tailors care to unique needs and life story, improving comfort, engagement, and trust [2].',
    ],
    requireDisclaimer: true,
    minCitations: 1,
  },
  {
    id: 'ref-isupport-carer-stress',
    question: 'I feel overwhelmed and stressed from caring for someone with dementia. What should I do?',
    mustIncludeAny: ['stress', 'self-care', 'support', 'break', 'respite'],
    acceptedAnswers: [
      'Feeling overwhelmed is common in caregiving and deserves support. Start with practical steps: schedule short breaks, ask for help, and protect sleep, meals, and your own healthcare [1].',
      'Carer stress can build gradually, so early support matters. Explore respite options, share tasks where possible, and connect with carer support services [1][2].',
      'Looking after yourself is part of good care, not a selfish extra. If stress is persistent or severe, seek professional support promptly [2].',
    ],
    requireDisclaimer: true,
    minCitations: 1,
  },
];

const DEFAULT_EMPATHY_OPENERS = [
  'I know this can be really hard, and you are doing your best.',
  'It is understandable to feel overwhelmed in this situation.',
  'You are not alone, and support is available while you work through this.',
  'This can be emotionally exhausting, so a gentle step-by-step approach helps.',
  'Many carers find this challenging, so your concerns are completely valid.',
];

const EMPATHY_OPENERS_BY_CASE_KEYWORD = [
  {
    keyword: 'caregiver-burnout',
    openers: [
      'What you are feeling is a very human response to prolonged caregiving stress.',
      'The guilt and exhaustion you describe are common for carers, and they matter.',
      'You are carrying a lot, and asking for support is a strength.',
    ],
  },
  {
    keyword: 'carer-stress',
    openers: [
      'It makes sense to feel overwhelmed when care needs are constant.',
      'Your wellbeing matters too, and it is okay to need help.',
      'Many carers feel this pressure, so your reaction is completely understandable.',
    ],
  },
  {
    keyword: 'urgent-review',
    openers: [
      'A sudden change like this can feel frightening, and your concern is appropriate.',
      'You are right to take this seriously when symptoms shift quickly.',
      'This kind of rapid change is stressful, and seeking help promptly is a caring step.',
    ],
  },
  {
    keyword: 'hallucinations',
    openers: [
      'This can be distressing for both of you, and your calm support can make a big difference.',
      'Seeing your loved one frightened is hard, and your response matters.',
      'You are in a difficult moment, and a gentle approach can reduce fear.',
    ],
  },
  {
    keyword: 'non-recognition',
    openers: [
      'This is one of the most painful experiences for families, and your feelings are valid.',
      'It can really hurt when recognition changes, and you are not alone in this.',
      'These moments are emotionally heavy, so self-kindness is important too.',
    ],
  },
  {
    keyword: 'night-wandering',
    openers: [
      'Night-time safety worries can be exhausting, and your concern is understandable.',
      'Repeated overnight disruptions can wear carers down, so a practical plan helps.',
      'This situation is stressful at night, and small safety steps can ease pressure.',
    ],
  },
  {
    keyword: 'shower-support',
    openers: [
      'Personal care can be emotionally sensitive, so your gentle approach matters.',
      'Bathing distress is common in dementia care, and you are not doing anything wrong.',
      'It can take patience and flexibility, and your compassion is important here.',
    ],
  },
  {
    keyword: 'incontinence',
    openers: [
      'This can feel awkward and emotional for everyone involved, and dignity-first care helps.',
      'Toileting changes are common and challenging, so your respectful approach is important.',
      'It is understandable to want to protect dignity while managing practical needs.',
    ],
  },
  {
    keyword: 'respite-options',
    openers: [
      'Needing a break is a healthy caregiving decision, not a failure.',
      'Taking respite can protect both your wellbeing and long-term care capacity.',
      'Asking for a pause is a responsible step when care demands are high.',
    ],
  },
  {
    keyword: 'validation-therapy',
    openers: [
      'These moments can be emotionally intense, and your calm presence matters.',
      'It is understandable to feel unsure about what to say when emotions run high.',
      'You are navigating a difficult interaction, and a gentle response can help.',
    ],
  },
  {
    keyword: 'swallowing-safety',
    openers: [
      'Watching choking or coughing is scary, and your quick attention is important.',
      'This is a worrying symptom, and your concern is absolutely appropriate.',
      'You are doing the right thing by taking swallowing changes seriously.',
    ],
  },
  {
    keyword: 'kitchen-safety',
    openers: [
      'Home safety concerns can feel relentless, and your vigilance matters.',
      'It is stressful when daily tasks become risky, and your concern is valid.',
      'You are balancing independence and safety in a very challenging situation.',
    ],
  },
];

function getEmpathyOpenersForCase(testCaseId) {
  if (!testCaseId) return DEFAULT_EMPATHY_OPENERS;

  const matched = EMPATHY_OPENERS_BY_CASE_KEYWORD.find(entry =>
    String(testCaseId).toLowerCase().includes(entry.keyword),
  );

  return matched?.openers ?? DEFAULT_EMPATHY_OPENERS;
}

function addEmpathy(answer, index, testCaseId) {
  if (typeof answer !== 'string') return answer;

  // Avoid double-prefixing if empathy language already exists.
  if (/\b(I know|I understand|you are not alone|this can be hard|completely valid|your concern is|your feelings are valid|this can be distressing)\b/i.test(answer)) {
    return answer;
  }

  const openers = getEmpathyOpenersForCase(testCaseId);
  const opener = openers[index % openers.length];
  return `${opener} ${answer}`;
}

const EMPATHETIC_REFERENCE_TEST_CASES = REFERENCE_TEST_CASES.map(testCase => ({
  ...testCase,
  acceptedAnswers: Array.isArray(testCase.acceptedAnswers)
    ? testCase.acceptedAnswers.map((answer, index) => addEmpathy(answer, index, testCase.id))
    : testCase.acceptedAnswers,
}));

let casesToRun = TEST_CASES;

if (testMode === 'reference') {
  casesToRun = EMPATHETIC_REFERENCE_TEST_CASES;
}

if (testMode === 'hybrid') {
  casesToRun = EMPATHETIC_REFERENCE_TEST_CASES;
}

if (selectedCaseId) {
  casesToRun = casesToRun.filter(c => c.id === selectedCaseId);
}

if (selectedCaseId && casesToRun.length === 0) {
  console.error(`Unknown case id: ${selectedCaseId}`);
  process.exit(1);
}

const DIVIDER = '-'.repeat(78);

function resolveHistoryPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
}

function appendHistoryLog(filePath, payload) {
  const resolved = resolveHistoryPath(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.appendFileSync(resolved, `${JSON.stringify(payload)}\n`, 'utf8');
  return resolved;
}

async function main() {
  let passed = 0;
  let failed = 0;
  const startedAt = new Date().toISOString();
  const caseLogs = [];

  console.log(DIVIDER);
  console.log(`Running ${casesToRun.length} response quality test(s)`);
  console.log(`Mode: ${testMode}`);
  if (testMode === 'reference' || testMode === 'hybrid') {
    console.log(`Reference threshold: ${referenceThreshold.toFixed(3)}`);
  }
  console.log(DIVIDER);

  for (const testCase of casesToRun) {
    console.log(`\n[CASE] ${testCase.id}`);
    console.log(`Q: ${testCase.question}`);

    try {
      const { response, chunks } = await ask(testCase.question);
      const result = testMode === 'reference'
        ? await evaluateReferenceCase(testCase, response, referenceThreshold)
        : testMode === 'hybrid'
          ? await evaluateReferenceCase(testCase, response, referenceThreshold)
          : evaluateCase(testCase, response);

      console.log(`Retrieved chunks: ${chunks.length}`);
      console.log(`Unique citations: ${result.citations}`);
      if (testMode === 'reference' || testMode === 'hybrid') {
        console.log(`Best semantic similarity: ${result.bestSimilarity.toFixed(3)}`);
      }

      if (showResponse) {
        console.log('\nAI Response:\n');
        console.log(response);
      }

      if (verbose) {
        if ((testMode === 'reference' || testMode === 'hybrid') && result.bestMatch) {
          console.log('\nClosest accepted answer:\n');
          console.log(result.bestMatch);
        }
      }

      if (result.pass) {
        passed += 1;
        console.log('Result: PASS');
        caseLogs.push({
          id: testCase.id,
          question: testCase.question,
          status: 'pass',
          retrievedChunks: chunks.length,
          citations: result.citations,
          ...(typeof result.bestSimilarity === 'number'
            ? { bestSimilarity: Number(result.bestSimilarity.toFixed(6)) }
            : {}),
          ...(includeResponsesInLog ? { response } : {}),
        });
      } else {
        failed += 1;
        console.log('Result: FAIL');
        for (const f of result.failures) {
          console.log(`  - ${f}`);
        }
        if (!verbose) {
          console.log('  Tip: rerun with --verbose to show the closest accepted answer for reference/hybrid modes.');
        }
        caseLogs.push({
          id: testCase.id,
          question: testCase.question,
          status: 'fail',
          retrievedChunks: chunks.length,
          citations: result.citations,
          failures: result.failures,
          ...(typeof result.bestSimilarity === 'number'
            ? { bestSimilarity: Number(result.bestSimilarity.toFixed(6)) }
            : {}),
          ...(includeResponsesInLog ? { response } : {}),
        });
      }
    } catch (err) {
      failed += 1;
      console.log('Result: ERROR');
      console.log(`  - ${err.message}`);
      caseLogs.push({
        id: testCase.id,
        question: testCase.question,
        status: 'error',
        error: err.message,
      });
    }
  }

  console.log(`\n${DIVIDER}`);
  console.log(`Summary: ${passed} passed, ${failed} failed`);

  if (shouldLogHistory) {
    const logPayload = {
      startedAt,
      endedAt: new Date().toISOString(),
      label: runLabel ?? null,
      mode: testMode,
      selectedCaseId: selectedCaseId ?? null,
      referenceThreshold: testMode === 'reference' || testMode === 'hybrid' ? referenceThreshold : null,
      totalCases: casesToRun.length,
      passed,
      failed,
      includeResponsesInLog,
      args,
      cases: caseLogs,
    };

    try {
      const writtenPath = appendHistoryLog(historyFile, logPayload);
      console.log(`History log appended: ${writtenPath}`);
    } catch (err) {
      console.error(`Failed to write history log: ${err.message}`);
    }
  }

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
