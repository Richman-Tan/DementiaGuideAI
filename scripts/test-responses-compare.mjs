#!/usr/bin/env node

/**
 * Compares OpenAI (gpt-4o-mini) against Claude for the same RAG-retrieved
 * context, so the two providers are judged on generation quality only —
 * retrieval, system prompt, and evaluation method are held constant.
 *
 * Usage:
 *   node scripts/test-responses-compare.mjs
 *   node scripts/test-responses-compare.mjs --case sundowning --verbose
 *   node scripts/test-responses-compare.mjs --log-history --label "opus vs 4o-mini"
 *
 * Requires in .env: OPENAI_API_KEY, ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional flags:
 *   --case <id>            Run only one case
 *   --verbose               Print both full responses
 *   --claude-model <id>     Override the Claude model (default: claude-opus-4-8)
 *   --reference-threshold   Semantic similarity pass threshold (default 0.78)
 *   --log-history           Append this run to logs/test-history.ndjson (mode: "compare")
 *   --history-file <path>   Log file path
 *   --label <text>          Optional run label
 *   --log-responses         Include full response text in the history log
 */

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
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
const OPENAI_CHAT_MODEL = 'gpt-4o-mini';
const MIN_SIMILARITY = 0.35;
const TOP_K = 6;
const SEARCH_MULTIPLIER = 3;
const MAX_TOKENS = 320;
const DEFAULT_REFERENCE_THRESHOLD = 0.78;
const DEFAULT_HISTORY_FILE = 'logs/test-history.ndjson';
const DEFAULT_CLAUDE_MODEL = 'claude-opus-4-8';

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const getFlag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const verbose = hasFlag('--verbose');
const selectedCaseId = getFlag('--case');
const claudeModel = getFlag('--claude-model') ?? process.env.CLAUDE_COMPARE_MODEL ?? DEFAULT_CLAUDE_MODEL;
const referenceThreshold = Number(getFlag('--reference-threshold') ?? DEFAULT_REFERENCE_THRESHOLD);
const shouldLogHistory = hasFlag('--log-history');
const historyFile = getFlag('--history-file') ?? DEFAULT_HISTORY_FILE;
const runLabel = getFlag('--label');
const includeResponsesInLog = hasFlag('--log-responses');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY environment variable is not set.');
  process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY environment variable is not set. Add it to .env to run the comparison.');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// Identical wording to src/services/openaiService.js / scripts/test-responses.mjs —
// both providers are graded against the same instructions.
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
14. Always end every response with this exact closing sentence: "This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions."`;
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

function buildContextBlock(chunks) {
  if (chunks.length === 0) {
    return '[CONTEXT]\nNo specific knowledge base entries matched this query.\n[/CONTEXT]';
  }
  const lines = chunks.map((c, i) => `--- Source [${i + 1}] | ${c.title} ---\n${c.content}`);
  return `[CONTEXT]\n${lines.join('\n\n')}\n[/CONTEXT]`;
}

async function askOpenAI(question, contextBlock) {
  const start = Date.now();
  const data = await openai('/chat/completions', {
    model: OPENAI_CHAT_MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0.0,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: `${contextBlock}\n\nUser question: ${question}` },
    ],
  });
  const response = data.choices?.[0]?.message?.content?.trim() ?? '';
  return { response, latencyMs: Date.now() - start };
}

async function askClaude(question, contextBlock) {
  const start = Date.now();
  const message = await anthropic.messages.create({
    model: claudeModel,
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt(),
    messages: [
      { role: 'user', content: `${contextBlock}\n\nUser question: ${question}` },
    ],
  });
  const response = message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
    .trim();
  return { response, latencyMs: Date.now() - start };
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

function countCitations(text) {
  const nums = new Set();
  const regex = /\[(\d+)\]/g;
  let m;
  while ((m = regex.exec(text)) !== null) nums.add(Number(m[1]));
  return nums.size;
}

function hasDisclaimer(text) {
  const hasGuidanceOnly = /guidance only/i.test(text);
  const hasHealthcareProfessional = /healthcare professional/i.test(text);
  const hasHelpline = /1800\s*100\s*500/.test(text) || /dementia\s*australia/i.test(text);
  return (hasGuidanceOnly && hasHealthcareProfessional) || hasHelpline;
}

async function evaluateAgainstReferences(response, acceptedAnswers, threshold) {
  const responseEmbedding = await embedQuery(response);
  let bestSimilarity = -1;
  let bestMatch = null;

  for (const acceptedAnswer of acceptedAnswers) {
    const refEmbedding = await embedQuery(acceptedAnswer);
    const sim = cosineSimilarity(responseEmbedding, refEmbedding);
    if (sim > bestSimilarity) {
      bestSimilarity = sim;
      bestMatch = acceptedAnswer;
    }
  }

  return {
    bestSimilarity,
    bestMatch,
    pass: bestSimilarity >= threshold,
    citations: countCitations(response),
    disclaimerOk: hasDisclaimer(response),
  };
}

// Curated subset spanning safety-critical, emotional-support, factual, and
// unknown-domain question types — small enough to run cheaply on every
// comparison pass, wide enough to be representative of the full suite.
const COMPARE_CASES = [
  {
    id: 'sundowning',
    question: 'What is sundowning and how do I manage it?',
    acceptedAnswers: [
      'Sundowning is when confusion, agitation, or restlessness becomes worse in the late afternoon or evening. Keeping a predictable routine, reducing noise and stimulation in the evening, and using calm reassurance can help. Gentle daytime activity and exposure to daylight may also improve night-time rest [1].',
      'Sundowning describes behaviour changes that happen later in the day, such as pacing, anxiety, or increased confusion. Try a regular daily schedule, simplify evening tasks, keep lighting comfortable, and respond with reassurance rather than correction. Look for triggers like fatigue, pain, hunger, or overstimulation [1][2].',
      'If symptoms worsen at dusk, it may be sundowning. Focus on safety and comfort: maintain routines, keep the environment calm, avoid arguing, and use short clear communication. Daytime movement, hydration, and a quiet wind-down period before bed can reduce distress [2].',
    ],
  },
  {
    id: 'repetitive-questions',
    question: 'My dad keeps asking the same question repeatedly. What should I do?',
    acceptedAnswers: [
      'Repetitive questions are common in dementia and are usually a sign of anxiety, memory loss, or a need for reassurance. Answer briefly and calmly each time, then gently redirect to a familiar activity. A visual reminder or written cue can sometimes reduce repetition [1].',
      'Try not to argue or say "I already told you". Use a warm tone, give a short consistent response, and reassure your dad that he is safe. Consistent routines and reducing stress triggers can help lower repetitive questioning [1][2].',
      'When the same question repeats, focus on the emotion behind it. Reassure first, then redirect with simple choices, music, or another comforting task. Tracking when repetition happens may help identify triggers like fatigue or confusion [2].',
    ],
  },
  {
    id: 'caregiver-burnout',
    question: 'I am exhausted and feeling guilty all the time while caring for my wife. What can I do?',
    acceptedAnswers: [
      'Feeling exhausted and guilty is common for carers and does not mean you are failing. Try to schedule regular breaks, ask family or services for practical help, and consider respite options so you can recover. Looking after your own sleep, food, and health makes caregiving more sustainable [1].',
      'Carer burnout is a real health risk. Start with small, realistic self-care steps, and speak with your GP or support services about stress and emotional strain. Connecting with carer support groups can reduce isolation and guilt [1][2].',
      'You deserve support as well. Build a care plan that includes backup help, respite, and clear limits on what you can do alone. If guilt or low mood is persistent, seek professional support early [2].',
    ],
  },
  {
    id: 'driving-safety',
    question: 'Can someone with dementia still drive a car?',
    acceptedAnswers: [
      'Some people with early dementia may still drive for a period, but driving ability can change over time. Regular medical review and formal driving assessment are important for safety. Families should monitor warning signs and plan alternative transport early [1].',
      'Driving decisions should be based on safety, clinical advice, and legal requirements. If there are concerns about judgement, reaction time, or navigation, arrange an assessment through the treating doctor and licensing pathway [1][2].',
      'Dementia can affect attention, judgement, and problem-solving, so driving needs ongoing review. Discuss concerns openly, involve a healthcare professional, and create a transition plan to reduce distress if driving stops [2].',
    ],
  },
  {
    id: 'early-signs',
    question: 'What are the early signs of dementia I should look out for?',
    acceptedAnswers: [
      'Early signs can include memory changes that affect daily life, difficulty planning or problem-solving, confusion about time or place, and language problems. Mood or behaviour changes can also occur. A medical assessment is important if these changes are persistent or worsening [1].',
      'Look for patterns such as repeated forgetfulness, trouble with familiar tasks, getting disoriented, and changes in communication or judgement. One sign alone is not enough for diagnosis, so formal assessment is the best next step [1][2].',
      'Dementia symptoms often begin gradually, with changes in memory, thinking, communication, or day-to-day function. Because other conditions can look similar, encourage an early check-up with a healthcare professional [2].',
    ],
  },
  {
    id: 'night-wandering',
    question: 'My mum keeps waking at 3am and trying to leave the house. How can I keep her safe?',
    acceptedAnswers: [
      'Night wandering can increase risk, so prioritise safety at home. Use door alerts or simple safety measures, keep pathways clear, and maintain a calming bedtime routine. Daytime activity and reduced evening stimulation may help sleep patterns [1].',
      'Respond calmly if she wakes and wants to leave. Reassure first, redirect to a comforting activity, and avoid confrontation. Review possible triggers like pain, toileting needs, hunger, or anxiety [1][2].',
      'For repeated night-time wandering, combine prevention and supervision strategies. Improve lighting, reduce trip hazards, and discuss sudden or severe changes with a healthcare professional to rule out medical causes [2].',
    ],
  },
  {
    id: 'urgent-review',
    question: 'There was a sudden big change today with confusion and agitation. When should I seek urgent medical help?',
    acceptedAnswers: [
      'A sudden major change in confusion or agitation should be treated as urgent and reviewed promptly by a healthcare professional. Rapid change may indicate an acute medical problem rather than usual dementia progression [1].',
      'Seek urgent help if symptoms changed quickly, safety is at risk, or behaviour is markedly different from baseline. Early medical assessment helps identify causes such as infection, pain, dehydration, or medication effects [1][2].',
      'Do not wait if there is abrupt deterioration. Same-day clinical review is appropriate when confusion and agitation escalate suddenly [2].',
    ],
  },
  {
    id: 'unknown-domain-helpline',
    question: 'What financial support is available for dementia carers in New Zealand?',
    acceptedAnswers: [
      "I don't have specific information about New Zealand carer financial support in my knowledge base, but I recommend speaking with your GP or Dementia Australia on 1800 100 500 for guidance on where to find local support services.",
      "I'm not able to confirm specific New Zealand financial support schemes from my current knowledge base. For accurate, up to date advice, please contact Dementia Australia on 1800 100 500 or your GP, who can point you toward local carer support services.",
    ],
  },
];

if (selectedCaseId) {
  const filtered = COMPARE_CASES.filter(c => c.id === selectedCaseId);
  if (filtered.length === 0) {
    console.error(`Unknown case id: ${selectedCaseId}`);
    process.exit(1);
  }
  COMPARE_CASES.length = 0;
  COMPARE_CASES.push(...filtered);
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

function fmtPct(n) {
  return `${(n * 100).toFixed(1)}%`;
}

async function main() {
  const startedAt = new Date().toISOString();
  const caseLogs = [];
  const openaiStats = { wins: 0, ties: 0, passed: 0, simSum: 0, latencySum: 0 };
  const claudeStats = { wins: 0, ties: 0, passed: 0, simSum: 0, latencySum: 0 };
  const EPSILON = 0.01;

  console.log(DIVIDER);
  console.log(`Comparing OpenAI (${OPENAI_CHAT_MODEL}) vs Claude (${claudeModel})`);
  console.log(`Cases: ${COMPARE_CASES.length} | Reference threshold: ${referenceThreshold.toFixed(3)}`);
  console.log(DIVIDER);

  for (const testCase of COMPARE_CASES) {
    console.log(`\n[CASE] ${testCase.id}`);
    console.log(`Q: ${testCase.question}`);

    try {
      const chunks = await retrieveChunks(testCase.question);
      const contextBlock = buildContextBlock(chunks);

      const [openaiResult, claudeResult] = await Promise.all([
        askOpenAI(testCase.question, contextBlock),
        askClaude(testCase.question, contextBlock),
      ]);

      const [openaiEval, claudeEval] = await Promise.all([
        evaluateAgainstReferences(openaiResult.response, testCase.acceptedAnswers, referenceThreshold),
        evaluateAgainstReferences(claudeResult.response, testCase.acceptedAnswers, referenceThreshold),
      ]);

      openaiStats.simSum += openaiEval.bestSimilarity;
      claudeStats.simSum += claudeEval.bestSimilarity;
      openaiStats.latencySum += openaiResult.latencyMs;
      claudeStats.latencySum += claudeResult.latencyMs;
      if (openaiEval.pass) openaiStats.passed += 1;
      if (claudeEval.pass) claudeStats.passed += 1;

      const diff = openaiEval.bestSimilarity - claudeEval.bestSimilarity;
      if (Math.abs(diff) <= EPSILON) {
        openaiStats.ties += 1;
        claudeStats.ties += 1;
      } else if (diff > 0) {
        openaiStats.wins += 1;
      } else {
        claudeStats.wins += 1;
      }

      console.log(`  Retrieved chunks: ${chunks.length}`);
      console.log(`  OpenAI  — sim=${openaiEval.bestSimilarity.toFixed(3)} pass=${openaiEval.pass} citations=${openaiEval.citations} latency=${openaiResult.latencyMs}ms`);
      console.log(`  Claude  — sim=${claudeEval.bestSimilarity.toFixed(3)} pass=${claudeEval.pass} citations=${claudeEval.citations} latency=${claudeResult.latencyMs}ms`);

      if (verbose) {
        console.log('\n  OpenAI response:');
        console.log(`  ${openaiResult.response.replace(/\n/g, '\n  ')}`);
        console.log('\n  Claude response:');
        console.log(`  ${claudeResult.response.replace(/\n/g, '\n  ')}`);
      }

      caseLogs.push({
        id: `${testCase.id}-openai`,
        provider: 'openai',
        model: OPENAI_CHAT_MODEL,
        question: testCase.question,
        status: openaiEval.pass ? 'pass' : 'fail',
        retrievedChunks: chunks.length,
        citations: openaiEval.citations,
        bestSimilarity: Number(openaiEval.bestSimilarity.toFixed(6)),
        latencyMs: openaiResult.latencyMs,
        ...(includeResponsesInLog ? { response: openaiResult.response } : {}),
      });

      caseLogs.push({
        id: `${testCase.id}-claude`,
        provider: 'claude',
        model: claudeModel,
        question: testCase.question,
        status: claudeEval.pass ? 'pass' : 'fail',
        retrievedChunks: chunks.length,
        citations: claudeEval.citations,
        bestSimilarity: Number(claudeEval.bestSimilarity.toFixed(6)),
        latencyMs: claudeResult.latencyMs,
        ...(includeResponsesInLog ? { response: claudeResult.response } : {}),
      });
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
      caseLogs.push({ id: `${testCase.id}-openai`, provider: 'openai', question: testCase.question, status: 'error', error: err.message });
      caseLogs.push({ id: `${testCase.id}-claude`, provider: 'claude', question: testCase.question, status: 'error', error: err.message });
    }
  }

  const n = COMPARE_CASES.length;
  console.log(`\n${DIVIDER}`);
  console.log('SUMMARY');
  console.log(DIVIDER);
  console.log(`OpenAI (${OPENAI_CHAT_MODEL}): avg similarity ${fmtPct(openaiStats.simSum / n)} | passed ${openaiStats.passed}/${n} | wins ${openaiStats.wins} | avg latency ${(openaiStats.latencySum / n).toFixed(0)}ms`);
  console.log(`Claude (${claudeModel}): avg similarity ${fmtPct(claudeStats.simSum / n)} | passed ${claudeStats.passed}/${n} | wins ${claudeStats.wins} | avg latency ${(claudeStats.latencySum / n).toFixed(0)}ms`);
  console.log(`Ties: ${openaiStats.ties}`);

  if (shouldLogHistory) {
    const logPayload = {
      startedAt,
      endedAt: new Date().toISOString(),
      label: runLabel ?? null,
      mode: 'compare',
      selectedCaseId: selectedCaseId ?? null,
      referenceThreshold,
      totalCases: caseLogs.length,
      passed: openaiStats.passed + claudeStats.passed,
      failed: (n - openaiStats.passed) + (n - claudeStats.passed),
      includeResponsesInLog,
      args,
      providerSummary: {
        openai: { model: OPENAI_CHAT_MODEL, avgSimilarity: openaiStats.simSum / n, passed: openaiStats.passed, wins: openaiStats.wins, avgLatencyMs: openaiStats.latencySum / n },
        claude: { model: claudeModel, avgSimilarity: claudeStats.simSum / n, passed: claudeStats.passed, wins: claudeStats.wins, avgLatencyMs: claudeStats.latencySum / n },
        ties: openaiStats.ties,
      },
      cases: caseLogs,
    };

    try {
      const writtenPath = appendHistoryLog(historyFile, logPayload);
      console.log(`\nHistory log appended: ${writtenPath}`);
    } catch (err) {
      console.error(`Failed to write history log: ${err.message}`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
