import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabaseService';
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
} from './rag/ragConfig';
import { buildSystemPrompt, buildUserContent } from './rag/prompt';
import { capBySourceFamily } from './rag/retrieval';
import { extractCitations, createMarkerStripper } from './rag/citations';
import { recordRetrieval } from './ragTelemetry';
import { timeoutSignal } from './net/withTimeout';

const SECURE_KEY = 'openai_api_key';
const OPENAI_BASE = 'https://api.openai.com/v1';
const EMBED_CACHE_MAX = 20;   // LRU of recent query embeddings (repeat/retry queries skip a network call)
const MIN_REQUEST_INTERVAL_MS = 750; // client-side pacing between chat requests

// Hot-path timeouts. A stalled request without one hangs the whole voice turn.
// Embedding/search timeouts degrade to a zero-chunk answer (the v2 prompt
// handles missing passages); the others surface as user-visible errors.
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

class OpenAIService {
  constructor() {
    this._cachedKey = null;
    this._embedCache = new Map(); // query → embedding (LRU via delete+set)
    this._lastRequestAt = 0;
  }

  // Simple client-side pacing: space chat requests at least
  // MIN_REQUEST_INTERVAL_MS apart so a stuck button / rapid voice loop can't
  // burn the user's OpenAI quota.
  async _throttle() {
    const wait = this._lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    this._lastRequestAt = Date.now();
  }

  // ─── API Key ────────────────────────────────────────────────────────────────

  async saveApiKey(key) {
    const trimmed = key.trim();
    await SecureStore.setItemAsync(SECURE_KEY, trimmed);
    this._cachedKey = trimmed;
  }

  async getApiKey() {
    if (!this._cachedKey) {
      this._cachedKey = await SecureStore.getItemAsync(SECURE_KEY);
    }
    return this._cachedKey;
  }

  async clearApiKey() {
    await SecureStore.deleteItemAsync(SECURE_KEY);
    this._cachedKey = null;
  }

  async hasApiKey() {
    const k = await this.getApiKey();
    return !!k && k.length > 10;
  }





  // ─── Raw OpenAI Calls ───────────────────────────────────────────────────────

  async _callOpenAI(endpoint, body, apiKey, { timeoutMs = null } = {}) {
    const key = apiKey ?? (await this.getApiKey());
    const t = timeoutMs ? timeoutSignal(timeoutMs) : null;
    let resp;
    try {
      resp = await fetch(`${OPENAI_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify(body),
        ...(t ? { signal: t.signal } : {}),
      });
    } finally {
      t?.cancel();
    }

    if (resp.status === 401) throw new OpenAIAuthError('Invalid API key');
    if (resp.status === 429) throw new OpenAIRateLimitError('Rate limit reached');
    if (!resp.ok) {
      const err = await resp.text().catch(() => `HTTP ${resp.status}`);
      throw new Error(`OpenAI error: ${err}`);
    }

    return resp.json();
  }

  async _embedQuery(text) {
    const key = text.trim().toLowerCase();
    if (this._embedCache.has(key)) {
      // LRU refresh
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

  // ─── Semantic Search (Supabase pgvector) ────────────────────────────────────

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

  // ─── Streaming Chat ─────────────────────────────────────────────────────────
  // Async generator — yields text chunks as they stream from the API so the
  // caller can start TTS on completed sentences before the full response arrives.

  async *chatStream(userMessage, conversationHistory = [], timingCbs = null,
                    { conciseMode = false, responseStyle = 'balanced', jargonMode = 'explain',
                      ariaPersonality = 'warm', isCaregiversSetup = false,
                      skipThrottle = false, preRetrievedChunks = null } = {}) {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new OpenAIAuthError('No API key configured');

    // The voice pipeline is already serialized by its state machine, so pacing
    // there is pure dead time on the hot path. Text chat keeps the throttle.
    if (skipThrottle) {
      this._lastRequestAt = Date.now();
    } else {
      await this._throttle();
    }

    // Retrieval. preRetrievedChunks (speculative retrieval fired during live
    // STT) skips the search entirely — the chunks flow into the identical
    // prompt construction below, so citations/safety behaviour is unchanged.
    // Retrieval failure (timeout, Supabase outage) degrades to a zero-chunk
    // answer instead of killing the turn — buildUserContent sends the bare
    // question and the v2 prompt's no-passage rules take over.
    const ragStart = Date.now();
    let chunks = [];
    if (preRetrievedChunks) {
      chunks = preRetrievedChunks;
    } else {
      try {
        chunks = await this.search(userMessage, TOP_K);
      } catch (err) {
        console.warn(`[RAG] retrieval failed (${err.message ?? err}) — answering without passages`);
      }
    }
    timingCbs?.onRagDone?.();
    recordRetrieval({
      queryLength: userMessage.length,
      retrieved: chunks,
      ragMs: Date.now() - ragStart,
      path: preRetrievedChunks ? 'voice-speculative' : 'voice',
    });
    const userContent = buildUserContent(userMessage, chunks);

    const recentHistory = conversationHistory.slice(-MAX_HISTORY).map(m => ({
      role: m.role,
      content: m.content,
    }));

    // Inline mode: markers are stripped from the stream before TTS and the
    // structured sources are delivered via timingCbs.onSources at stream end.
    // Trailing mode keeps includeSources:false (a "Sources:" list would be
    // spoken aloud).
    const inlineCitations = CITATION_MODE === 'inline';
    const messages = [
      { role: 'system', content: buildSystemPrompt({ conciseMode, responseStyle, jargonMode, ariaPersonality, isCaregiversSetup, includeSources: inlineCitations }) },
      ...recentHistory,
      { role: 'user', content: userContent },
    ];

    const body = JSON.stringify({
      model: CHAT_MODEL,
      messages,
      max_tokens: maxTokensForStyle(responseStyle, conciseMode),
      temperature: GENERATION_TEMPERATURE,
      stream: true,
    });

    // React Native's fetch doesn't expose resp.body as a ReadableStream,
    // so we use XHR onprogress to receive SSE chunks incrementally.
    const pending = [];
    let notify = null;
    let finished = false;
    let streamError = null;
    let cursor = 0;

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${OPENAI_BASE}/chat/completions`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`);

    const wake = () => { const n = notify; notify = null; n?.(); };

    // Overall cap plus a time-to-first-byte watchdog: mobile radios can hold a
    // dead socket open for minutes; 12s with zero bytes means the turn is lost.
    xhr.timeout = LLM_TOTAL_TIMEOUT_MS;
    xhr.ontimeout = () => {
      streamError = streamError ?? new Error('OpenAI stream timed out');
      finished = true;
      wake();
    };
    let ttfbTimer = setTimeout(() => {
      ttfbTimer = null;
      streamError = new Error('OpenAI stream timed out waiting for first response');
      finished = true;
      try { xhr.abort(); } catch {}
      wake();
    }, LLM_TTFB_TIMEOUT_MS);
    const clearTtfb = () => { if (ttfbTimer) { clearTimeout(ttfbTimer); ttfbTimer = null; } };

    xhr.onprogress = () => {
      clearTtfb();
      const raw = xhr.responseText.slice(cursor);
      cursor = xhr.responseText.length;
      for (const line of raw.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const d = t.slice(5).trim();
        if (d === '[DONE]') continue;
        try {
          const content = JSON.parse(d)?.choices?.[0]?.delta?.content;
          if (content) pending.push(content);
        } catch {}
      }
      wake();
    };

    xhr.onload = () => {
      clearTtfb();
      if (xhr.status === 401) streamError = new OpenAIAuthError('Invalid API key');
      else if (xhr.status === 429) streamError = new OpenAIRateLimitError('Rate limit reached');
      else if (xhr.status >= 400) streamError = new Error(`OpenAI error: HTTP ${xhr.status}`);
      finished = true;
      wake();
    };

    xhr.onerror = () => {
      clearTtfb();
      streamError = streamError ?? new Error('XHR stream failed');
      finished = true;
      wake();
    };

    xhr.send(body);
    timingCbs?.onLlmSend?.();

    const stripper = inlineCitations ? createMarkerStripper() : null;
    let rawFull = '';

    while (true) {
      while (pending.length > 0) {
        const piece = pending.shift();
        if (stripper) {
          rawFull += piece;
          const cleanPiece = stripper.write(piece);
          if (cleanPiece) yield cleanPiece;
        } else {
          yield piece;
        }
      }
      if (finished) break;
      await new Promise(r => { notify = r; });
    }

    if (stripper) {
      const tail = stripper.flush();
      if (tail) yield tail;
      timingCbs?.onSources?.(extractCitations(rawFull, chunks).sources);
    }

    if (streamError) throw streamError;
  }

  // ─── OpenAI TTS ─────────────────────────────────────────────────────────────

  async tts(text, voice = 'nova') {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new OpenAIAuthError('No API key configured');

    const resp = await fetch(`${OPENAI_BASE}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'tts-1', voice, input: text, response_format: 'mp3' }),
    });

    if (resp.status === 401) throw new OpenAIAuthError('Invalid API key');
    if (resp.status === 429) throw new OpenAIRateLimitError('Rate limit reached');
    if (!resp.ok) {
      const err = await resp.text().catch(() => `HTTP ${resp.status}`);
      throw new Error(`TTS error: ${err}`);
    }

    const buffer = await resp.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return `data:audio/mpeg;base64,${btoa(binary)}`;
  }

  // ─── Whisper Transcription ──────────────────────────────────────────────────

  async transcribe(audioUri) {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new OpenAIAuthError('No API key configured');

    const ext = audioUri.split('.').pop()?.toLowerCase() ?? 'm4a';
    const mimeType = ext === 'wav' ? 'audio/wav' : ext === 'mp3' ? 'audio/mpeg' : 'audio/m4a';

    const formData = new FormData();
    formData.append('file', { uri: audioUri, type: mimeType, name: `recording.${ext}` });
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');

    const t = timeoutSignal(WHISPER_TIMEOUT_MS);
    let resp;
    try {
      resp = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
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

    if (resp.status === 401) throw new OpenAIAuthError('Invalid API key');
    if (resp.status === 429) throw new OpenAIRateLimitError('Rate limit reached');
    if (!resp.ok) {
      const err = await resp.text().catch(() => `HTTP ${resp.status}`);
      throw new Error(`Whisper error: ${err}`);
    }

    const data = await resp.json();
    return data.text?.trim() ?? '';
  }

  // ─── RAG Chat ───────────────────────────────────────────────────────────────
  // System prompt + user-content construction live in ./rag/prompt.js — the
  // single definition shared with the eval scripts.

  async chat(userMessage, conversationHistory = [],
             { conciseMode = false, responseStyle = 'balanced', jargonMode = 'explain',
               ariaPersonality = 'warm', isCaregiversSetup = false } = {}) {
    // Retrieve relevant chunks
    await this._throttle();
    const ragStart = Date.now();
    const chunks = await this.search(userMessage, TOP_K);
    recordRetrieval({ queryLength: userMessage.length, retrieved: chunks, ragMs: Date.now() - ragStart, path: 'chat' });

    const userContent = buildUserContent(userMessage, chunks);

    // Build messages — last MAX_HISTORY items from conversation history
    const recentHistory = conversationHistory.slice(-MAX_HISTORY).map(m => ({
      role: m.role,
      content: m.content,
    }));

    const messages = [
      { role: 'system', content: buildSystemPrompt({ conciseMode, responseStyle, jargonMode, ariaPersonality, isCaregiversSetup, includeSources: true }) },
      ...recentHistory,
      {
        role: 'user',
        content: userContent,
      },
    ];

    const data = await this._callOpenAI('/chat/completions', {
      model: CHAT_MODEL,
      messages,
      max_tokens: maxTokensForStyle(responseStyle, conciseMode),
      temperature: GENERATION_TEMPERATURE,
    });

    const rawText = data.choices[0].message.content.trim();

    if (CITATION_MODE === 'inline') {
      // Validated inline citations: [S#] markers are checked against the
      // passages actually supplied, renumbered to [1..n] for the tappable
      // badges in ChatScreen, and hallucinated markers are stripped.
      return extractCitations(rawText, chunks);
    }

    // Legacy trailing-"Sources:" mode (CITATION_MODE='trailing' rollback).
    const sourcesMatch = rawText.match(/Sources:\s*([\s\S]+?)(?:\n\n|$)/i);
    let responseText = rawText;
    let sourceTitles = [];

    if (sourcesMatch) {
      responseText = rawText.slice(0, rawText.indexOf(sourcesMatch[0])).trim();
      sourceTitles = sourcesMatch[1]
        .split('\n')
        .map(s => s.replace(/^[·\-\*•]\s*/, '').trim())
        .filter(Boolean);
    }

    // No fallback to retrieved chunk titles: if the model listed no sources, it
    // answered from general knowledge and showing source chips would be misleading.

    // Enrich titles with source_url and source_org from matched chunks
    const chunkByTitle = new Map(chunks.map(c => [c.title, c]));
    const sources = sourceTitles.map(title => ({
      title,
      url: chunkByTitle.get(title)?.source_url ?? null,
      org: chunkByTitle.get(title)?.source_org ?? null,
    }));

    return { text: responseText, sources };
  }
}

export const openaiService = new OpenAIService();
export { OpenAIAuthError, OpenAIRateLimitError };
