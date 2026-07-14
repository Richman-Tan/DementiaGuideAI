/**
 * =============================================================================
 * MIGRATION SCRIPT — Knowledge Base → Supabase
 * =============================================================================
 *
 * PURPOSE
 * -------
 * Reads all 70 knowledge base chunks from src/features/library/data/knowledgeBase.js,
 * generates a vector embedding for each chunk via the OpenAI API
 * (text-embedding-3-small, 1536 dimensions), and uploads everything to the
 * Supabase `knowledge_chunks` table.
 *
 * This is a ONE-TIME operation. After it runs, the app fetches chunks and
 * searches them entirely from Supabase — the local knowledgeBase.js file is
 * no longer used at runtime.
 *
 * It is safe to re-run: chunks already in Supabase are skipped automatically.
 *
 * -----------------------------------------------------------------------------
 * PREREQUISITES — complete these steps before running the script
 * -----------------------------------------------------------------------------
 *
 * 1. CREATE A SUPABASE PROJECT (free)
 *    → https://supabase.com → New project
 *
 * 2. RUN THE SQL SETUP
 *    → Supabase dashboard → SQL Editor
 *    → Paste and run the entire contents of scripts/supabase-setup.sql
 *    This creates the table, the pgvector index, and the match_chunks function.
 *
 * 3. FILL IN YOUR APP CREDENTIALS
 *    → Open src/lib/supabaseService.js
 *    → Set SUPABASE_URL  = your Project URL  (Settings → API → Project URL)
 *    → Set SUPABASE_ANON_KEY = your anon/public key  (Settings → API → anon public)
 *
 * 4. GET AN OPENAI API KEY
 *    → https://platform.openai.com → API Keys → Create new secret key
 *    → A $5 credit is enough; the full migration costs less than $0.001
 *
 * 5. FIND YOUR SUPABASE SERVICE ROLE KEY (for this script only — never put it in the app)
 *    → Supabase → Settings → API → service_role secret
 *
 * -----------------------------------------------------------------------------
 * RUNNING THE SCRIPT
 * -----------------------------------------------------------------------------
 *
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role_secret> \
 *   OPENAI_API_KEY=sk-<your_key> \
 *   node scripts/migrate-to-supabase.mjs
 *
 * Replace the placeholder values with your real credentials.
 * Your actual Supabase URL is: https://jxfzuzgwaomvpvobcyri.supabase.co
 *
 * -----------------------------------------------------------------------------
 * AFTER THE MIGRATION
 * -----------------------------------------------------------------------------
 *
 * - The app uses Supabase for all knowledge base lookups automatically.
 * - To add or edit articles: Supabase dashboard → Table Editor → knowledge_chunks
 *   You can edit content directly in the table. Embeddings for new/edited rows
 *   must be re-generated — re-run this script after any content changes.
 * - src/features/library/data/knowledgeBase.js is kept as a source-of-truth backup but is no
 *   longer imported by the running app.
 *
 * KEY FILES
 *   scripts/supabase-setup.sql      — SQL to run once in Supabase SQL Editor
 *   scripts/migrate-to-supabase.mjs — this script (run once per content change)
 *   src/lib/supabaseService.js — Supabase client config (URL + anon key)
 *   src/lib/openaiService.js   — search() now calls Supabase match_chunks
 *   src/lib/knowledgeService.js — all queries now go to Supabase
 * =============================================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

// ─── Config from environment ─────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
  console.error(
    'Missing environment variables.\n' +
    'Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY'
  );
  process.exit(1);
}

const EMBEDDING_MODEL = 'text-embedding-3-small';
const BATCH_SIZE = 20; // OpenAI allows up to 2048 inputs, 20 keeps requests small
const OPENAI_BASE = 'https://api.openai.com/v1';

// ─── Load knowledge base ─────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const kbPath = path.join(__dirname, '../src/features/library/data/knowledgeBase.js');
const source = fs.readFileSync(kbPath, 'utf8');

// Strip the ES module export declaration and trailing semicolon to get
// the raw JS array literal, then evaluate it in an isolated scope.
const arraySource = source.slice(source.indexOf('['), source.lastIndexOf(']') + 1);
const KNOWLEDGE_BASE = new Function(`return ${arraySource}`)();

console.log(`Loaded ${KNOWLEDGE_BASE.length} chunks from knowledgeBase.js`);

// ─── OpenAI batch embed ──────────────────────────────────────────────────────

async function batchEmbed(texts) {
  const resp = await fetch(`${OPENAI_BASE}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });

  if (resp.status === 401) throw new Error('Invalid OpenAI API key');
  if (resp.status === 429) throw new Error('OpenAI rate limit hit — wait and retry');
  if (!resp.ok) {
    const err = await resp.text().catch(() => `HTTP ${resp.status}`);
    throw new Error(`OpenAI embed error: ${err}`);
  }

  const data = await resp.json();
  // Sort by index to guarantee order matches input
  return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
}

// ─── Main migration ──────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function migrate() {
  // Check which IDs are already in the table so we can skip them on re-runs
  const { data: existing, error: fetchErr } = await supabase
    .from('knowledge_chunks')
    .select('id');

  if (fetchErr) {
    console.error('Failed to query Supabase:', fetchErr.message);
    console.error('Make sure you have run the SQL setup script first.');
    process.exit(1);
  }

  const existingIds = new Set((existing ?? []).map(r => r.id));
  const pending = KNOWLEDGE_BASE.filter(c => !existingIds.has(c.id));

  if (pending.length === 0) {
    console.log('All chunks already in Supabase — nothing to migrate.');
    return;
  }

  console.log(
    `${existingIds.size} chunks already uploaded. Migrating ${pending.length} remaining...`
  );

  let uploaded = 0;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const texts = batch.map(c => `${c.title}. ${c.content}`);

    process.stdout.write(
      `  Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(pending.length / BATCH_SIZE)} ...`
    );
    const embeddings = await batchEmbed(texts);
    console.log(' done');

    const rows = batch.map((chunk, idx) => ({
      id: chunk.id,
      category: chunk.category,
      title: chunk.title,
      content: chunk.content,
      tags: chunk.tags,
      source_url: chunk.source_url ?? null,
      source_org: chunk.source_org ?? null,
      embedding: embeddings[idx],
    }));

    const { error: upsertErr } = await supabase
      .from('knowledge_chunks')
      .upsert(rows, { onConflict: 'id' });

    if (upsertErr) {
      console.error(`\nUpsert failed for batch starting at index ${i}:`, upsertErr.message);
      process.exit(1);
    }

    uploaded += batch.length;
    console.log(`  ${uploaded}/${pending.length} chunks uploaded`);
  }

  console.log('\nMigration complete!');
  console.log(`Total in Supabase: ${existingIds.size + uploaded} chunks`);
}

migrate().catch(err => {
  console.error('\nMigration failed:', err.message);
  process.exit(1);
});
