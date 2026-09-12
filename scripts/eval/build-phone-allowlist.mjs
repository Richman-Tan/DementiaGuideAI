#!/usr/bin/env node
// Build the verified phone-number allowlist used by the phone-hallucination
// check (scripts/eval/lib/textMetrics.js checkPhones). A number in an answer
// that is not on this list is reported as a suspected invented number.
//
// Sources, in order:
//   1. the live knowledge_chunks corpus (anon key, read-only) — every number
//      the model could legitimately have copied from a passage;
//   2. the local curated sources (knowledgeBase.js, content/sources/*.txt) as an
//      offline fallback (--local);
//   3. the helplines the v2 prompt itself injects (111, Healthline, Alzheimers
//      NZ, 1737) plus the crisis lines the S9 assertion accepts.
//
// Writes scripts/eval/fixtures/phone-allowlist.json (committed, regenerable).
//
//   node scripts/eval/build-phone-allowlist.mjs            # live corpus + local + prompt
//   node scripts/eval/build-phone-allowlist.mjs --local    # no network
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

import { requireEnv, SUPABASE_URL, SUPABASE_ANON_KEY, ROOT } from './lib.mjs';

const require = createRequire(import.meta.url);
const { extractPhones } = require('./lib/textMetrics.js');
const { buildSystemPrompt } = require('../../packages/core/rag/prompt.js');

const LOCAL_ONLY = process.argv.includes('--local');
const OUT = resolve(ROOT, 'scripts/eval/fixtures/phone-allowlist.json');

// Numbers the prompt or the assertions name that may not appear in any passage.
const PROMPT_NUMBERS = ['111', '0800 611 116', '0800 004 001', '1737', '0800 543 354', '0508 828 865'];

async function liveCorpusText() {
  requireEnv({ openai: false });
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
  const texts = [];
  for (let offset = 0; ; offset += 500) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_chunks?select=id,content&order=id.asc&limit=500&offset=${offset}`, { headers });
    if (!r.ok) throw new Error(`knowledge_chunks fetch failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
    const rows = await r.json();
    for (const row of rows) texts.push(row.content ?? '');
    if (rows.length < 500) break;
  }
  return { texts, chunks: texts.length };
}

function localCorpusText() {
  const texts = [];
  const kbPath = resolve(ROOT, 'apps/mobile/src/features/library/data/knowledgeBase.js');
  if (existsSync(kbPath)) texts.push(readFileSync(kbPath, 'utf8'));
  const srcDir = resolve(ROOT, 'content/sources');
  if (existsSync(srcDir)) {
    for (const f of readdirSync(srcDir)) if (f.endsWith('.txt') || f.endsWith('.md')) texts.push(readFileSync(resolve(srcDir, f), 'utf8'));
  }
  return texts;
}

async function main() {
  const sources = [];
  const numbers = new Set();
  const add = (text, label) => { for (const n of extractPhones(text)) numbers.add(n); sources.push(label); };

  if (!LOCAL_ONLY) {
    try {
      const { texts, chunks } = await liveCorpusText();
      for (const t of texts) for (const n of extractPhones(t)) numbers.add(n);
      sources.push(`live knowledge_chunks (${chunks} rows)`);
    } catch (e) {
      console.warn(`live corpus unavailable (${e.message.slice(0, 80)}) — continuing with local sources`);
    }
  }
  for (const t of localCorpusText()) for (const n of extractPhones(t)) numbers.add(n);
  sources.push('local knowledgeBase.js + content/sources/*.txt');
  add(buildSystemPrompt({}), 'v2 system prompt');
  for (const n of PROMPT_NUMBERS) for (const x of extractPhones(n)) numbers.add(x);
  sources.push('prompt/assertion helplines');

  const list = [...numbers].sort();
  writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), sources, count: list.length, numbers: list }, null, 2) + '\n');
  console.log(`${list.length} verified numbers → ${OUT}`);
  console.log(list.join('  '));
}

main().catch(e => { console.error(e); process.exit(1); });
