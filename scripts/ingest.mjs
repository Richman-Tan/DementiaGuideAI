/**
 * =============================================================================
 * INGEST SCRIPT — Add knowledge base content from PDFs or URLs
 * =============================================================================
 *
 * PURPOSE
 * -------
 * Extracts text from a local PDF file or a public URL, splits it into chunks,
 * generates embeddings via OpenAI, and upserts them into the Supabase
 * knowledge_chunks table — exactly the same format as the existing chunks.
 *
 * -----------------------------------------------------------------------------
 * USAGE
 * -----------------------------------------------------------------------------
 *
 *   # Ingest a PDF file
 *   SUPABASE_URL=https://jxfzuzgwaomvpvobcyri.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
 *   OPENAI_API_KEY=sk-... \
 *   node scripts/ingest.mjs \
 *     --source "/path/to/document.pdf" \
 *     --category caregiving \
 *     --org "Dementia Australia" \
 *     --url "https://dementia.org.au/source-page"
 *
 *   # Ingest a public URL
 *   SUPABASE_URL=https://jxfzuzgwaomvpvobcyri.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
 *   OPENAI_API_KEY=sk-... \
 *   node scripts/ingest.mjs \
 *     --source "https://www.dementia.org.au/some-article" \
 *     --category clinical \
 *     --org "Dementia Australia"
 *
 * -----------------------------------------------------------------------------
 * ARGUMENTS
 * -----------------------------------------------------------------------------
 *
 *   --source    (required) Local path to a PDF OR a public https:// URL
 *   --category  (required) Category slug: caregiving | clinical | communication
 *                          | prevention | bestpractices | homesafety | support
 *   --org       (required) Name of the source organisation (e.g. "NHS UK")
 *   --url       (optional) Canonical URL to attribute as source_url.
 *                          Defaults to --source if source is a URL.
 *   --prefix    (optional) ID prefix for generated chunks (default: derived from source name)
 *   --dry-run   (optional) Print chunks without uploading to Supabase
 *
 * -----------------------------------------------------------------------------
 * CHUNKING STRATEGY
 * -----------------------------------------------------------------------------
 *
 * Text is split into chunks of ~500 words with ~50 word overlap.
 * Each paragraph boundary is preferred as a split point.
 * Short sections (< 40 words) are merged into the previous chunk.
 *
 * =============================================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { createClient } from '@supabase/supabase-js';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import fetch from 'node-fetch';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

// ─── CLI argument parsing ─────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : null;
}
const hasDryRun = args.includes('--dry-run');

const source   = getArg('source');
const category = getArg('category');
const org      = getArg('org');
const urlArg   = getArg('url');
const prefix   = getArg('prefix');

if (!source || !category || !org) {
  console.error(
    'Usage: node scripts/ingest.mjs --source <path|url> --category <slug> --org <name> [--url <url>] [--prefix <id_prefix>] [--dry-run]'
  );
  process.exit(1);
}

// ─── Environment ──────────────────────────────────────────────────────────────

const SUPABASE_URL              = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY            = process.env.OPENAI_API_KEY;

if (!hasDryRun && (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY)) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY');
  process.exit(1);
}

const OPENAI_BASE      = 'https://api.openai.com/v1';
const EMBEDDING_MODEL  = 'text-embedding-3-small';
const CHUNK_WORDS      = 500;
const OVERLAP_WORDS    = 50;
const MIN_CHUNK_WORDS  = 40;
const BATCH_SIZE       = 20;

// ─── Text extraction ──────────────────────────────────────────────────────────

async function extractFromUrl(url) {
  console.log(`Fetching URL: ${url}`);
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DementiaGuideAI-Ingest/1.0)' },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
  const html = await resp.text();
  const dom  = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article) throw new Error('Readability could not parse the page — it may be a JavaScript-heavy SPA');
  console.log(`Extracted article: "${article.title}"`);
  return { text: article.textContent, title: article.title };
}

async function extractFromPdf(filePath) {
  console.log(`Reading PDF: ${filePath}`);
  const buffer = fs.readFileSync(filePath);
  const data   = await pdfParse(buffer);
  const title  = path.basename(filePath, path.extname(filePath)).replace(/[-_]/g, ' ');
  console.log(`Extracted ${data.numpages} pages from "${title}"`);
  return { text: data.text, title };
}

// ─── Chunking ─────────────────────────────────────────────────────────────────

function chunkText(text, sourceTitle) {
  // Normalise whitespace
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();

  // Split on paragraph breaks first, then fall back to sentences
  const paragraphs = clean
    .split(/\n{2,}/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(p => p.length > 0);

  const chunks = [];
  let current  = [];
  let wordCount = 0;

  for (const para of paragraphs) {
    const words = para.split(' ');
    if (wordCount + words.length > CHUNK_WORDS && wordCount > 0) {
      // Save current chunk
      const text = current.join(' ').trim();
      if (text.split(' ').length >= MIN_CHUNK_WORDS) {
        chunks.push(text);
      } else if (chunks.length > 0) {
        // Too short — merge into previous
        chunks[chunks.length - 1] += ' ' + text;
      }
      // Start new chunk with overlap from end of previous
      const overlapWords = current.join(' ').split(' ').slice(-OVERLAP_WORDS);
      current   = [overlapWords.join(' '), para];
      wordCount = overlapWords.length + words.length;
    } else {
      current.push(para);
      wordCount += words.length;
    }
  }

  // Push last chunk
  if (current.length > 0) {
    const text = current.join(' ').trim();
    if (text.split(' ').length >= MIN_CHUNK_WORDS) {
      chunks.push(text);
    } else if (chunks.length > 0) {
      chunks[chunks.length - 1] += ' ' + text;
    } else {
      chunks.push(text); // Only chunk — keep regardless of length
    }
  }

  console.log(`Split into ${chunks.length} chunks`);

  // Derive ID prefix from source arg or --prefix
  const idBase = (prefix ?? path.basename(source, path.extname(source)))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 30);

  return chunks.map((content, idx) => ({
    id:         `${idBase}_${String(idx + 1).padStart(3, '0')}`,
    category,
    title:      chunks.length === 1 ? sourceTitle : `${sourceTitle} (Part ${idx + 1})`,
    content,
    tags:       [],
    source_url: urlArg ?? (source.startsWith('http') ? source : null),
    source_org: org,
    embedding:  null,
  }));
}

// ─── OpenAI embedding ─────────────────────────────────────────────────────────

async function batchEmbed(texts) {
  const resp = await fetch(`${OPENAI_BASE}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      Authorization:   `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });
  if (resp.status === 401) throw new Error('Invalid OpenAI API key');
  if (resp.status === 429) throw new Error('OpenAI rate limit — wait and retry');
  if (!resp.ok) {
    const err = await resp.text().catch(() => `HTTP ${resp.status}`);
    throw new Error(`OpenAI embed error: ${err}`);
  }
  const data = await resp.json();
  return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Extract text
  let text, title;
  if (source.startsWith('http://') || source.startsWith('https://')) {
    ({ text, title } = await extractFromUrl(source));
  } else if (source.toLowerCase().endsWith('.pdf')) {
    ({ text, title } = await extractFromPdf(source));
  } else {
    // Plain text file
    text  = fs.readFileSync(source, 'utf8');
    title = path.basename(source, path.extname(source)).replace(/[-_]/g, ' ');
  }

  // 2. Chunk
  const chunks = chunkText(text, title);

  if (hasDryRun) {
    console.log('\n── DRY RUN — chunks that would be uploaded ──\n');
    chunks.forEach((c, i) => {
      console.log(`[${i + 1}] id: ${c.id}`);
      console.log(`    title: ${c.title}`);
      console.log(`    words: ${c.content.split(' ').length}`);
      console.log(`    preview: ${c.content.slice(0, 120)}...`);
      console.log();
    });
    console.log(`Total: ${chunks.length} chunks. Run without --dry-run to upload.`);
    return;
  }

  // 3. Embed in batches
  console.log('\nGenerating embeddings...');
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map(c => `${c.title}. ${c.content}`);
    process.stdout.write(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)} ...`);
    const embeddings = await batchEmbed(texts);
    embeddings.forEach((emb, idx) => { batch[idx].embedding = emb; });
    console.log(' done');
  }

  // 4. Upsert to Supabase
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log('\nUploading to Supabase...');
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('knowledge_chunks')
      .upsert(batch, { onConflict: 'id' });
    if (error) {
      console.error(`Upsert failed: ${error.message}`);
      process.exit(1);
    }
    console.log(`  ${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length} chunks uploaded`);
  }

  console.log('\nIngestion complete!');
  console.log(`Added ${chunks.length} chunks from "${title}" under category "${category}"`);
  console.log('\nIDs added:');
  chunks.forEach(c => console.log(`  ${c.id}`));
}

main().catch(err => {
  console.error('\nIngestion failed:', err.message);
  process.exit(1);
});
