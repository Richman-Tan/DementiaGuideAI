import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabaseService';

const SECURE_KEY = 'openai_api_key';
const OPENAI_BASE = 'https://api.openai.com/v1';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const CHAT_MODEL = 'gpt-4o';
const MIN_SIMILARITY = 0.25;
const TOP_K = 5;
const MAX_HISTORY = 6;
// Retrieval rebalance: the knowledge base is dominated by one bulk source (the
// ~387 WHO/NZ iSupport chunks), which can monopolise the top-K and crowd out
// hand-authored chunks. Over-fetch, then cap that source family before taking K.
// See docs/report/rag_retrieval_rebalance_plan.md.
const RETRIEVAL_OVERSAMPLE = 10;      // fetch TOP_K * this many candidates
const MAX_PER_SOURCE_FAMILY = 2;      // max chunks from a single bulk source in the final K

class OpenAIAuthError extends Error {
  constructor(msg) { super(msg); this.name = 'OpenAIAuthError'; }
}
class OpenAIRateLimitError extends Error {
  constructor(msg) { super(msg); this.name = 'OpenAIRateLimitError'; }
}

// Group a chunk by its bulk-source family: the iSupport course (tagged
// document_id:isupport-*) is one family; everything else keeps its own document
// id, or 'curated' for hand-authored chunks with no document_id tag.
function sourceFamilyOf(chunk) {
  const tag = (chunk.tags || []).find(t => t.startsWith('document_id:'));
  const doc = tag ? tag.split(':')[1] : 'curated';
  return doc.startsWith('isupport') ? 'isupport' : doc;
}

// Take the first `k` chunks, but allow at most `maxPerFamily` from any single
// bulk source family so one over-represented source can't monopolise the results.
function capBySourceFamily(rows, k, maxPerFamily) {
  const counts = {};
  const out = [];
  for (const r of rows) {
    const fam = sourceFamilyOf(r);
    counts[fam] = (counts[fam] || 0) + 1;
    if (fam === 'isupport' && counts[fam] > maxPerFamily) continue;
    out.push(r);
    if (out.length >= k) break;
  }
  return out;
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
    // When nothing was retrieved, send the bare question — an explicit "nothing
    // matched" block primes the model to hedge instead of just answering.
    const userContent = chunks.length > 0
      ? `[REFERENCE PASSAGES — may or may not be relevant]\n${chunks.map(c => `--- ${c.title} ---\n${c.content}`).join('\n\n')}\n[/REFERENCE PASSAGES]\n\nUser question: ${userMessage}`
      : userMessage;

    const recentHistory = conversationHistory.slice(-MAX_HISTORY).map(m => ({
      role: m.role,
      content: m.content,
    }));

    const messages = [
      // Voice path: no Sources section — it would be spoken aloud by TTS.
      { role: 'system', content: this._buildSystemPrompt({ conciseMode, responseStyle, jargonMode, ariaPersonality, isCaregiversSetup, includeSources: false }) },
      ...recentHistory,
      { role: 'user', content: userContent },
    ];

    const maxTokens = conciseMode || responseStyle === 'brief' ? 300
                    : responseStyle === 'detailed'   ? 900
                    : responseStyle === 'step-by-step' ? 700
                    : 600;

    const body = JSON.stringify({
      model: CHAT_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.7,
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

  _buildSystemPrompt({
    conciseMode       = false,
    responseStyle     = 'balanced',
    jargonMode        = 'explain',
    ariaPersonality   = 'warm',
    isCaregiversSetup = false,
    includeSources    = true,
  } = {}) {
    // Caregiver preamble
    const caregiverPreamble = isCaregiversSetup
      ? 'The person using this app is a family caregiver or support worker. Frame responses to support them in their caring role, not as advice to the person with dementia.\n\n'
      : '';

    // Personality
    const personalityRule = {
      warm:      '- Be warm, gentle, and emotionally supportive. Validate feelings before giving information. Caregiving is hard, and the person reading your response may be exhausted or distressed.',
      calm:      '- Maintain a calm, steady, and reassuring tone. Be clear and measured without excessive emotional language.',
      friendly:  '- Be warm and encouraging — like a knowledgeable friend. Use natural, conversational language and a positive tone.',
      practical: '- Be direct and practical. Lead with the most useful information. Avoid lengthy emotional preambles.',
    }[ariaPersonality] ?? '- Be warm, empathetic, and emotionally supportive.';

    // Jargon
    const jargonRule = {
      explain: "- If you use a medical or technical word, immediately define it in plain language in parentheses — e.g. \"lewy body dementia (a type of dementia that affects movement and memory)\".",
      avoid:   '- Never use medical jargon or technical terms. Always use the simplest everyday word available.',
      ok:      '- Use plain, everyday language.',
    }[jargonMode] ?? "- Use plain, everyday language. Avoid medical jargon unless you explain the term immediately after.";

    // Response length (conciseMode overrides responseStyle)
    let lengthRule = '- Keep responses concise — aim for 2 to 4 short paragraphs. People are often reading on a phone.';
    if (conciseMode) {
      lengthRule = '- CONCISE MODE ON: Answer in 1–2 short paragraphs maximum. Lead with the direct answer immediately — no preamble, no filler phrases, no restating the question.';
    } else if (responseStyle === 'brief') {
      lengthRule = '- Keep responses very short — 1 to 2 sentences maximum. State the answer first, then stop.';
    } else if (responseStyle === 'detailed') {
      lengthRule = '- Give thorough, detailed responses — 4 to 6 paragraphs if the topic warrants it. Include context, examples, and practical tips.';
    } else if (responseStyle === 'step-by-step') {
      lengthRule = '- Format any instructions or processes as a numbered list. Break every process into small, clear steps. Use plain language for each step.';
    }

    const sourcesRule = includeSources
      ? '\n- If you drew on any of the provided passages, even partially, end with a line "Sources:" followed by a bullet list (one per line, starting with "·") of the passage titles you used. Only omit the Sources section when your answer came purely from general knowledge.'
      : '';

    return `${caregiverPreamble}You are Aria, an expert AI assistant specialising in dementia and dementia care, supporting family caregivers, healthcare workers, and families caring for people with dementia. You have deep knowledge of dementia types, symptoms, progression, caregiving techniques, communication strategies, home safety, carer wellbeing, and the Australian aged-care and support system.

Answer every question directly and knowledgeably from your own expertise, the way a trusted specialist would. Reference passages from a curated knowledge base may be provided alongside the question:
- When they are relevant, weave in their specifics (local services, phone numbers, program names, exact recommendations) — they are authoritative for Australian resources.
- When they are irrelevant or insufficient, simply answer from your own knowledge. Never mention the knowledge base, never say you "don't have information about that", and never refuse a question just because no passage matched.

GUIDELINES:
${personalityRule}
${jargonRule}
${lengthRule}
- For questions about medication dosing, diagnosis, or sudden medical changes, give the best general information you can, and where individual medical judgement is genuinely needed, naturally suggest their GP or Dementia Australia (1800 100 500) as part of the answer — never as a boilerplate footer.${sourcesRule}`;
  }

  // ─── RAG Chat ───────────────────────────────────────────────────────────────

  async chat(userMessage, conversationHistory = [],
             { conciseMode = false, responseStyle = 'balanced', jargonMode = 'explain',
               ariaPersonality = 'warm', isCaregiversSetup = false } = {}) {
    // Retrieve relevant chunks
    const chunks = await this.search(userMessage, TOP_K);

    // When nothing was retrieved, send the bare question — an explicit "nothing
    // matched" block primes the model to hedge instead of just answering.
    const userContent = chunks.length > 0
      ? `[REFERENCE PASSAGES — may or may not be relevant]\n${chunks.map(c => `--- ${c.title} ---\n${c.content}`).join('\n\n')}\n[/REFERENCE PASSAGES]\n\nUser question: ${userMessage}`
      : userMessage;

    // Build messages — last MAX_HISTORY items from conversation history
    const recentHistory = conversationHistory.slice(-MAX_HISTORY).map(m => ({
      role: m.role,
      content: m.content,
    }));

    const messages = [
      { role: 'system', content: this._buildSystemPrompt({ conciseMode, responseStyle, jargonMode, ariaPersonality, isCaregiversSetup, includeSources: true }) },
      ...recentHistory,
      {
        role: 'user',
        content: userContent,
      },
    ];

    const maxTokens = conciseMode || responseStyle === 'brief' ? 300
                    : responseStyle === 'detailed'   ? 900
                    : responseStyle === 'step-by-step' ? 700
                    : 600;

    const data = await this._callOpenAI('/chat/completions', {
      model: CHAT_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.7,
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
