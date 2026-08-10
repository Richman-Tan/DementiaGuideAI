// Centralized-key embedding proxy — used by openaiService.js's search() when
// the caller has no personal OpenAI key configured. Mirrors the single
// embeddings call openaiService.js already makes; no streaming needed.
import { corsHeaders } from '../_shared/cors.ts';
import { getUser } from '../_shared/auth.ts';
import { logUsage } from '../_shared/usage.ts';

// Mirrors src/lib/rag/ragConfig.js's EMBEDDING_MODEL — see chat-proxy's
// comment on why this isn't imported directly.
const EMBEDDING_MODEL = 'text-embedding-3-small';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const { user, error: authError } = await getUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: authError }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { input?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (typeof body.input !== 'string' || !body.input.trim()) {
    return new Response(JSON.stringify({ error: 'input (string) is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const resp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: body.input }),
  });

  const data = await resp.json();
  if (!resp.ok) {
    return new Response(JSON.stringify({ error: `OpenAI error: ${data?.error?.message ?? resp.status}` }), {
      status: resp.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const totalTokens = data?.usage?.total_tokens ?? 0;
  if (totalTokens) await logUsage(user.id, 'embedding', totalTokens);

  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
