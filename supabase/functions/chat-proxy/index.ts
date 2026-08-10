// Centralized-key chat proxy. Client builds the same messages[] array it
// always has (system prompt + RAG passages, via src/lib/rag/prompt.js —
// unchanged), this function just holds the real OpenAI key and streams the
// response back, logging a usage_events row from the token count OpenAI
// reports on the final SSE chunk.
//
// config.toml sets verify_jwt = true for this function, so an invalid/
// missing/expired JWT never reaches this code — getUser() below just tells
// us *which* verified user it was.
import { corsHeaders } from '../_shared/cors.ts';
import { getUser } from '../_shared/auth.ts';
import { logUsage } from '../_shared/usage.ts';

// Mirrors src/lib/rag/ragConfig.js's CHAT_MODEL. Not imported directly —
// this function is bundled and deployed independently of the RN app — so
// keep the two in sync by hand if the model ever changes.
const CHAT_MODEL = 'gpt-4o';
// Client's own ceiling (ragConfig.maxTokensForStyle) tops out at 900; this
// is a defense-in-depth cap in case a modified client sends something huge.
const MAX_TOKENS_CEILING = 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const { user, error: authError } = await getUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: authError }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { messages?: unknown; max_tokens?: number; temperature?: number; stream?: boolean };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages[] is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const maxTokens = Math.min(Number(body.max_tokens) || 600, MAX_TOKENS_CEILING);
  const temperature = typeof body.temperature === 'number' ? body.temperature : 0.7;
  // Voice (useAvatarConversation -> chatStream) wants SSE; text chat
  // (ChatScreen -> chat()) wants one JSON response. Both call this same
  // function — the client says which via `stream`, mirroring the shape
  // openaiService.js already sends straight to OpenAI today.
  const wantsStream = body.stream !== false;

  const openaiResp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: body.messages,
      max_tokens: maxTokens,
      temperature,
      stream: wantsStream,
      ...(wantsStream ? { stream_options: { include_usage: true } } : {}),
    }),
  });

  if (!openaiResp.ok) {
    const errText = await openaiResp.text().catch(() => `HTTP ${openaiResp.status}`);
    return new Response(JSON.stringify({ error: `OpenAI error: ${errText}` }), {
      status: openaiResp.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!wantsStream) {
    const data = await openaiResp.json();
    const totalTokens = data?.usage?.total_tokens ?? 0;
    if (totalTokens) await logUsage(user.id, 'chat', totalTokens);
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!openaiResp.body) {
    return new Response(JSON.stringify({ error: 'OpenAI returned no stream body' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Pass the SSE stream through byte-for-byte; separately tap the decoded
  // text to find the final chunk's `usage.total_tokens` (present because of
  // stream_options above) and log it once the stream ends. The client never
  // has to know this logging happens — same shape response either way.
  let buffered = '';
  const decoder = new TextDecoder();
  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);
      buffered += decoder.decode(chunk, { stream: true });
    },
    async flush() {
      const match = buffered.match(/"usage":\s*\{[^}]*"total_tokens":\s*(\d+)/);
      const totalTokens = match ? Number(match[1]) : null;
      if (totalTokens) await logUsage(user.id, 'chat', totalTokens);
    },
  });

  return new Response(openaiResp.body.pipeThrough(transform), {
    headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
  });
});
