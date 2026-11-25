#!/usr/bin/env node
/**
 * Give every knowledge-base passage a Voyage embedding (embedding_v2), beside
 * the OpenAI one it already has.
 *
 *   node scripts/ingest/reembed.mjs --dry-run   what would be embedded; no API calls, nothing saved
 *   node scripts/ingest/reembed.mjs             embed and save the passages that need it
 *   node scripts/ingest/reembed.mjs --force     embed every passage again
 *   node scripts/ingest/reembed.mjs --check     exit 1 unless every approved passage is up to date
 *
 *   --model <id>   embedding model (default voyage-4)
 *   --batch <n>    passages per embedding request (default 64)
 *
 * Run scripts/migrations/2026-11-25_embedding_v2_voyage.sql first. Safe to
 * re-run: a passage is embedded only if it has no v2 vector, or was re-ingested
 * since. Nothing reads embedding_v2 until the search is switched to
 * match_chunks_v2, and that waits for --check to pass.
 *
 * Environment (the repo root .env, or the shell):
 *   SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY       needed to save; --dry-run and --check can
 *                                   read with EXPO_PUBLIC_SUPABASE_ANON_KEY
 *   VOYAGE_API_KEY                  not needed for --dry-run or --check
 *   VOYAGE_BASE_URL                 optional; defaults to the Atlas endpoint.
 *                                   A key issued by Voyage directly needs
 *                                   https://api.voyageai.com/v1
 *
 * The logic is packages/core/rag/reembed.ts (tested there); this file only
 * connects it to the database and to Voyage.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { reembed } from '../../packages/core/rag/reembed.ts';
import { createVoyage, VOYAGE_ATLAS_URL } from '../../packages/core/rag/providers/voyage.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DIMENSIONS = 1024; // the width of knowledge_chunks.embedding_v2

function loadDotEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = { ...loadDotEnv(resolve(ROOT, '.env')), ...process.env };

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const DRY_RUN = flag('--dry-run');
const CHECK = flag('--check');
const FORCE = flag('--force');
const MODEL = value('--model', 'voyage-4');
const BATCH = Number(value('--batch', '64'));

const SUPABASE_URL = env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const READ_KEY = SERVICE_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const READ_ONLY = DRY_RUN || CHECK;

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}
if (!Number.isInteger(BATCH) || BATCH < 1 || BATCH > 1000)
  fail('--batch must be a whole number from 1 to 1000');
if (!SUPABASE_URL) fail('SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) is not set');
if (!READ_KEY)
  fail(
    'no database key: set SUPABASE_SERVICE_ROLE_KEY (or EXPO_PUBLIC_SUPABASE_ANON_KEY for --dry-run and --check)'
  );
if (!READ_ONLY && !SERVICE_KEY) fail('SUPABASE_SERVICE_ROLE_KEY is needed to save embeddings');
if (!READ_ONLY && !env.VOYAGE_API_KEY) fail('VOYAGE_API_KEY is not set');

const headers = (key, extra = {}) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  ...extra,
});

async function database(path, init, what) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, init);
  const text = await response.text();
  if (!response.ok) {
    let reason = text.slice(0, 300);
    try {
      const body = JSON.parse(text);
      if (body.message) reason = body.code ? `${body.code}: ${body.message}` : body.message;
    } catch {
      // not JSON: keep the raw text
    }
    throw new Error(`${what} failed (HTTP ${response.status}): ${reason}`);
  }
  return text ? JSON.parse(text) : null;
}

async function listRows() {
  const PAGE = 1000;
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await database(
      `knowledge_chunks?select=id,title,content,review_status,embedded_at,embedding_v2_at&order=id&limit=${PAGE}&offset=${offset}`,
      { headers: headers(READ_KEY) },
      'reading knowledge_chunks'
    );
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

async function check() {
  const missing = await database(
    'rpc/knowledge_chunks_v2_missing',
    { method: 'POST', headers: headers(READ_KEY), body: '{}' },
    'knowledge_chunks_v2_missing()'
  );
  if (missing === 0) {
    console.log('OK: every approved passage has an up-to-date v2 embedding.');
    return;
  }
  console.error(
    `NOT READY: ${missing} approved passage(s) have no up-to-date v2 embedding. Run this script without --check.`
  );
  process.exit(1);
}

async function main() {
  if (CHECK) return check();

  const rows = await listRows();
  const voyage = READ_ONLY
    ? null
    : createVoyage({
        apiKey: env.VOYAGE_API_KEY,
        baseUrl: env.VOYAGE_BASE_URL || VOYAGE_ATLAS_URL,
        embeddingModel: MODEL,
        dimensions: DIMENSIONS,
      });

  const report = await reembed(
    rows,
    {
      embedMany: (texts) => voyage.embedMany(texts, 'document'),
      save: (id, embedding) =>
        database(
          `knowledge_chunks?id=eq.${encodeURIComponent(id)}`,
          {
            method: 'PATCH',
            headers: headers(SERVICE_KEY, { Prefer: 'return=minimal' }),
            body: JSON.stringify({
              embedding_v2: embedding,
              embedding_v2_model: MODEL,
              embedding_v2_at: new Date().toISOString(),
            }),
          },
          `saving ${id}`
        ),
      log: (line) => console.log(line),
    },
    { batchSize: BATCH, force: FORCE, dryRun: DRY_RUN }
  );

  // About four characters to a token in English: enough to size the job.
  const tokens = Math.round(report.characters / 4);
  console.log(
    `${DRY_RUN ? 'Would embed' : 'Embedded'} ${DRY_RUN ? report.selected : report.embedded} of ${report.rows} passages with ${MODEL} (about ${tokens.toLocaleString('en-NZ')} tokens).`
  );
  if (!DRY_RUN) console.log('Now run: npm run kb:reembed -- --check');
}

main().catch((err) => fail(err?.message ?? String(err)));
