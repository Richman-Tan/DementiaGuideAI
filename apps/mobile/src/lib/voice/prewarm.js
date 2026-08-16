// Voice-pipeline pre-warm: pay the cold-start costs BEFORE the user speaks.
//
// Two real costs get eliminated from the first turn's hot path:
//   1. SecureStore key reads (10–50 ms each) — cached in each service after
//      the first call, so touching them here makes the hot-path reads free.
//   2. TCP+TLS+HTTP/2 handshakes to each API host (100–300 ms per host on
//      mobile networks) — NSURLSession/OkHttp pool connections per host, so
//      one tiny request per host warms the pool for the real calls.
//
// Deliberately NOT done here: speculative embeddings or retrieval of guessed
// queries — they cost tokens and buy nothing beyond the connection warmth.
//
// All work is fire-and-forget and individually try/caught: pre-warm must
// never surface an error or delay anything.

import { openaiService } from '@/lib/openaiService';
import { elevenLabsService } from '@/lib/tts/elevenLabsService';
import { azureTtsService } from '@/lib/tts/azureTtsService';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const PREWARM_INTERVAL_MS = 5 * 60 * 1000; // connections idle out well before this
let lastPrewarmAt = 0;

const swallow = () => {};

export function prewarmVoicePipeline() {
  const now = Date.now();
  if (now - lastPrewarmAt < PREWARM_INTERVAL_MS) return;
  lastPrewarmAt = now;
  const t0 = Date.now();

  // OpenAI: key read + one tiny authed GET (models endpoint responds fast and
  // exercises the same host as embeddings/chat/whisper).
  openaiService.getApiKey().then(key => {
    if (!key) return;
    return fetch('https://api.openai.com/v1/models/gpt-4o', {
      headers: { Authorization: `Bearer ${key}` },
    });
  }).then(() => console.log(`[PREWARM] openai ok ms=${Date.now() - t0}`)).catch(swallow);

  // Supabase REST (pgvector search host). HEAD on the REST root is enough to
  // open the pooled connection; no table access needed.
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'HEAD',
      headers: { apikey: SUPABASE_ANON_KEY },
    }).then(() => console.log(`[PREWARM] supabase ok ms=${Date.now() - t0}`)).catch(swallow);
  }

  // ElevenLabs: key read + smallest authed GET.
  elevenLabsService.getApiKey().then(key => {
    if (!key) return;
    return fetch('https://api.elevenlabs.io/v1/user', {
      headers: { 'xi-api-key': key },
    });
  }).then(() => console.log(`[PREWARM] elevenlabs ok ms=${Date.now() - t0}`)).catch(swallow);

  // Azure: credentials live in SecureStore too — warm the cached read. The
  // Speech SDK opens its own connection per synthesis, so there is no useful
  // HTTP warm-up beyond the key cache.
  azureTtsService.hasCredentials().catch(swallow);
}
