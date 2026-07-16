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
  maxTokensForStyle,
} from './rag/ragConfig';
import { buildSystemPrompt, buildUserContent } from './rag/prompt';
import { capBySourceFamily } from './rag/retrieval';

const SECURE_KEY = 'openai_api_key';
const OPENAI_BASE = 'https://api.openai.com/v1';

class OpenAIAuthError extends Error {
  constructor(msg) { super(msg); this.name = 'OpenAIAuthError'; }
}
class OpenAIRateLimitError extends Error {
  constructor(msg) { super(msg); this.name = 'OpenAIRateLimitError'; }
}

class OpenAIService {
  constructor() {
    this._cachedKey = null;
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

  async _callOpenAI(endpoint, body, apiKey) {
    const key = apiKey ?? (await this.getApiKey());
    const resp = await fetch(`${OPENAI_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });

    if (resp.status === 401) throw new OpenAIAuthError('Invalid API key');
    if (resp.status === 429) throw new OpenAIRateLimitError('Rate limit reached');
    if (!resp.ok) {
      const err = await resp.text().catch(() => `HTTP ${resp.status}`);
      throw new Error(`OpenAI error: ${err}`);
    }

    return resp.json();
  }

  async _embedQuery(text) {
    const data = await this._callOpenAI('/embeddings', {
      model: EMBEDDING_MODEL,
      input: text,
    });
    return data.data[0].embedding;
  }

  // ─── Semantic Search (Supabase pgvector) ────────────────────────────────────

  async search(query, topK = TOP_K) {
    const queryEmbedding = await this._embedQuery(query);
    const { data, error } = await supabase.rpc('match_chunks', {
      query_embedding: queryEmbedding,
      query_text: query,
      match_count: topK * RETRIEVAL_OVERSAMPLE,
      min_similarity: MIN_SIMILARITY,
    });
    if (error) throw new Error(`Supabase search error: ${error.message}`);
    return capBySourceFamily(data ?? [], topK, MAX_PER_SOURCE_FAMILY);
  }

  // ─── Streaming Chat ─────────────────────────────────────────────────────────
  // Async generator — yields text chunks as they stream from the API so the
  // caller can start TTS on completed sentences before the full response arrives.

  async *chatStream(userMessage, conversationHistory = [], timingCbs = null,
                    { conciseMode = false, responseStyle = 'balanced', jargonMode = 'explain',
                      ariaPersonality = 'warm', isCaregiversSetup = false } = {}) {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new OpenAIAuthError('No API key configured');

    const chunks = await this.search(userMessage, TOP_K);
    timingCbs?.onRagDone?.();
    const userContent = buildUserContent(userMessage, chunks);

    const recentHistory = conversationHistory.slice(-MAX_HISTORY).map(m => ({
      role: m.role,
      content: m.content,
    }));

    const messages = [
      // Voice path: no Sources section — it would be spoken aloud by TTS.
      { role: 'system', content: buildSystemPrompt({ conciseMode, responseStyle, jargonMode, ariaPersonality, isCaregiversSetup, includeSources: false }) },
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

    xhr.onprogress = () => {
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
      if (xhr.status === 401) streamError = new OpenAIAuthError('Invalid API key');
      else if (xhr.status === 429) streamError = new OpenAIRateLimitError('Rate limit reached');
      else if (xhr.status >= 400) streamError = new Error(`OpenAI error: HTTP ${xhr.status}`);
      finished = true;
      wake();
    };

    xhr.onerror = () => {
      streamError = new Error('XHR stream failed');
      finished = true;
      wake();
    };

    xhr.send(body);
    timingCbs?.onLlmSend?.();

    while (true) {
      while (pending.length > 0) yield pending.shift();
      if (finished) break;
      await new Promise(r => { notify = r; });
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

    const resp = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

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
    const chunks = await this.search(userMessage, TOP_K);

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

    // Parse out Sources section if the model included it
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
