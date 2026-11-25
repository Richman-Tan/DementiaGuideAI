// Chat facade. Three ways a reply is produced:
//
//   mock    canned replies, word-streamed: when VITE_FORCE_MOCK is set, with
//           ?mock=1 in the URL, or when nothing else is available
//   server  the pipeline on the server (services/turnClient.js), when
//           VITE_TURN_ENDPOINT is on. No key or code is needed.
//   client  the older in-browser pipeline, with a stored OpenAI key or a guest
//           access code
import * as S from '../data/services.js';
import { hasCredentials } from './transport.js';
import { serverPipelineEnabled } from './turnClient.js';

export function isMockMode() {
  if (import.meta.env.VITE_FORCE_MOCK) return true;
  if (typeof location !== 'undefined' && /[?&]mock=1/.test(location.search)) return true;
  if (serverPipelineEnabled()) return false;
  return !hasCredentials();
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
  if (serverPipelineEnabled()) {
    const { serverGenerate } = await import('./turnClient.js');
    return serverGenerate(opts);
  }
  // The in-browser pipeline: a dynamic import keeps its RAG stack out of the other paths.
  const { realGenerate } = await import('./openaiClient.js');
  return realGenerate(opts);
}
