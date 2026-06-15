import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabaseService';

const SECURE_KEY = 'openai_api_key';
const OPENAI_BASE = 'https://api.openai.com/v1';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const CHAT_MODEL = 'gpt-4o-mini';
const MIN_SIMILARITY = 0.35;
const TOP_K = 8;
const MAX_HISTORY = 6;
const SEARCH_MULTIPLIER = 3;
const LOW_CONFIDENCE_THRESHOLD = 0.38;
const ROUTING_KEYWORDS = {
  module5Behaviour: [
    'aggression', 'hallucination', 'delusion', 'wandering', 'lost', 'repetitive',
    'sundowning', 'behaviour', 'behavior', 'sleep', 'judgement', 'judgment', 'anxiety',
  ],
  module3SelfCare: [
    'stress', 'burnout', 'exhausted', 'guilt', 'self care', 'self-care',
    'pleasant activities', 'thinking differently', 'overwhelmed',
  ],
};

class OpenAIAuthError extends Error {
  constructor(msg) { super(msg); this.name = 'OpenAIAuthError'; }
}
class OpenAIRateLimitError extends Error {
  constructor(msg) { super(msg); this.name = 'OpenAIRateLimitError'; }
}

class OpenAIService {
  constructor() {
    this._cachedKey = null;
    this._lastChunkMap = {};
  }

  // Public wrapper — call this after chatStream finishes to get resolved citations.
  // Pass the full accumulated text from the stream.
  resolveStreamCitations(fullText) {
    return this._parseCitations(fullText, this._lastChunkMap);
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

  _extractTagValue(tags = [], prefix) {
    const hit = tags.find(t => t.startsWith(`${prefix}:`));
    return hit ? hit.slice(prefix.length + 1) : null;
  }

  _buildRetrievalPolicy(query) {
    const q = query.toLowerCase();
    const prefersModule5 = ROUTING_KEYWORDS.module5Behaviour.some(k => q.includes(k));
    const prefersModule3 = ROUTING_KEYWORDS.module3SelfCare.some(k => q.includes(k));

    // Keep NZ as default for this project's current iSupport rollout.
    const country = q.includes('aotearoa') || q.includes('new zealand') || q.includes('nz') ? 'nz' : 'nz';

    return {
      requiredTags: [
        `country:${country}`,
      ],
      preferredTags: [
        ...(prefersModule5 ? ['module:5'] : []),
        ...(prefersModule3 ? ['module:3'] : []),
      ],
      prefersModule5,
      prefersModule3,
    };
  }

  _hasAllTags(chunk, requiredTags) {
    if (!requiredTags || requiredTags.length === 0) return true;
    const tagSet = new Set(chunk.tags ?? []);
    return requiredTags.every(tag => tagSet.has(tag));
  }

  _rerankChunks(chunks, preferredTags = []) {
    const prefSet = new Set(preferredTags);
    return [...chunks]
      .map(c => {
        const tags = new Set(c.tags ?? []);
        let boost = 0;
        for (const tag of prefSet) {
          if (tags.has(tag)) boost += 0.08;
        }
        if (tags.has('chunk_level:child')) boost += 0.04;
        return { ...c, similarity: (Number(c.similarity) || 0) + boost };
      })
      .sort((a, b) => (Number(b.similarity) || 0) - (Number(a.similarity) || 0));
  }

  async _fetchParentSummaries(parentKeys = []) {
    const unique = [...new Set(parentKeys.filter(Boolean))];
    if (unique.length === 0) return [];

    const parents = [];
    for (const parentKey of unique) {
      const { data, error } = await supabase
        .from('knowledge_chunks')
        .select('id, category, title, content, tags, source_url, source_org')
        .contains('tags', ['chunk_level:parent', `parent_key:${parentKey}`])
        .limit(1);

      if (error) continue;
      if (data?.[0]) {
        parents.push({ ...data[0], similarity: 0.25 });
      }
    }

    return parents;
  }

  async search(query, topK = TOP_K) {
    const queryEmbedding = await this._embedQuery(query);
    const policy = this._buildRetrievalPolicy(query);

    let data;
    let error;

    // Prefer richer RPC signature when the DB function supports it.
    ({ data, error } = await supabase.rpc('match_chunks', {
      query_embedding: queryEmbedding,
      query_text: query,
      match_count: topK * SEARCH_MULTIPLIER,
      min_similarity: MIN_SIMILARITY,
      filter_country: this._extractTagValue(policy.requiredTags, 'country'),
      filter_source_version: null,
      filter_document_id: null,
      filter_module: policy.prefersModule5 ? 5 : (policy.prefersModule3 ? 3 : null),
    }));

    // Backward-compatible fallback for older SQL function signature.
    if (error && /function match_chunks\(/i.test(error.message)) {
      ({ data, error } = await supabase.rpc('match_chunks', {
        query_embedding: queryEmbedding,
        query_text: query,
        match_count: topK * SEARCH_MULTIPLIER,
        min_similarity: MIN_SIMILARITY,
      }));
    }

    if (error) throw new Error(`Supabase search error: ${error.message}`);

    const base = data ?? [];
    const stageA = base.filter(c => this._hasAllTags(c, policy.requiredTags));
    const ranked = this._rerankChunks(stageA.length > 0 ? stageA : base, policy.preferredTags);
    const topChildren = ranked
      .filter(c => !(c.tags ?? []).includes('chunk_level:parent'))
      .slice(0, topK);

    const parentKeys = topChildren.map(c => this._extractTagValue(c.tags ?? [], 'parent_key')).filter(Boolean);
    const parentSummaries = await this._fetchParentSummaries(parentKeys);

    return [...parentSummaries, ...topChildren].slice(0, topK + 2);
  }

  _isLowConfidence(chunks) {
    if (!chunks || chunks.length === 0) return true;
    const best = Number(chunks[0]?.similarity) || 0;
    return best < LOW_CONFIDENCE_THRESHOLD;
  }

  _buildLowConfidenceReply(question) {
    const lower = question.toLowerCase();
    const clarification =
      lower.includes('sleep')
        ? 'Could you share when the sleep change started and what has already been tried at home?'
        : lower.includes('aggression') || lower.includes('hallucination')
          ? 'Could you share what tends to happen right before the behaviour change, and whether there are safety risks right now?'
          : 'Could you share a little more detail about the person\'s current symptoms and situation so I can narrow this to the most relevant guidance?';

    return `I do not have strong enough matching information in the current knowledge base to answer confidently. ${clarification}\n\nThis information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions.`;
  }

  // ─── Streaming Chat ─────────────────────────────────────────────────────────
  // Async generator — yields text chunks as they stream from the API so the
  // caller can start TTS on completed sentences before the full response arrives.

  async *chatStream(userMessage, conversationHistory = [], timingCbs = null) {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new OpenAIAuthError('No API key configured');

    const chunks = await this.search(userMessage, TOP_K);
    timingCbs?.onRagDone?.();

    if (this._isLowConfidence(chunks)) {
      this._lastChunkMap = {};
      yield this._buildLowConfidenceReply(userMessage);
      return;
    }

    const { contextBlock, chunkMap } = this._buildContextBlock(chunks);

    const recentHistory = conversationHistory.slice(-MAX_HISTORY).map(m => ({
      role: m.role,
      content: m.content,
    }));

    const messages = [
      { role: 'system', content: this._buildSystemPrompt() },
      ...recentHistory,
      { role: 'user', content: `${contextBlock}\n\nUser question: ${userMessage}` },
    ];

    // Store chunkMap on the generator so the caller can resolve citations
    // after streaming completes. We expose it as a property on the generator.
    this._lastChunkMap = chunkMap;

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

  _buildSystemPrompt() {
    return `You are Aria, a compassionate and knowledgeable AI assistant created to support family caregivers, healthcare workers, and families caring for people with dementia. You work like a specialised library — every answer you give is grounded in the curated knowledge passages provided to you.

IMPORTANT RULES:
1. Base your response ONLY on the numbered context passages provided. Do not draw on outside knowledge.
2. Whenever you use information from a passage, place its number in square brackets immediately after the relevant sentence — e.g. "Alzheimer's disease affects 2 in 3 people with dementia [1]." Use the number that matches the passage header (--- Source [N] ---).
3. You may cite the same source multiple times, and you may cite multiple sources in one sentence: [1][3].
4. If the context passages do not contain enough information to answer the question, say so honestly: "I don't have specific information about that in my knowledge base, but I recommend speaking with your GP or Dementia Australia (1800 100 500)."
5. Be warm, empathetic, and emotionally supportive — caregiving is hard, and the person reading your response may be exhausted or distressed.
6. Use plain, everyday language. Avoid medical jargon unless you explain the term immediately after.
7. Keep responses concise — aim for 2 to 4 short paragraphs. People are often reading on a phone.
8. Do NOT add a Sources section at the end. Citations are inline only.
  9. Always end every response with this exact closing sentence: "This information is for guidance only and does not replace professional medical advice. For more support, contact Dementia Australia on 1800 100 500 and consult a healthcare professional for individual decisions."`;
  }

  _sourceMeta(chunk) {
    const tags = chunk.tags ?? [];
    return {
      module: this._extractTagValue(tags, 'module'),
      section: this._extractTagValue(tags, 'section'),
      country: this._extractTagValue(tags, 'country'),
      sourceVersion: this._extractTagValue(tags, 'source_version'),
      documentId: this._extractTagValue(tags, 'document_id'),
      chunkLevel: this._extractTagValue(tags, 'chunk_level'),
    };
  }

  // Build a numbered context block from retrieved chunks and return both
  // the formatted string and the index→chunk map for citation resolution.
  _buildContextBlock(chunks) {
    if (chunks.length === 0) {
      return {
        contextBlock: '[CONTEXT]\nNo specific knowledge base entries matched this query.\n[/CONTEXT]',
        chunkMap: {},
      };
    }

    const lines = chunks.map((c, i) => {
      const meta = this._sourceMeta(c);
      const labels = [
        meta.module ? `Module ${meta.module}` : null,
        meta.section ? `Section ${meta.section}` : null,
        meta.country ? `Country ${meta.country.toUpperCase()}` : null,
        meta.sourceVersion ? `Version ${meta.sourceVersion}` : null,
        meta.chunkLevel ? `Level ${meta.chunkLevel}` : null,
      ].filter(Boolean);

      const suffix = labels.length > 0 ? ` | ${labels.join(' | ')}` : '';
      return `--- Source [${i + 1}] | ${c.title}${suffix} ---\n${c.content}`;
    });

    return {
      contextBlock: `[CONTEXT]\n${lines.join('\n\n')}\n[/CONTEXT]`,
      chunkMap: Object.fromEntries(chunks.map((c, i) => [i + 1, c])),
    };
  }

  // Parse inline [N] citation markers out of the model's response text.
  // Returns { cleanText, citations } where citations is an array of unique
  // source objects in the order they first appear.
  _parseCitations(rawText, chunkMap) {
    const usedNums = [];
    rawText.replace(/\[(\d+)\]/g, (_, n) => {
      const num = parseInt(n, 10);
      if (chunkMap[num] && !usedNums.includes(num)) usedNums.push(num);
    });

    const citations = usedNums.map(num => {
      const c = chunkMap[num];
      const meta = this._sourceMeta(c);
      const excerpt = c.content
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180)
        .replace(/\s\S*$/, '') + '…';
      return {
        num,
        title: c.title,
        org: c.source_org ?? null,
        url: c.source_url ?? null,
        module: meta.module,
        section: meta.section,
        country: meta.country,
        documentId: meta.documentId,
        excerpt,
      };
    });

    return { cleanText: rawText, citations };
  }

  // ─── RAG Chat ───────────────────────────────────────────────────────────────

  async chat(userMessage, conversationHistory = []) {
    const chunks = await this.search(userMessage, TOP_K);
    if (this._isLowConfidence(chunks)) {
      return { text: this._buildLowConfidenceReply(userMessage), sources: [] };
    }

    const { contextBlock, chunkMap } = this._buildContextBlock(chunks);

    const recentHistory = conversationHistory.slice(-MAX_HISTORY).map(m => ({
      role: m.role,
      content: m.content,
    }));

    const messages = [
      { role: 'system', content: this._buildSystemPrompt() },
      ...recentHistory,
      { role: 'user', content: `${contextBlock}\n\nUser question: ${userMessage}` },
    ];

    const data = await this._callOpenAI('/chat/completions', {
      model: CHAT_MODEL,
      messages,
      max_tokens: 600,
      temperature: 0.4,
    });

    const rawText = data.choices[0].message.content.trim();
    const { cleanText, citations } = this._parseCitations(rawText, chunkMap);
    return { text: cleanText, sources: citations };
  }
}

export const openaiService = new OpenAIService();
export { OpenAIAuthError, OpenAIRateLimitError };
