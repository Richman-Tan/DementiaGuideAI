// Unit tests for the RAG/chat glue class that every production surface (text
// chat, voice) and no eval script goes through directly — search(), the
// embedding cache, and OpenAI error-status mapping had no coverage before
// this file. chatStream() (XHR-based async generator) is intentionally out of
// scope: it needs a browser-grade XHR fake to test meaningfully and is left
// for a follow-up rather than mocked shallowly here.
import * as SecureStore from 'expo-secure-store';
import { openaiService, OpenAIAuthError, OpenAIRateLimitError } from './openaiService';
import { supabase } from './supabaseService';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock('./supabaseService', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('./ragTelemetry', () => ({ recordRetrieval: jest.fn() }));

function mockRpc(data, error = null) {
  const abortSignal = jest.fn().mockReturnValue(Promise.resolve({ data, error }));
  supabase.rpc.mockReturnValue({ abortSignal });
  return abortSignal;
}

function mockEmbeddingThenChat(chatJson) {
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ data: [{ embedding: [0.1, 0.2] }] }) })
    .mockResolvedValueOnce(chatJson);
}

beforeEach(() => {
  jest.clearAllMocks();
  // The service is a module-level singleton; reset its mutable state so
  // tests don't leak the embedding cache, key cache, or request pacing.
  openaiService._cachedKey = null;
  openaiService._embedCache = new Map();
  openaiService._lastRequestAt = 0;
});

describe('API key management', () => {
  it('reads through to SecureStore once, then serves from memory', async () => {
    SecureStore.getItemAsync.mockResolvedValue('sk-abcdefghijk');
    expect(await openaiService.getApiKey()).toBe('sk-abcdefghijk');
    expect(await openaiService.getApiKey()).toBe('sk-abcdefghijk');
    expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(1);
  });

  it('hasApiKey rejects short/placeholder values', async () => {
    SecureStore.getItemAsync.mockResolvedValue('short');
    expect(await openaiService.hasApiKey()).toBe(false);
  });

  it('clearApiKey deletes from SecureStore and drops the memory cache', async () => {
    SecureStore.getItemAsync.mockResolvedValue('sk-abcdefghijk');
    await openaiService.getApiKey();
    await openaiService.clearApiKey();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
    expect(openaiService._cachedKey).toBeNull();
  });
});

describe('search()', () => {
  beforeEach(() => {
    openaiService._cachedKey = 'sk-test';
    global.fetch = jest
      .fn()
      .mockResolvedValue({ status: 200, ok: true, json: async () => ({ data: [{ embedding: [0.1, 0.2] }] }) });
  });

  it('calls match_chunks with TOP_K*RETRIEVAL_OVERSAMPLE and MIN_SIMILARITY, then applies the source-family cap', async () => {
    const abortSignal = mockRpc([
      { id: 'i1', document_id: 'isupport_x', similarity: 0.9 },
      { id: 'i2', document_id: 'isupport_y', similarity: 0.85 },
      { id: 'i3', document_id: 'isupport_z', similarity: 0.8 }, // 3rd isupport row — capped out
      { id: 'c1', document_id: 'curated', similarity: 0.5 },
    ]);

    const results = await openaiService.search('how do I manage sundowning?', 5);

    expect(supabase.rpc).toHaveBeenCalledWith(
      'match_chunks',
      expect.objectContaining({ match_count: 50, min_similarity: 0.25, query_text: 'how do I manage sundowning?' })
    );
    expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    // MAX_PER_SOURCE_FAMILY=2 admits i1, i2, skips i3, then admits c1.
    expect(results.map(r => r.id)).toEqual(['i1', 'i2', 'c1']);
  });

  it('wraps a Supabase RPC error rather than leaking the raw error object', async () => {
    mockRpc(null, { message: 'connection timeout' });
    await expect(openaiService.search('question')).rejects.toThrow('Supabase search error: connection timeout');
  });

  it('reuses a cached embedding for a repeated query regardless of case/whitespace', async () => {
    mockRpc([]);
    await openaiService.search('Hello There');
    await openaiService.search('  hello there  ');
    expect(global.fetch).toHaveBeenCalledTimes(1); // second call served from _embedCache
  });

  it('evicts the oldest entry once the embedding cache exceeds EMBED_CACHE_MAX (20)', async () => {
    mockRpc([]);
    let n = 0;
    global.fetch = jest
      .fn()
      .mockImplementation(async () => ({ status: 200, ok: true, json: async () => ({ data: [{ embedding: [n++] }] }) }));

    for (let i = 0; i < 21; i++) await openaiService.search(`distinct query ${i}`);

    expect(openaiService._embedCache.size).toBe(20);
    expect(openaiService._embedCache.has('distinct query 0')).toBe(false);
    expect(openaiService._embedCache.has('distinct query 20')).toBe(true);
  });
});

describe('chat() — OpenAI error-status mapping', () => {
  beforeEach(() => {
    openaiService._cachedKey = 'sk-test';
    mockRpc([]);
  });

  it('maps HTTP 401 to OpenAIAuthError', async () => {
    mockEmbeddingThenChat({ status: 401, ok: false });
    await expect(openaiService.chat('hello')).rejects.toBeInstanceOf(OpenAIAuthError);
  });

  it('maps HTTP 429 to OpenAIRateLimitError', async () => {
    mockEmbeddingThenChat({ status: 429, ok: false });
    await expect(openaiService.chat('hello')).rejects.toBeInstanceOf(OpenAIRateLimitError);
  });

  it('surfaces other failures as a generic Error carrying the response body', async () => {
    mockEmbeddingThenChat({ status: 500, ok: false, text: async () => 'server exploded' });
    await expect(openaiService.chat('hello')).rejects.toThrow(/server exploded/);
  });
});

describe('chat() — happy path', () => {
  beforeEach(() => {
    openaiService._cachedKey = 'sk-test';
  });

  it('runs retrieved chunks through extractCitations() and returns renumbered, validated sources', async () => {
    mockRpc([
      { id: 'c1', title: 'Sundowning', content: 'Keep a consistent evening routine.', similarity: 0.9, document_id: 'curated' },
    ]);
    mockEmbeddingThenChat({
      status: 200,
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Keep a consistent evening routine [S1].' } }] }),
    });

    const result = await openaiService.chat('How do I manage sundowning?');

    expect(result.text).toBe('Keep a consistent evening routine [1].');
    expect(result.sources).toEqual([
      expect.objectContaining({ num: 1, id: 'c1', title: 'Sundowning' }),
    ]);
  });

  it('drops a hallucinated [S#] marker that does not match any supplied passage', async () => {
    mockRpc([{ id: 'c1', title: 'Sundowning', content: 'Keep a routine.', similarity: 0.9, document_id: 'curated' }]);
    mockEmbeddingThenChat({
      status: 200,
      ok: true,
      // Only one passage was supplied ([S1]); [S2] is hallucinated.
      json: async () => ({ choices: [{ message: { content: 'Try this [S1] and also this [S2].' } }] }),
    });

    const result = await openaiService.chat('question');

    expect(result.text).toBe('Try this [1] and also this.');
    expect(result.sources).toHaveLength(1);
  });
});
