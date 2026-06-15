/**
 * reingest-isupport.mjs
 * ---------------------
 * 1. Deletes all existing iSupport WHO + iSupport NZ chunks from Supabase.
 * 2. Re-ingests both PDFs with:
 *    - manual chunking (section-boundary aware)
 *    - AI-generated per-chunk content tags
 *    - parent section summary chunks for parent-child retrieval
 *    - structural tags (module:N, section:N)
 *
 * Usage:
 *   node scripts/reingest-isupport.mjs
 *   node scripts/reingest-isupport.mjs --dry-run   (skip delete + upload; preview only)
 *
 * Requires .env with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
 */

import { execFileSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnv() {
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
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

const isDryRun = process.argv.includes('--dry-run');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!isDryRun && (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY)) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const DOCS_DIR = path.join(__dirname, '../src/documents');

const DOCUMENTS = [
  {
    label: 'iSupport WHO (original)',
    file: path.join(DOCS_DIR, 'WHO original iSupport.pdf'),
    prefix: 'isupport_who',
    org: 'World Health Organization',
    country: 'global',
    sourceVersion: 'who-original',
    documentId: 'isupport-who',
    deletePattern: ['document_id:isupport-who'],
  },
  {
    label: 'iSupport NZ (adapted)',
    file: path.join(DOCS_DIR, 'iSupport all_reformatted_2022 12 28.pdf'),
    prefix: 'isupport_nz',
    org: 'Alzheimers NZ',
    country: 'NZ',
    sourceVersion: 'nz-adapted',
    documentId: 'isupport-nz',
    deletePattern: ['document_id:isupport-nz'],
  },
];

async function deleteChunks(label, tagPattern) {
  console.log(`\nDeleting existing "${label}" chunks (tags contains: ${JSON.stringify(tagPattern)})...`);

  let totalDeleted = 0;
  let cursor = null;

  while (true) {
    let query = supabase
      .from('knowledge_chunks')
      .select('id')
      .contains('tags', tagPattern)
      .limit(200);

    if (cursor) query = query.gt('id', cursor);

    const { data, error } = await query;
    if (error) throw new Error(`Select failed: ${error.message}`);
    if (!data || data.length === 0) break;

    const ids = data.map(r => r.id);
    cursor = ids[ids.length - 1];

    const { error: delErr } = await supabase
      .from('knowledge_chunks')
      .delete()
      .in('id', ids);

    if (delErr) throw new Error(`Delete failed: ${delErr.message}`);

    totalDeleted += ids.length;
    console.log(`  Deleted ${totalDeleted} row(s) so far...`);
  }

  console.log(`  Total deleted: ${totalDeleted}`);
  return totalDeleted;
}

function runIngest(doc) {
  const ingestScript = path.join(__dirname, 'ingest.mjs');
  const args = [
    ingestScript,
    '--source', doc.file,
    '--category', 'caregiving',
    '--org', doc.org,
    '--prefix', doc.prefix,
    '--chunking', 'manual',
    '--country', doc.country,
    '--source-version', doc.sourceVersion,
    '--document-id', doc.documentId,
    '--preserve-layout',
  ];

  if (isDryRun) args.push('--dry-run');

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`Ingesting: ${doc.label}`);
  console.log(`File: ${doc.file}`);
  console.log(`${'─'.repeat(70)}`);

  try {
    execFileSync(process.execPath, args, { stdio: 'inherit' });
  } catch (err) {
    console.error(`\nIngest failed for "${doc.label}": ${err.message}`);
    throw err;
  }
}

async function main() {
  console.log('iSupport Re-Ingestion Script');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes to Supabase)' : 'LIVE'}`);
  console.log('='.repeat(70));

  for (const doc of DOCUMENTS) {
    if (!fs.existsSync(doc.file)) {
      console.error(`\nFile not found: ${doc.file}`);
      console.error(`Skipping ${doc.label}`);
      continue;
    }

    if (!isDryRun) {
      await deleteChunks(doc.label, doc.deletePattern);
    } else {
      console.log(`\n[DRY RUN] Would delete chunks with tags: ${JSON.stringify(doc.deletePattern)}`);
    }

    runIngest(doc);
  }

  console.log('\n' + '='.repeat(70));
  console.log(isDryRun
    ? 'DRY RUN complete. Run without --dry-run to apply changes.'
    : 'Re-ingestion complete! Both iSupport documents are now in Supabase.');
}

main().catch(err => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
