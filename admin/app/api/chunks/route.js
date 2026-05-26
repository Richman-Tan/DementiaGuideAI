import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { generateEmbedding } from '../../../lib/embed';

// GET /api/chunks — list all chunks ordered by category then id
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('knowledge_chunks')
    .select('id, category, title, content, tags, source_url, source_org')
    .order('category')
    .order('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/chunks — create a new chunk and embed it
export async function POST(request) {
  try {
    const body = await request.json();
    const { id, category, title, content, source_url, source_org } = body;
    const tags = Array.isArray(body.tags)
      ? body.tags
      : (body.tags || '').split(',').map(t => t.trim()).filter(Boolean);

    if (!id || !category || !title || !content) {
      return NextResponse.json(
        { error: 'id, category, title, and content are all required' },
        { status: 400 }
      );
    }

    const embedding = await generateEmbedding(`${title}. ${content}`);

    const { data, error } = await supabaseAdmin
      .from('knowledge_chunks')
      .insert([{
        id,
        category,
        title,
        content,
        tags,
        source_url: source_url || null,
        source_org: source_org || null,
        embedding,
      }])
      .select('id, category, title, content, tags, source_url, source_org')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
