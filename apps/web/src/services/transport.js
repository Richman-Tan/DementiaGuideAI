// Where credential-bearing calls go.
//
// Two modes, and the app behaves identically in both:
//   direct — a personal OpenAI/ElevenLabs key in localStorage (the shipped
//            bring-your-own-key behaviour, unchanged)
//   proxy  — a guest access code (state/accessStore.js) that an invited carer
//            enters once to use the app freely, with the credentials held
//            server-side in apps/api
//
// Precedence: personal key → guest code → none (mock mode).
//
// Retrieval, prompt assembly and citation extraction stay client-side in either
// mode, so both run the same pipeline.
import { getOpenaiKey, getElevenKey } from '../state/keysStore.js';
import { guestAccessCode } from '../state/accessStore.js';
import { apiUrl } from './apiBase.js';

const OPENAI_BASE = 'https://api.openai.com/v1';

// OpenAI path → proxy endpoint. Explicit rather than a catch-all passthrough:
// a leaked access code should not be able to reach an arbitrary OpenAI API.
const PROXY_ROUTES = {
  '/embeddings': '/api/embed',
  '/chat/completions': '/api/chat',
  '/audio/speech': '/api/speech',
  '/audio/transcriptions': '/api/transcribe',
};

/**
 * → { proxied, headers } or null when neither a key nor an access code exists
 * (which is what puts the app in mock mode).
 */
export function openaiTransport() {
  const key = getOpenaiKey();
  if (key) return { proxied: false, headers: { Authorization: `Bearer ${key}` } };
  // Only a code the server accepted is ever stored.
  const guest = guestAccessCode();
  if (guest) return { proxied: true, guest: true, headers: { 'x-study-code': guest } };
  return null;
}

export function openaiUrl(transport, path) {
  if (!transport?.proxied) return `${OPENAI_BASE}${path}`;
  const route = PROXY_ROUTES[path];
  if (!route) throw new Error(`no proxy route for ${path}`);
  return apiUrl(route);
}

/** → { proxied, headers } or null when ElevenLabs is unavailable. */
export function elevenTransport() {
  const key = getElevenKey();
  if (key) return { proxied: false, headers: { 'xi-api-key': key } };
  // A bring-your-own-key user keeps paying for their own voice: the guest code
  // fills in only when there is no personal OpenAI key either.
  const guest = !getOpenaiKey() && guestAccessCode();
  if (guest) return { proxied: true, guest: true, headers: { 'x-study-code': guest } };
  return null;
}

/**
 * Check an access code against the proxy without spending anything.
 *
 * POSTs an empty body to /api/speech: the server's guard runs before the body
 * is read, so 401 = not accepted, 429 = accepted but over today's limit, and an
 * accepted code then fails body validation with 400 before any provider call.
 * → { ok, status: 'ok' | 'limit' | 'rejected' | 'invalid' | 'unavailable' }
 */
export async function validateAccessCode(raw) {
  const code = String(raw || '').trim();
  if (code.length < 16) return { ok: false, status: 'invalid' }; // the guard refuses shorter codes
  let resp;
  try {
    resp = await fetch(apiUrl('/api/speech'), {
      method: 'POST',
      headers: { 'x-study-code': code, 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch {
    return { ok: false, status: 'unavailable' };
  }
  if (resp.status === 400) return { ok: true, status: 'ok' };
  if (resp.status === 429) return { ok: true, status: 'limit' };
  if (resp.status === 401) return { ok: false, status: 'rejected' };
  return { ok: false, status: 'unavailable' };
}

export const hasCredentials = () => Boolean(openaiTransport());

/**
 * Wake the proxy before the first real turn.
 *
 * A first turn measured ~20s to first token — nearly all of it before the LLM
 * call, in the retrieval leg riding on cold serverless functions. One tiny
 * authenticated embedding plus a one-token chat boots /api/embed and /api/chat
 * (and their OpenAI connections) so the first question doesn't pay the cold
 * start. Fire-and-forget by design: a failed warm-up costs nothing and must
 * never surface to the user.
 */
export function warmProxy() {
  const t = openaiTransport();
  if (!t?.proxied) return;
  const post = (path, body) =>
    fetch(openaiUrl(t, path), {
      method: 'POST',
      headers: { ...t.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => { /* warming is best-effort */ });
  post('/embeddings', { model: 'text-embedding-3-small', input: 'warm-up' });
  post('/chat/completions', { model: 'gpt-4o-mini', max_tokens: 1, messages: [{ role: 'user', content: 'ok' }] });
  // The audio functions boot for free: both validate the body only after the
  // guard has run, so a JSON body they reject with a 400 still pays the cold
  // start without an OpenAI call. Leaving them out meant the first spoken turn
  // raced a cold /api/transcribe against the 15s Whisper timeout — which read
  // as "the mic doesn't work".
  post('/audio/transcriptions', {});
  post('/audio/speech', {});
}
