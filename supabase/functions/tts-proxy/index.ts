// Centralized-key TTS proxy: ElevenLabs REST (character-level alignment for
// lip-sync) -> OpenAI tts-1 (no alignment; ttsService.ts's RMS-amplitude
// fallback drives the mouth instead, same as it does today when only OpenAI
// TTS is available).
//
// Azure is deliberately NOT proxied here. src/lib/tts/azureTtsService.js's
// viseme data comes from microsoft-cognitiveservices-speech-sdk's stateful
// synthesizer connection, not a plain REST call — a stateless Edge Function
// can't reproduce that without a much bigger relay (effectively re-hosting
// the SDK's protocol). Azure stays BYOK-only, same scope cut as the
// ElevenLabs WebSocket streaming path (see elevenLabsStreamService.js).
import { corsHeaders } from '../_shared/cors.ts';
import { getUser } from '../_shared/auth.ts';
import { logUsage } from '../_shared/usage.ts';

// Mirrors the default profile in src/features/avatar/config/avatarProfiles.ts.
const ELEVEN_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Bella
const ELEVEN_MODEL_ID = 'eleven_turbo_v2_5';
const OPENAI_TTS_VOICE = 'nova';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const { user, error: authError } = await getUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: authError }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { text?: string; speechRate?: number };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const text = body.text?.trim();
  if (!text) {
    return new Response(JSON.stringify({ error: 'text is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const elevenKey = Deno.env.get('ELEVENLABS_API_KEY');
  if (elevenKey) {
    const resp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}/with-timestamps`,
      {
        method: 'POST',
        headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          model_id: ELEVEN_MODEL_ID,
          output_format: 'mp3_44100_64',
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.75,
            style: 0.2,
            speed: body.speechRate ?? 1.0,
          },
        }),
      }
    );
    if (resp.ok) {
      const data = await resp.json();
      await logUsage(user.id, 'tts', text.length);
      return new Response(
        JSON.stringify({
          provider: 'elevenlabs',
          audioBase64: data.audio_base64,
          alignment: data.alignment ?? null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    console.error(
      '[tts-proxy] ElevenLabs failed, falling back to OpenAI:',
      await resp.text().catch(() => resp.status)
    );
  }

  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    return new Response(JSON.stringify({ error: 'No TTS provider configured' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const resp = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'tts-1', voice: OPENAI_TTS_VOICE, input: text, response_format: 'mp3' }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => `HTTP ${resp.status}`);
    return new Response(JSON.stringify({ error: `OpenAI TTS error: ${errText}` }), {
      status: resp.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const buffer = await resp.arrayBuffer();
  const audioBase64 = encodeBase64(new Uint8Array(buffer));
  await logUsage(user.id, 'tts', text.length);

  return new Response(JSON.stringify({ provider: 'openai', audioBase64, alignment: null }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
