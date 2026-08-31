// Chat facade: mock (prototype-parity canned replies, word-streamed) vs real
// (phase b: gpt-4o + Supabase RAG). Mock is active when no credentials are
// available — neither a stored OpenAI key nor a study access code — when
// VITE_FORCE_MOCK is set, or with ?mock=1 in the URL. Never during a study
// session.
import * as S from '../data/services.js';
import { hasCredentials } from './transport.js';
import { isStudyMode } from '../study/studyStore.js';

export function isMockMode() {
  // A study participant must never land in mock mode: canned replies would mean
  // the session measured a prototype instead of the RAG pipeline, and there is
  // no in-app indicator that would tell them (or us) it had happened.
  if (isStudyMode()) return false;
  if (import.meta.env.VITE_FORCE_MOCK) return true;
  if (typeof location !== 'undefined' && /[?&]mock=1/.test(location.search)) return true;
  return !hasCredentials();
}

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')); }, { once: true });
  });

// Prototype behaviour: ~1.1s "typing", then the reply streams two words per 70ms.
async function mockGenerate({ question, settings, signal, onToken }) {
  await sleep(1100, signal);
  const r = S.mockReply(question, settings);
  if (r.error) throw new Error('mock knowledge base outage');
  const words = r.text.split(' ');
  for (let i = 2; i < words.length; i += 2) {
    onToken(words.slice(0, i).join(' '));
    await sleep(70, signal);
  }
  onToken(r.text);
  return { text: r.text, citations: r.citations, safety: r.safety };
}

export async function generateReply(opts) {
  if (isMockMode()) return mockGenerate(opts);
  // Real path (phase b): dynamic import keeps the RAG stack out of the mock bundle.
  const { realGenerate } = await import('./openaiClient.js');
  return realGenerate(opts);
}
