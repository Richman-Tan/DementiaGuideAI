// Shared plumbing for the eval runners: env loading, OpenAI + PostgREST fetch,
// and the production retrieval path (embed → match_chunks → source-family cap).
// Deliberately uses direct fetch against PostgREST rather than supabase-js
// (supabase-js crashes under Node 20 without a ws polyfill).
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  EMBEDDING_MODEL,
  TOP_K,
  MIN_SIMILARITY,
  RETRIEVAL_OVERSAMPLE,
  MAX_PER_SOURCE_FAMILY,
} from '../../src/lib/rag/ragConfig.js';
import { capBySourceFamily } from '../../src/lib/rag/retrieval.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, '../..');
export const OPENAI_BASE = 'https://api.openai.com/v1';

function loadDotEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

export const env = { ...loadDotEnv(resolve(ROOT, '.env')), ...process.env };
export const OPENAI_API_KEY = env.OPENAI_API_KEY;
export const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export function requireEnv({ openai = true, supabase = true } = {}) {
  if (openai && !OPENAI_API_KEY) {
    console.error('ERROR: OPENAI_API_KEY not set (export it or add to .env).');
    process.exit(1);
  }
  if (supabase && (!SUPABASE_URL || !SUPABASE_ANON_KEY)) {
    console.error('ERROR: EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY missing from .env');
    process.exit(1);
  }
}

const SB_HEADERS = () => ({
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
});

export async function openaiJson(endpoint, body) {
  const r = await fetch(`${OPENAI_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`OpenAI ${endpoint} failed (${r.status}): ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

export async function embed(text) {
  const data = await openaiJson('/embeddings', { model: EMBEDDING_MODEL, input: text });
  return data.data[0].embedding;
}

// Mirrors openaiService.search() exactly: hybrid RPC + source-family cap.
export async function retrieve(question) {
  const queryEmbedding = await embed(question);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_chunks`, {
    method: 'POST',
    headers: SB_HEADERS(),
    body: JSON.stringify({
      query_embedding: queryEmbedding,
      query_text: question,
      match_count: TOP_K * RETRIEVAL_OVERSAMPLE,
      min_similarity: MIN_SIMILARITY,
    }),
  });
  const text = await r.text();
  if (!r.ok) {
    let msg = text.slice(0, 200);
    try { const j = JSON.parse(text); msg = `${j.code}: ${j.message}`; } catch {}
    throw new Error(`match_chunks failed (HTTP ${r.status}) ${msg}`);
  }
  return capBySourceFamily(JSON.parse(text), TOP_K, MAX_PER_SOURCE_FAMILY);
}

// Fetch chunk rows by id (for the groundedness judge).
export async function fetchChunks(ids) {
  if (ids.length === 0) return [];
  const list = ids.map(id => `"${id}"`).join(',');
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/knowledge_chunks?id=in.(${encodeURIComponent(list)})&select=id,title,content,source_org,source_url`,
    { headers: SB_HEADERS() },
  );
  if (!r.ok) throw new Error(`chunk fetch failed (${r.status})`);
  return r.json();
}

export function gitSha() {
  try { return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); }
  catch { return 'unknown'; }
}

export function outDir() {
  const dir = resolve(ROOT, 'docs/report/eval');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
