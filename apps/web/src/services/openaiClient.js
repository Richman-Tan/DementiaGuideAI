// Web twin of src/lib/openaiService.js (mobile). Kept deliberately parallel:
// same class shape, same reused RAG modules, same timeouts and error classes.
// Differences from mobile, and nothing else:
//   - credentials are resolved by services/transport.js: a personal key from
//     localStorage (state/keysStore), or, during the usability study, a study
//     access code with the key held server-side in apps/web/api/
//   - chatStream reads fetch's ReadableStream instead of the RN XHR workaround
//   - transcribe() takes a Blob instead of an RN file-uri descriptor
//   - device telemetry (recordRetrieval) is dropped
import { supabase } from './supabase.js';
import {
  EMBEDDING_MODEL,
  CHAT_MODEL,
  MIN_SIMILARITY,
  TOP_K,
  MAX_HISTORY,
  RETRIEVAL_OVERSAMPLE,
  MAX_PER_SOURCE_FAMILY,
  GENERATION_TEMPERATURE,
  CITATION_MODE,
  maxTokensForStyle,
} from '@core/rag/ragConfig';
import { buildSystemPrompt, buildUserContent } from '@core/rag/prompt';
import { capBySourceFamily } from '@core/rag/retrieval';
import { extractCitations, createMarkerStripper } from '@core/rag/citations';
import { timeoutSignal } from '@core/net/withTimeout';
import { getOpenaiKey, loadKeys, saveKeys } from '../state/keysStore.js';
import { openaiTransport, openaiUrl } from './transport.js';
import { emit } from '../study/events.js';

const EMBED_CACHE_MAX = 20;
const MIN_REQUEST_INTERVAL_MS = 750;

const EMBED_TIMEOUT_MS = 5000;
const SEARCH_TIMEOUT_MS = 4000;
const WHISPER_TIMEOUT_MS = 15000;
const LLM_TOTAL_TIMEOUT_MS = 60000;
const LLM_TTFB_TIMEOUT_MS = 12000;

class OpenAIAuthError extends Error {
  constructor(msg) { super(msg); this.name = 'OpenAIAuthError'; }
}
class OpenAIRateLimitError extends Error {
  constructor(msg) { super(msg); this.name = 'OpenAIRateLimitError'; }
}
// Proxied mode only. A 401 there means the participant's study access code was
// refused — telling them their API key is invalid would be nonsense, since they
// never had one.
class StudyAccessError extends Error {
  constructor(msg) { super(msg); this.name = 'StudyAccessError'; }
}

// Shared response mapping so every call site reports the same thing.
//
// Only 401 is an auth error: OpenAI also returns 403 for region blocks and
// org-verification, where "your API key looks invalid" sends the user off to
// re-enter a key that was fine.
async function throwForStatus(resp, transport, label) {
  if (resp.status === 401) {
    throw transport.proxied
      ? new StudyAccessError('Study access code was not accepted')
      : new OpenAIAuthError('Invalid API key');
  }
  if (resp.status === 429) throw new OpenAIRateLimitError('Rate limit reached');
  if (resp.status === 403) {
    throw new Error(`${label}: refused (403) — the key may be unavailable in your region`);
  }
  if (!resp.ok) {
    // Keep the upstream body: it carries the reason (model_not_found, context
    // length, unsupported audio format) that the status code alone does not.
    const detail = transport.proxied ? '' : await resp.text().catch(() => '');
    throw new Error(`${label}: ${detail || `HTTP ${resp.status}`}`);
  }
}

// A personal key overrides the transport; used by the key-validation path.
function transportFor(apiKey) {
  if (apiKey) return { proxied: false, headers: { Authorization: `Bearer ${apiKey}` } };
  return openaiTransport();
}

class OpenAIClient {
  constructor() {
    this._embedCache = new Map(); // query → embedding (LRU via delete+set)
    this._lastRequestAt = 0;
  }

  async _throttle() {
    const wait = this._lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this._lastRequestAt = Date.now();
  }

  // ─── API Key (async signatures kept for mobile parity) ─────────────────────

  async saveApiKey(key) {
    saveKeys({ ...loadKeys(), openai: key.trim() });
  }
  async getApiKey() { return getOpenaiKey() || null; }
  async clearApiKey() { saveKeys({ ...loadKeys(), openai: '' }); }
  async hasApiKey() {
    const k = getOpenaiKey();
    if (k && k.length > 10) return true;
    // A study participant has no key of their own but can still reach the model.
    return Boolean(openaiTransport());
  }

  // ─── Raw OpenAI Calls ──────────────────────────────────────────────────────

  async _callOpenAI(endpoint, body, apiKey, { timeoutMs = null } = {}) {
    const transport = transportFor(apiKey);
    if (!transport) throw new OpenAIAuthError('No API key configured');
    const t = timeoutMs ? timeoutSignal(timeoutMs) : null;
    let resp;
    try {
      resp = await fetch(openaiUrl(transport, endpoint), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...transport.headers,
        },
        body: JSON.stringify(body),
        ...(t ? { signal: t.signal } : {}),
      });
    } finally {
      t?.cancel();
    }

    await throwForStatus(resp, transport, 'OpenAI error');
    return resp.json();
  }

  async _embedQuery(text) {
    const key = text.trim().toLowerCase();
    if (this._embedCache.has(key)) {
      const hit = this._embedCache.get(key);
      this._embedCache.delete(key);
      this._embedCache.set(key, hit);
      return hit;
    }
    const data = await this._callOpenAI('/embeddings', {
      model: EMBEDDING_MODEL,
      input: text,
    }, null, { timeoutMs: EMBED_TIMEOUT_MS });
    const embedding = data.data[0].embedding;
    this._embedCache.set(key, embedding);
    if (this._embedCache.size > EMBED_CACHE_MAX) {
      this._embedCache.delete(this._embedCache.keys().next().value);
    }
    return embedding;
  }

  // ─── Semantic Search (Supabase pgvector) ───────────────────────────────────

  async search(query, topK = TOP_K) {
    const queryEmbedding = await this._embedQuery(query);
    const t = timeoutSignal(SEARCH_TIMEOUT_MS);
    let data, error;
    try {
      ({ data, error } = await supabase.rpc('match_chunks', {
        query_embedding: queryEmbedding,
        query_text: query,
        match_count: topK * RETRIEVAL_OVERSAMPLE,
        min_similarity: MIN_SIMILARITY,
      }).abortSignal(t.signal));
    } finally {
      t.cancel();
    }
    if (error) throw new Error(`Supabase search error: ${error.message}`);
    return capBySourceFamily(data ?? [], topK, MAX_PER_SOURCE_FAMILY);
  }

  // ─── Streaming Chat ────────────────────────────────────────────────────────
  // Async generator yielding cleaned text chunks (inline [S#] markers stripped
  // for readable streaming / TTS). At stream end, timingCbs.onSources gets the
  // validated sources and timingCbs.onFinal gets extractCitations' full result
  // ({ text with renumbered [1..n], sources }) for the chat transcript.

  async *chatStream(userMessage, conversationHistory = [], timingCbs = null,
                    { conciseMode = false, responseStyle = 'balanced', jargonMode = 'explain',
                      ariaPersonality = 'warm', isCaregiversSetup = false,
                      skipThrottle = false, preRetrievedChunks = null, signal = null } = {}) {
    const transport = openaiTransport();
    if (!transport) throw new OpenAIAuthError('No API key configured');

    if (skipThrottle) {
      this._lastRequestAt = Date.now();
    } else {
      await this._throttle();
    }

    // Retrieval failure degrades to a zero-chunk answer (v2 prompt handles it).
    let chunks = [];
    if (preRetrievedChunks) {
      chunks = preRetrievedChunks;
    } else {
      try {
        chunks = await this.search(userMessage, TOP_K);
      } catch (err) {
        console.warn(`[RAG] retrieval failed (${err.message ?? err}) — answering without passages`);
        emit('fallback', { kind: 'empty_retrieval', reason: String(err?.message ?? err).slice(0, 120) });
      }
    }
    if (chunks.length === 0) emit('fallback', { kind: 'no_passages' });
    timingCbs?.onRagDone?.();
    const userContent = buildUserContent(userMessage, chunks);

    const recentHistory = conversationHistory.slice(-MAX_HISTORY).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const inlineCitations = CITATION_MODE === 'inline';
    const messages = [
      { role: 'system', content: buildSystemPrompt({ conciseMode, responseStyle, jargonMode, ariaPersonality, isCaregiversSetup, includeSources: inlineCitations }) },
      ...recentHistory,
      { role: 'user', content: userContent },
    ];

    // Total cap + time-to-first-byte watchdog, both via one AbortController.
    const ac = new AbortController();
    const onOuterAbort = () => ac.abort();
    signal?.addEventListener('abort', onOuterAbort, { once: true });
    let timedOut = null;
    const totalTimer = setTimeout(() => { timedOut = 'OpenAI stream timed out'; ac.abort(); }, LLM_TOTAL_TIMEOUT_MS);
    let ttfbTimer = setTimeout(() => { timedOut = 'OpenAI stream timed out waiting for first response'; ac.abort(); }, LLM_TTFB_TIMEOUT_MS);
    const clearTtfb = () => { if (ttfbTimer) { clearTimeout(ttfbTimer); ttfbTimer = null; } };

    const stripper = inlineCitations ? createMarkerStripper() : null;
    let rawFull = '';

    try {
      let resp;
      try {
        resp = await fetch(openaiUrl(transport, '/chat/completions'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...transport.headers,
          },
          body: JSON.stringify({
            model: CHAT_MODEL,
            messages,
            max_tokens: maxTokensForStyle(responseStyle, conciseMode),
            temperature: GENERATION_TEMPERATURE,
            stream: true,
          }),
          signal: ac.signal,
        });
      } catch (err) {
        if (timedOut) throw new Error(timedOut);
        throw err;
      }
      timingCbs?.onLlmSend?.();

      await throwForStatus(resp, transport, 'OpenAI error');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        let chunk;
        try {
          chunk = await reader.read();
        } catch (err) {
          if (timedOut) throw new Error(timedOut);
          throw err;
        }
        if (chunk.done) break;
        clearTtfb();
        buf += decoder.decode(chunk.value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop(); // keep the trailing partial line
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const d = t.slice(5).trim();
          if (d === '[DONE]') continue;
          let parsed;
          try {
            parsed = JSON.parse(d);
          } catch { continue; }
          // The proxy emits this when the upstream stream broke after headers
          // were already sent. Treating it as end-of-stream would render a
          // truncated answer as a complete one.
          if (parsed?.error === 'stream_interrupted') {
            throw new Error('The answer was cut off — please try again.');
          }
          const content = parsed?.choices?.[0]?.delta?.content;
          if (!content) continue;
          if (stripper) {
            rawFull += content;
            const clean = stripper.write(content);
            if (clean) yield clean;
          } else {
            yield content;
          }
        }
      }

      if (stripper) {
        const tail = stripper.flush();
        if (tail) yield tail;
        const final = extractCitations(rawFull, chunks);
        timingCbs?.onSources?.(final.sources);
        timingCbs?.onFinal?.(final);
      }
    } finally {
      clearTtfb();
      clearTimeout(totalTimer);
      signal?.removeEventListener('abort', onOuterAbort);
    }
  }

  // ─── OpenAI TTS (RMS-lipsync fallback voice) ───────────────────────────────

  async tts(text, voice = 'nova') {
    const transport = openaiTransport();
    if (!transport) throw new OpenAIAuthError('No API key configured');

    // The proxy fixes model and format server-side, so only voice and input go up.
    const body = transport.proxied
      ? { voice, input: text }
      : { model: 'tts-1', voice, input: text, response_format: 'mp3' };

    const resp = await fetch(openaiUrl(transport, '/audio/speech'), {
      method: 'POST',
      headers: {
        ...transport.headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    await throwForStatus(resp, transport, 'TTS error');

    const buffer = await resp.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return `data:audio/mpeg;base64,${btoa(binary)}`;
  }

  // ─── Whisper Transcription ─────────────────────────────────────────────────

  async transcribe(blob, filename = 'recording.webm') {
    const transport = openaiTransport();
    if (!transport) throw new OpenAIAuthError('No API key configured');

    const formData = new FormData();
    formData.append('file', blob, filename);
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');

    const t = timeoutSignal(WHISPER_TIMEOUT_MS);
    let resp;
    try {
      resp = await fetch(openaiUrl(transport, '/audio/transcriptions'), {
        method: 'POST',
        headers: { ...transport.headers },
        body: formData,
        signal: t.signal,
      });
    } catch (err) {
      throw /abort/i.test(err?.message ?? '') || err?.name === 'AbortError'
        ? new Error('Transcription timed out — please check your connection and try again')
        : err;
    } finally {
      t.cancel();
    }

    await throwForStatus(resp, transport, 'Whisper error');

    const data = await resp.json();
    return data.text?.trim() ?? '';
  }
}

export const openaiClient = new OpenAIClient();
export { OpenAIAuthError, OpenAIRateLimitError, StudyAccessError };

// ─── Chat-screen entry point (used by services/chatService.js) ───────────────
// Streams cleaned text into onToken; resolves with the final transcript text
// (renumbered [1..n] markers), drawer-ready citations, and a safety flag.
import { mapSettingsToRag } from '../state/mapSettingsToRag.js';
import { matchSourceToArticle } from './kbToLibrary.js';

// The design's amber "If you need help now" callout. The model itself handles
// safety in the v2-nz-safety prompt; this flag only adds the visual treatment
// for clearly high-risk topics.
const SAFETY_RE = /(aggress|violen|hit|hurt|harm|suicid|self.?harm|danger|emergency|missing|lost and)/i;

// Drawer-ready citations from validated KB sources (shared with the voice path).
export function mapSourcesToCitations(sources) {
  return (sources || []).map((s) => {
    const match = matchSourceToArticle(s);
    return {
      title: s.title,
      org: s.org,
      url: s.url,
      excerpt: s.excerpt,
      num: s.num,
      ...(match ? { articleId: match.id, cat: match.cat } : {}),
    };
  });
}

export async function realGenerate({ question, settings, history, signal, onToken, onStage }) {
  const opts = { ...mapSettingsToRag(settings), signal };
  const apiHistory = (history || [])
    .filter((m) => m.text && !m.streaming)
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
  // Drop the just-appended current question — it goes in as the prompt itself.
  if (apiHistory.length && apiHistory[apiHistory.length - 1].role === 'user'
      && apiHistory[apiHistory.length - 1].content === question) {
    apiHistory.pop();
  }

  let final = null;
  let acc = '';
  // onStage carries the same stage boundaries the voice path marks, so the text
  // arm of the study is measured on the same clock as the avatar arm.
  const stream = openaiClient.chatStream(question, apiHistory, {
    onRagDone: () => onStage?.('ragDone'),
    onLlmSend: () => onStage?.('llmSend'),
    onFinal: (f) => { final = f; },
  }, opts);
  for await (const piece of stream) {
    onStage?.('firstToken');
    acc += piece;
    onToken(acc);
  }

  const text = final?.text || acc;
  const citations = mapSourcesToCitations(final?.sources);
  return { text, citations, sources: final?.sources || [], safety: SAFETY_RE.test(question) };
}
