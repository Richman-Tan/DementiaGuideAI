// Knowledge-base admin intake: lets a non-engineer submit a PDF, a URL, or
// pasted text (plus provenance) and have it chunked/tagged/titled/embedded
// the same way scripts/ingest/ingest.mjs does for the CLI path — without
// anyone running that script or holding a service-role/OpenAI key. Written
// rows land with review_status='pending' (see
// scripts/migrations/2026-10-07_review_status.sql); a reviewer approves them
// in the Supabase table editor before match_chunks will return them.
import { createRequire } from 'node:module';
import { adminGuard } from '../_lib/adminGuard.js';
import { requireEnv } from '../_lib/guard.js';
import { insertManyReturning } from '../_lib/supabaseAdmin.js';
import { EMBEDDING_MODEL, CATEGORIES } from '../../../../packages/core/rag/ragConfig.js';

// Relative paths, not package specifiers, for everything outside this app: a
// relative path lets Vercel's bundler trace the real files into the
// deployment, where a package specifier would 404 at runtime instead of build
// time. scripts/ingest/pipeline.js is CommonJS, hence createRequire (ingest.mjs
// loads it the same way); ragConfig.js is an ES module and is imported. These
// modules have no I/O of their own beyond fetch, so nothing here depends on
// Node's CLI-specific env/file handling.
const require = createRequire(import.meta.url);
const {
  withRetry,
  pdfBufferToText,
  fetchUrlToArticle,
  textToChunks,
  makeOpenAIClient,
} = require('../../../../scripts/ingest/pipeline.js');

// Vercel's serverless request body cap is ~4.5MB and isn't configurable in
// code. Base64 inflates a PDF by ~4/3, so this leaves headroom for the JSON
// envelope around it. Bigger documents still go through the registry.js +
// CLI path, same as today's 100+ page WHO manual.
const MAX_PDF_BASE64_BYTES = 4_200_000;
const EMBED_BATCH = 20;

export const config = { maxDuration: 60 };

function slugify(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function makeDocumentId(title) {
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return `admin-${slugify(title) || 'resource'}-${suffix}`;
}

export default async function handler(req, res) {
  const user = await adminGuard(req, res);
  if (!user) return;

  const apiKey = requireEnv(res, process.env.OPENAI_API_KEY, 'OPENAI_API_KEY');
  if (!apiKey) return;

  const {
    sourceType,
    payload,
    title,
    sourceOrg = null,
    sourceUrl = null,
    licence = null,
    category,
    country = null,
  } = req.body || {};

  if (!['pdf', 'url', 'text'].includes(sourceType)) {
    res.status(400).json({ error: "sourceType must be 'pdf', 'url', or 'text'" });
    return;
  }
  if (typeof payload !== 'string' || !payload.trim()) {
    res.status(400).json({ error: 'payload is required' });
    return;
  }
  if (typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  if (!CATEGORIES.includes(category)) {
    res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(', ')}` });
    return;
  }
  if (sourceType === 'pdf' && payload.length > MAX_PDF_BASE64_BYTES) {
    res.status(413).json({
      error:
        'PDF too large for this tool (roughly 3MB). For bigger documents, ask a developer to add it via the registry + CLI path.',
    });
    return;
  }

  const documentId = makeDocumentId(title);
  const idBase = documentId.replace(/[^a-z0-9]+/gi, '_').slice(0, 30);

  let text;
  let effectiveTitle = title.trim();
  let resolvedSourceUrl = sourceUrl;
  try {
    if (sourceType === 'pdf') {
      text = await pdfBufferToText(Buffer.from(payload, 'base64'));
    } else if (sourceType === 'url') {
      const article = await fetchUrlToArticle(payload);
      text = article.text;
      if (article.title) effectiveTitle = article.title;
      resolvedSourceUrl = resolvedSourceUrl || payload;
    } else {
      text = payload;
    }
  } catch (err) {
    console.error(`[admin] extraction failed for '${title}' (${sourceType}): ${err?.stack ?? err}`);
    res.status(422).json({
      error: `Could not read that ${sourceType === 'url' ? 'page' : sourceType}: ${String(err?.message ?? err).slice(0, 200)}`,
    });
    return;
  }

  const chunks = textToChunks(text, { idBase, sourceTitle: effectiveTitle });
  if (chunks.length === 0) {
    res.status(422).json({ error: 'No usable text was found in that submission.' });
    return;
  }

  const openai = makeOpenAIClient(apiKey, { embeddingModel: EMBEDDING_MODEL });
  const usedTitles = new Set(); // brand-new document_id — no existing siblings to dedupe display_title against

  try {
    for (const c of chunks) {
      c.tags = await openai.autoTag(c);
      c.display_title = await openai.simplifyTitleUnique(c, usedTitles);
    }

    const now = new Date().toISOString();
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = chunks.slice(i, i + EMBED_BATCH);
      const vectors = await openai.embedBatch(batch.map((c) => `${c.title}. ${c.content}`));
      batch.forEach((c, j) => {
        c.embedding = vectors[j];
      });
    }

    const rows = chunks.map((c) => ({
      id: c.id,
      category,
      title: c.title,
      display_title: c.display_title,
      content: c.content,
      tags: c.tags,
      source_url: resolvedSourceUrl || null,
      source_org: sourceOrg,
      embedding: c.embedding,
      document_id: documentId,
      source_version: now.slice(0, 10),
      country,
      chunk_level: c.chunk_level ?? null,
      content_hash: c.contentHash,
      embedding_model: EMBEDDING_MODEL,
      embedded_at: now,
      licence,
      review_status: 'pending',
    }));

    const written = await withRetry('admin-ingest insert', () =>
      insertManyReturning('knowledge_chunks', rows, 'id,display_title')
    );

    console.log(
      `[admin] ${written.length} chunk(s) saved under '${documentId}' (submitted by ${user.email}, pending review)`
    );
    res.status(200).json({
      document_id: documentId,
      chunkCount: written.length,
      chunks: written,
    });
  } catch (err) {
    // Detail goes to the log only: an embedding/DB error could echo chunk
    // content back, which does not belong in a client-facing response. The
    // insert is batched (50 rows/request in insertManyReturning), so a
    // failure partway through a large submission may have already written
    // some rows under this document_id — surfaced here rather than claimed
    // away, since chunks.length can exceed one batch for a long document.
    console.error(
      `[admin] ingest failed for document '${documentId}' (submitted by ${user.email}): ${err?.stack ?? err}`
    );
    res.status(502).json({
      error: `Processing failed partway through. Some chunks may have already saved under document_id '${documentId}' — check the Supabase table editor before retrying.`,
    });
  }
}

// Exported for tests only (document_id generation has no DB dependency to mock).
export const __test__ = { slugify, makeDocumentId };
