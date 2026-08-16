// Chat facade: mock (prototype-parity canned replies, word-streamed) vs real
// (phase b: gpt-4o + Supabase RAG). Mock is active when no OpenAI key is stored,
// when VITE_FORCE_MOCK is set, or with ?mock=1 in the URL.
import * as S from '../data/services.js';
import { getOpenaiKey } from '../state/keysStore.js';

export function isMockMode() {
  if (import.meta.env.VITE_FORCE_MOCK) return true;
  if (typeof location !== 'undefined' && /[?&]mock=1/.test(location.search)) return true;
  return !getOpenaiKey();
}

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal)
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(t);
          reject(new DOMException('aborted', 'AbortError'));
        },
        { once: true }
      );
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
