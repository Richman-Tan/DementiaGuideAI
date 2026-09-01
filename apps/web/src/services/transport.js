// Where credential-bearing calls go.
//
// Two modes, and the app behaves identically in both:
//   direct — a personal OpenAI/ElevenLabs key in localStorage (the shipped
//            bring-your-own-key behaviour, unchanged)
//   proxy  — a study access code, with the credentials held server-side in
//            apps/web/api/
//
// Retrieval, prompt assembly and citation extraction stay client-side in either
// mode, so the study measures the shipped pipeline rather than a parallel one.
import { getOpenaiKey, getElevenKey } from '../state/keysStore.js';
import { isStudyMode, studyAccessCode } from '../study/studyStore.js';
import { apiUrl } from './apiBase.js';

const OPENAI_BASE = 'https://api.openai.com/v1';

// OpenAI path → study endpoint. Explicit rather than a catch-all passthrough:
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
  // isStudyMode(), not a bare access code: a failed setup attempt leaves the
  // typed code in localStorage, and gating on the code alone put a NON-study
  // visitor into a hybrid state — normal UI, but mock mode silently off, so a
  // keyless user got "your study access code was not accepted" in the chat.
  if (isStudyMode()) return { proxied: true, headers: { 'x-study-code': studyAccessCode() } };
  return null;
}

export function openaiUrl(transport, path) {
  if (!transport?.proxied) return `${OPENAI_BASE}${path}`;
  const route = PROXY_ROUTES[path];
  if (!route) throw new Error(`no study route for ${path}`);
  return apiUrl(route);
}

/** → { proxied, headers } or null when ElevenLabs is unavailable. */
export function elevenTransport() {
  const key = getElevenKey();
  if (key) return { proxied: false, headers: { 'xi-api-key': key } };
  if (isStudyMode()) return { proxied: true, headers: { 'x-study-code': studyAccessCode() } };
  return null;
}

export const hasCredentials = () => Boolean(openaiTransport());

/**
 * Wake the study proxy before the first real turn.
 *
 * The pre-launch dry run measured ~20s to first token on task 1 — nearly all
 * of it before the LLM call, in the retrieval leg riding on cold serverless
 * functions. One tiny authenticated embedding plus a one-token chat boots
 * /api/embed and /api/chat (and their OpenAI connections) so the participant's
 * first question doesn't pay the cold start. Fire-and-forget by design: a
 * failed warm-up costs nothing and must never surface to the participant.
 */
export function warmStudyProxy() {
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
}
