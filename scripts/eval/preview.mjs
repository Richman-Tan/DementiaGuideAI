#!/usr/bin/env node
// Ad-hoc preview: run one or more questions through the EXACT production chat
// pipeline (embed -> match_chunks -> shared v2 prompt -> gpt-4o -> inline
// citation extraction) and print the answer + structured sources, exactly as
// openaiService.chat() would return to the app. Production temperature (0.7).
//   node scripts/eval/preview.mjs "your question"
import { createRequire } from 'node:module';
import { requireEnv, retrieve, openaiJson } from './lib.mjs';

const require = createRequire(import.meta.url);
const { CHAT_MODEL, GENERATION_TEMPERATURE, maxTokensForStyle } = require('../../src/lib/rag/ragConfig.js');
const { buildSystemPrompt, buildUserContent } = require('../../src/lib/rag/prompt.js');
const { extractCitations } = require('../../src/lib/rag/citations.js');

const QUESTIONS = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (QUESTIONS.length === 0) {
  QUESTIONS.push('My mother gets agitated and confused every evening around sunset. What can I do?');
  QUESTIONS.push('I need a break from caring for my husband. What respite options are there in New Zealand?');
}

requireEnv();
const systemPrompt = buildSystemPrompt(); // active version = v2-nz-safety, inline citations

for (const q of QUESTIONS) {
  const chunks = await retrieve(q);
  const data = await openaiJson('/chat/completions', {
    model: CHAT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: buildUserContent(q, chunks) },
    ],
    max_tokens: maxTokensForStyle('balanced', false),
    temperature: GENERATION_TEMPERATURE,
  });
  const raw = data.choices[0].message.content.trim();
  const { text, sources } = extractCitations(raw, chunks);
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('USER: ' + q);
  console.log('────────────────────────────────────────────────────────────');
  console.log(text);
  if (sources.length) {
    console.log('\nSOURCES (tappable citation cards in the app):');
    for (const s of sources) console.log(`  [${s.num}] ${s.title}${s.org ? ' — ' + s.org : ''}`);
  }
}
console.log('\n════════════════════════════════════════════════════════════');
