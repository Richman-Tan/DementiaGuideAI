import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { generateEmbedding } from '../../../../lib/embed';

// PATCH /api/chunks/[id] — update a chunk, optionally re-embedding it
export async function PATCH(request, context) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { title, content, category, source_url, source_org, reEmbed } = body;
    const tags = Array.isArray(body.tags)
      ? body.tags
      : (body.tags || '').split(',').map(t => t.trim()).filter(Boolean);

    const updates = {
      title,
      content,
      tags,
      category,
      source_url: source_url || null,
      source_org: source_org || null,
    };

    // Only re-embed if content changed — costs a small OpenAI call
    if (reEmbed) {
      updates.embedding = await generateEmbedding(`${title}. ${content}`);
    }

    const { data, error } = await supabaseAdmin
      .from('knowledge_chunks')
      .update(updates)
      .eq('id', id)
      .select('id, category, title, content, tags, source_url, source_org')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/chunks/[id] — permanently remove a chunk
export async function DELETE(request, context) {
  try {
    const { id } = await context.params;

    const { error } = await supabaseAdmin
      .from('knowledge_chunks')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
