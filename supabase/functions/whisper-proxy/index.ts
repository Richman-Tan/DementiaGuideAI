// Centralized-key Whisper proxy — used by src/lib/stt/whisperFallback.js
// when the caller has no personal OpenAI key configured. Forwards the
// multipart audio upload as-is; the primary STT path (on-device
// expo-speech-recognition) never hits this function at all.
import { corsHeaders } from '../_shared/cors.ts';
import { getUser } from '../_shared/auth.ts';
import { logUsage } from '../_shared/usage.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const { user, error: authError } = await getUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: authError }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let incomingForm: FormData;
  try {
    incomingForm = await req.formData();
  } catch {
    return new Response(JSON.stringify({ error: 'Expected multipart/form-data with a file field' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const file = incomingForm.get('file');
  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ error: 'file field is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const outgoingForm = new FormData();
  outgoingForm.append('file', file, file.name || 'recording.m4a');
  outgoingForm.append('model', 'whisper-1');
  outgoingForm.append('language', 'en');

  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}` },
    body: outgoingForm,
  });

  const data = await resp.json();
  if (!resp.ok) {
    return new Response(JSON.stringify({ error: `Whisper error: ${data?.error?.message ?? resp.status}` }), {
      status: resp.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Whisper bills per minute of audio, not tokens. Decoding the real
  // duration server-side isn't worth the complexity for track-and-display
  // metering, so file size in bytes is logged as a rough proxy unit —
  // good enough to show relative usage, not for exact billing.
  await logUsage(user.id, 'whisper', file.size);

  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
