import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { generateEmbedding } from '../../../lib/embed';
import { extractFromUrl, extractFromPdf, chunkText, autoTagChunks } from '../../../lib/ingestLib';

const VALID_CATEGORIES = [
  'caregiving', 'clinical', 'communication',
  'prevention', 'best-practices', 'home-safety', 'well-being',
];

export async function POST(request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let url, category, org, prefix, sourceUrl, pdfBuffer, pdfFilename;

    if (contentType.includes('application/json')) {
      // ── URL ingestion ──────────────────────────────────────────────────────
      const body = await request.json();
      url      = body.url;
      category = body.category;
      org      = body.org;
      prefix   = body.prefix || undefined;

      if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 });
    } else {
      // ── PDF ingestion (multipart/form-data) ────────────────────────────────
      const form = await request.formData();
      const file = form.get('file');
      if (!file || typeof file === 'string') {
        return NextResponse.json({ error: 'No PDF file provided' }, { status: 400 });
      }
      pdfBuffer   = await file.arrayBuffer();
      pdfFilename = file.name;
      category    = form.get('category');
      org         = form.get('org');
      prefix      = form.get('prefix') || undefined;
      sourceUrl   = form.get('sourceUrl') || undefined;
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category "${category}". Must be one of: ${VALID_CATEGORIES.join(', ')}` },
        { status: 400 }
      );
    }
    if (!org) return NextResponse.json({ error: 'org is required' }, { status: 400 });

    // ── Extract text ──────────────────────────────────────────────────────────
    let text, articleTitle;
    if (url) {
      ({ text, title: articleTitle } = await extractFromUrl(url));
    } else {
      ({ text, title: articleTitle } = await extractFromPdf(pdfBuffer, pdfFilename));
    }

    // ── Chunk ─────────────────────────────────────────────────────────────────
    const chunks = chunkText(text, articleTitle, {
      category,
      sourceUrl:  url || sourceUrl || null,
      sourceOrg:  org,
      prefix,
    });

    if (chunks.length === 0) {
      return NextResponse.json({ error: 'No usable content found in source' }, { status: 400 });
    }

    // ── Auto-tag ──────────────────────────────────────────────────────────────
    await autoTagChunks(chunks);

    // ── Embed ─────────────────────────────────────────────────────────────────
    for (const chunk of chunks) {
      chunk.embedding = await generateEmbedding(`${chunk.title}. ${chunk.content}`);
    }

    // ── Upsert to Supabase ────────────────────────────────────────────────────
    const rows = chunks.map(c => ({
      id:         c.id,
      category:   c.category,
      title:      c.title,
      content:    c.content,
      tags:       c.tags,
      source_url: c.source_url,
      source_org: c.source_org,
      embedding:  c.embedding,
    }));

    const { error: dbError } = await supabaseAdmin
      .from('knowledge_chunks')
      .upsert(rows, { onConflict: 'id' });

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

    return NextResponse.json({
      chunks_added:  chunks.length,
      article_title: articleTitle,
      ids:           chunks.map(c => c.id),
    }, { status: 201 });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
