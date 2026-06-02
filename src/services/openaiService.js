import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabaseService';

const SECURE_KEY = 'openai_api_key';
const OPENAI_BASE = 'https://api.openai.com/v1';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const CHAT_MODEL = 'gpt-4o-mini';
const MIN_SIMILARITY = 0.25;
const TOP_K = 5;
const MAX_HISTORY = 6;

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
      match_count: topK,
      min_similarity: MIN_SIMILARITY,
    });
    if (error) throw new Error(`Supabase search error: ${error.message}`);
    return data ?? [];
  }

  // ─── Streaming Chat ─────────────────────────────────────────────────────────
  // Async generator — yields text chunks as they stream from the API so the
  // caller can start TTS on completed sentences before the full response arrives.

  async *chatStream(userMessage, conversationHistory = [], timingCbs = null, { conciseMode = false } = {}) {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new OpenAIAuthError('No API key configured');

    const chunks = await this.search(userMessage, TOP_K);
    timingCbs?.onRagDone?.();
    const contextBlock = chunks.length > 0
      ? `[CONTEXT]\n${chunks.map(c => `--- ${c.title} ---\n${c.content}`).join('\n\n')}\n[/CONTEXT]`
      : '[CONTEXT]\nNo specific knowledge base entries matched this query.\n[/CONTEXT]';

    const recentHistory = conversationHistory.slice(-MAX_HISTORY).map(m => ({
      role: m.role,
      content: m.content,
    }));

    const messages = [
      { role: 'system', content: this._buildSystemPrompt(conciseMode) },
      ...recentHistory,
      { role: 'user', content: `${contextBlock}\n\nUser question: ${userMessage}` },
    ];

    const body = JSON.stringify({
      model: CHAT_MODEL,
      messages,
      max_tokens: 600,
      temperature: 0.4,
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

  // ─── System Prompt ──────────────────────────────────────────────────────────

  _buildSystemPrompt(conciseMode = false) {
    const conciseRule = conciseMode
      ? '\n8. CONCISE MODE IS ON: Answer in 1–2 short paragraphs maximum. Lead with the direct answer immediately — no preamble, no filler phrases ("Great question!", "Of course!", "Certainly!"), no restating the question. Cut any sentence that does not add new information. Plain words only; no jargon.'
      : '';
    return `You are Aria, a compassionate and knowledgeable AI assistant created to support family caregivers, healthcare workers, and families caring for people with dementia. You work like a specialised library — every answer you give is grounded in the curated knowledge passages provided to you.

IMPORTANT RULES:
1. Base your response ONLY on the context passages provided. Do not draw on outside knowledge.
2. If the context passages do not contain enough information to answer the question, say so honestly: "I don't have specific information about that in my knowledge base, but I recommend speaking with your GP or Dementia Australia (1800 100 500)."
3. Be warm, empathetic, and emotionally supportive — caregiving is hard, and the person reading your response may be exhausted or distressed.
4. Use plain, everyday language. Avoid medical jargon unless you explain the term immediately after.
5. Keep responses concise — aim for 2 to 4 short paragraphs. People are often reading on a phone.
6. After your response, on a new line, write "Sources:" followed by a bullet list of the knowledge base titles you drew from (one per line, starting with "·"). Only list sources you actually used.
7. Always end with a brief reminder that your information is for guidance only and that a healthcare professional should be consulted for individual medical decisions.${conciseRule}`;
  }

  // ─── RAG Chat ───────────────────────────────────────────────────────────────

  async chat(userMessage, conversationHistory = [], { conciseMode = false } = {}) {
    // Retrieve relevant chunks
    const chunks = await this.search(userMessage, TOP_K);

    // Build context block
    const contextBlock = chunks.length > 0
      ? `[CONTEXT]\n${chunks.map(c => `--- ${c.title} ---\n${c.content}`).join('\n\n')}\n[/CONTEXT]`
      : '[CONTEXT]\nNo specific knowledge base entries matched this query.\n[/CONTEXT]';

    // Build messages — last MAX_HISTORY items from conversation history
    const recentHistory = conversationHistory.slice(-MAX_HISTORY).map(m => ({
      role: m.role,
      content: m.content,
    }));

    const messages = [
      { role: 'system', content: this._buildSystemPrompt(conciseMode) },
      ...recentHistory,
      {
        role: 'user',
        content: `${contextBlock}\n\nUser question: ${userMessage}`,
      },
    ];

    const data = await this._callOpenAI('/chat/completions', {
      model: CHAT_MODEL,
      messages,
      max_tokens: 600,
      temperature: 0.4,
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

    // Fall back to retrieved chunk titles if model didn't list sources
    if (sourceTitles.length === 0 && chunks.length > 0) {
      sourceTitles = chunks.slice(0, 3).map(c => c.title);
    }

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
