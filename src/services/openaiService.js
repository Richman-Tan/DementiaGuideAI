import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { KNOWLEDGE_BASE } from '../data/knowledgeBase';

const SECURE_KEY = 'openai_api_key';
const CACHE_KEY = 'kb_embeddings_v1';
const OPENAI_BASE = 'https://api.openai.com/v1';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const CHAT_MODEL = 'gpt-4o-mini';
const MIN_SIMILARITY = 0.25;
const TOP_K = 5;
const BATCH_SIZE = 20;
const MAX_HISTORY = 6;

class OpenAIAuthError extends Error {
  constructor(msg) { super(msg); this.name = 'OpenAIAuthError'; }
}
class OpenAIRateLimitError extends Error {
  constructor(msg) { super(msg); this.name = 'OpenAIRateLimitError'; }
}

class OpenAIService {
  constructor() {
    this._chunks = KNOWLEDGE_BASE.map(c => ({ ...c, embedding: null }));
    this.isInitialized = false;
    this._initPromise = null;
  }

  // ─── API Key ────────────────────────────────────────────────────────────────

  async saveApiKey(key) {
    await SecureStore.setItemAsync(SECURE_KEY, key.trim());
  }

  async getApiKey() {
    return SecureStore.getItemAsync(SECURE_KEY);
  }

  async clearApiKey() {
    await SecureStore.deleteItemAsync(SECURE_KEY);
  }

  async hasApiKey() {
    const k = await this.getApiKey();
    return !!k && k.length > 10;
  }

  // ─── Embedding Cache ────────────────────────────────────────────────────────

  async _loadCache() {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  async _saveCache(cache) {
    try {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch { /* non-critical */ }
  }

  // ─── Knowledge Base Init ────────────────────────────────────────────────────

  async initKnowledgeBase() {
    if (this.isInitialized) return;
    // Deduplicate concurrent calls
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._doInit().finally(() => { this._initPromise = null; });
    return this._initPromise;
  }

  async _doInit() {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new OpenAIAuthError('No API key configured');

    const cache = await this._loadCache();
    const missing = this._chunks.filter(c => !cache[c.id]);

    if (missing.length > 0) {
      // Batch embed missing chunks
      for (let i = 0; i < missing.length; i += BATCH_SIZE) {
        const batch = missing.slice(i, i + BATCH_SIZE);
        const texts = batch.map(c => `${c.title}. ${c.content}`);
        const embeddings = await this._batchEmbed(texts, apiKey);
        embeddings.forEach((emb, idx) => {
          cache[batch[idx].id] = emb;
        });
      }
      await this._saveCache(cache);
    }

    // Populate in-memory chunks with embeddings
    this._chunks.forEach(c => {
      if (cache[c.id]) c.embedding = cache[c.id];
    });

    this.isInitialized = true;
  }

  async clearCache() {
    await AsyncStorage.removeItem(CACHE_KEY);
    this._chunks.forEach(c => { c.embedding = null; });
    this.isInitialized = false;
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

  async _batchEmbed(texts, apiKey) {
    const data = await this._callOpenAI('/embeddings', {
      model: EMBEDDING_MODEL,
      input: texts,
    }, apiKey);
    // Sort by index to preserve order
    return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
  }

  async _embedQuery(text) {
    const data = await this._callOpenAI('/embeddings', {
      model: EMBEDDING_MODEL,
      input: text,
    });
    return data.data[0].embedding;
  }

  // ─── Cosine Similarity ──────────────────────────────────────────────────────

  _cosineSimilarity(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  // ─── Semantic Search ────────────────────────────────────────────────────────

  async search(query, topK = TOP_K) {
    if (!this.isInitialized) await this.initKnowledgeBase();

    const queryEmbedding = await this._embedQuery(query);
    const scored = this._chunks
      .filter(c => c.embedding !== null)
      .map(c => ({ chunk: c, score: this._cosineSimilarity(queryEmbedding, c.embedding) }))
      .filter(r => r.score >= MIN_SIMILARITY)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored.map(r => r.chunk);
  }

  // ─── System Prompt ──────────────────────────────────────────────────────────

  _buildSystemPrompt() {
    return `You are Aria, a compassionate and knowledgeable AI assistant created to support family caregivers, healthcare workers, and families caring for people with dementia. You work like a specialised library — every answer you give is grounded in the curated knowledge passages provided to you.

IMPORTANT RULES:
1. Base your response ONLY on the context passages provided. Do not draw on outside knowledge.
2. If the context passages do not contain enough information to answer the question, say so honestly: "I don't have specific information about that in my knowledge base, but I recommend speaking with your GP or Dementia Australia (1800 100 500)."
3. Be warm, empathetic, and emotionally supportive — caregiving is hard, and the person reading your response may be exhausted or distressed.
4. Use plain, everyday language. Avoid medical jargon unless you explain the term immediately after.
5. Keep responses concise — aim for 2 to 4 short paragraphs. People are often reading on a phone.
6. After your response, on a new line, write "Sources:" followed by a bullet list of the knowledge base titles you drew from (one per line, starting with "·"). Only list sources you actually used.
7. Always end with a brief reminder that your information is for guidance only and that a healthcare professional should be consulted for individual medical decisions.`;
  }

  // ─── RAG Chat ───────────────────────────────────────────────────────────────

  async chat(userMessage, conversationHistory = []) {
    if (!this.isInitialized) {
      await this.initKnowledgeBase();
    }

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
      { role: 'system', content: this._buildSystemPrompt() },
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
    let sources = [];

    if (sourcesMatch) {
      responseText = rawText.slice(0, rawText.indexOf(sourcesMatch[0])).trim();
      sources = sourcesMatch[1]
        .split('\n')
        .map(s => s.replace(/^[·\-\*•]\s*/, '').trim())
        .filter(Boolean);
    }

    // Fall back to retrieved chunk titles if model didn't list sources
    if (sources.length === 0 && chunks.length > 0) {
      sources = chunks.slice(0, 3).map(c => c.title);
    }

    return { text: responseText, sources };
  }
}

export const openaiService = new OpenAIService();
export { OpenAIAuthError, OpenAIRateLimitError };
