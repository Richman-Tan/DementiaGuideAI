// The web OpenAI client (services/openaiClient.js): credential handling, the
// shared HTTP-status → error mapping, the embedding LRU, pgvector search, the
// streamed chat completion (SSE parsing, inline-citation stripping, timeouts,
// barge-in), OpenAI TTS, Whisper, and the chat screen's realGenerate().
// fetch and the Supabase RPC are faked; the RAG modules from packages/core and
// the credential stores are the real ones.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { saveKeys, loadKeys } from '../src/state/keysStore.js';
import { saveAccess } from '../src/state/accessStore.js';
import { apiUrl } from '../src/services/apiBase.js';
import { buildSystemPrompt, buildUserContent } from '@core/rag/prompt';
import { CHAT_MODEL, EMBEDDING_MODEL, MIN_SIMILARITY, GENERATION_TEMPERATURE } from '@core/rag/ragConfig';

const fake = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../src/services/supabase.js', () => ({ supabase: { rpc: fake.rpc }, supabaseConfigured: true }));

const {
  openaiClient, OpenAIAuthError, OpenAIRateLimitError, StudyAccessError, StudyLimitError,
  mapSourcesToCitations, realGenerate,
} = await import('../src/services/openaiClient.js');

// ─── fakes ───────────────────────────────────────────────────────────────────
function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const enc = new TextEncoder();
const delta = (content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n`;
function sseResponse(parts, status = 200) {
  const body = new ReadableStream({
    start(c) { for (const p of parts) c.enqueue(enc.encode(p)); c.close(); },
  });
  return new Response(body, { status });
}
const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), { status });
const embeddingResponse = (vec = [0.1, 0.2]) => jsonResponse({ data: [{ embedding: vec }] });

// A body whose read() hangs until the request's signal aborts — like fetch.
function hangingBody(signal, firstChunk = null) {
  let sent = !firstChunk;
  return {
    status: 200,
    ok: true,
    body: {
      getReader: () => ({
        read: () => {
          if (!sent) { sent = true; return Promise.resolve({ done: false, value: enc.encode(firstChunk) }); }
          return new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
          });
        },
      }),
    },
  };
}

const rpcReturns = (result) => fake.rpc.mockImplementation(() => ({ abortSignal: () => Promise.resolve(result) }));
const CHUNKS = [
  { id: 'c1', title: 'Sundowning', display_title: 'Late-day restlessness', source_org: 'Alzheimers NZ', source_url: 'https://a.nz/s', content: 'Keep evenings calm.' },
  { id: 'c2', title: 'Routine', source_org: 'Dementia NZ', source_url: null, content: 'A steady routine helps.' },
];

async function drain(gen) {
  const out = [];
  for await (const piece of gen) out.push(piece);
  return out;
}

let fetchMock;
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  openaiClient._embedCache.clear();
  openaiClient._lastRequestAt = 0;
  fake.rpc.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const withKey = () => saveKeys({ openai: 'sk-test-key-123', eleven: '', azure: '' });
const withGuest = () => saveAccess('guest-access-code-0001');

// ─── key API ─────────────────────────────────────────────────────────────────
describe('API key surface (mobile parity)', () => {
  it('saves a trimmed key without touching the others, reads it back, and clears it', async () => {
    saveKeys({ openai: '', eleven: 'el-key', azure: '' });
    await openaiClient.saveApiKey('  sk-abcdefghijk  ');
    expect(loadKeys()).toMatchObject({ openai: 'sk-abcdefghijk', eleven: 'el-key' });
    expect(await openaiClient.getApiKey()).toBe('sk-abcdefghijk');
    await openaiClient.clearApiKey();
    expect(loadKeys()).toMatchObject({ openai: '', eleven: 'el-key' });
    expect(await openaiClient.getApiKey()).toBeNull();
  });

  it('hasApiKey: a real key, or any proxied credential, can reach the model', async () => {
    expect(await openaiClient.hasApiKey()).toBe(false);
    withGuest();
    expect(await openaiClient.hasApiKey()).toBe(true); // guest: no key of their own
    await openaiClient.saveApiKey('sk-long-enough-key');
    expect(await openaiClient.hasApiKey()).toBe(true);
  });
});

// ─── status mapping (through _callOpenAI / search) ───────────────────────────
describe('HTTP status → error mapping', () => {
  const embed = () => openaiClient._embedQuery('a question');

  it('no credentials at all is an auth error before any request', async () => {
    await expect(embed()).rejects.toBeInstanceOf(OpenAIAuthError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('401 with a personal key → OpenAIAuthError; through the proxy → StudyAccessError', async () => {
    withKey();
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));
    await expect(embed()).rejects.toMatchObject({ name: 'OpenAIAuthError', message: 'Invalid API key' });
    saveKeys({ openai: '', eleven: '', azure: '' });
    withGuest();
    await expect(embed()).rejects.toMatchObject({ name: 'StudyAccessError', message: 'Access code was not accepted' });
  });

  it('429 is the provider’s rate limit unless the proxy says the daily cap was reached', async () => {
    withKey();
    fetchMock.mockResolvedValueOnce(new Response('limit reached for today', { status: 429 }));
    await expect(embed()).rejects.toBeInstanceOf(OpenAIRateLimitError); // direct: body not consulted
    saveKeys({ openai: '', eleven: '', azure: '' });
    saveAccess('guest-access-code-0001');
    fetchMock.mockResolvedValueOnce(new Response('Access code limit reached for today', { status: 429 }));
    await expect(embed()).rejects.toBeInstanceOf(StudyLimitError);
    fetchMock.mockResolvedValueOnce(new Response('upstream busy', { status: 429 }));
    await expect(embed()).rejects.toBeInstanceOf(OpenAIRateLimitError);
    // An unreadable body is treated as the provider's limit.
    fetchMock.mockResolvedValueOnce({ status: 429, ok: false, clone: () => ({ text: () => Promise.reject(new Error('x')) }) });
    await expect(embed()).rejects.toBeInstanceOf(OpenAIRateLimitError);
  });

  it('403 says the key may be unavailable in the region, not that it is invalid', async () => {
    withKey();
    fetchMock.mockResolvedValue(new Response('', { status: 403 }));
    await expect(embed()).rejects.toThrow('OpenAI error: refused (403) — the key may be unavailable in your region');
  });

  it('other failures keep the upstream body when direct, and only the status when proxied', async () => {
    withKey();
    fetchMock.mockResolvedValueOnce(new Response('{"error":"model_not_found"}', { status: 404 }));
    await expect(embed()).rejects.toThrow('OpenAI error: {"error":"model_not_found"}');
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    await expect(embed()).rejects.toThrow('OpenAI error: HTTP 500');
    fetchMock.mockResolvedValueOnce({ status: 500, ok: false, text: () => Promise.reject(new Error('x')) });
    await expect(embed()).rejects.toThrow('OpenAI error: HTTP 500');
    saveKeys({ openai: '', eleven: '', azure: '' });
    withGuest();
    fetchMock.mockResolvedValueOnce(new Response('secret upstream detail', { status: 502 }));
    await expect(embed()).rejects.toThrow('OpenAI error: HTTP 502');
  });
});

describe('_callOpenAI', () => {
  it('an explicitly passed key overrides the stored credentials (key-validation path)', async () => {
    withGuest();
    fetchMock.mockResolvedValue(jsonResponse({ ok: 1 }));
    expect(await openaiClient._callOpenAI('/chat/completions', { x: 1 }, 'sk-explicit')).toEqual({ ok: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer sk-explicit');
    expect(init.signal).toBeUndefined(); // no timeout asked for
  });
});

// ─── embeddings + search ─────────────────────────────────────────────────────
describe('_embedQuery', () => {
  it('embeds with the configured model and a 5 s timeout signal', async () => {
    withKey();
    fetchMock.mockResolvedValue(embeddingResponse([1, 2, 3]));
    expect(await openaiClient._embedQuery('Sleep problems')).toEqual([1, 2, 3]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/embeddings');
    expect(JSON.parse(init.body)).toEqual({ model: EMBEDDING_MODEL, input: 'Sleep problems' });
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer sk-test-key-123' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('caches by normalised query and evicts the least-recently-used past 20 entries', async () => {
    withKey();
    fetchMock.mockImplementation(async () => embeddingResponse());
    await openaiClient._embedQuery('  First Query ');
    await openaiClient._embedQuery('first query'); // hit
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 19; i++) await openaiClient._embedQuery(`q${i}`); // 20 entries
    await openaiClient._embedQuery('FIRST QUERY'); // hit → most recent
    await openaiClient._embedQuery('q20'); // 21st → evicts q0, not "first query"
    const before = fetchMock.mock.calls.length;
    await openaiClient._embedQuery('first query');
    expect(fetchMock.mock.calls.length).toBe(before);
    await openaiClient._embedQuery('q0');
    expect(fetchMock.mock.calls.length).toBe(before + 1);
  });
});

describe('search', () => {
  beforeEach(() => {
    withKey();
    fetchMock.mockImplementation(async () => embeddingResponse([0.5]));
  });

  it('calls match_chunks with the oversampled count and floor, then caps by source family', async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, source_org: 'Other' }));
    rpcReturns({ data: rows, error: null });
    const out = await openaiClient.search('evening agitation', 3);
    expect(fake.rpc).toHaveBeenCalledWith('match_chunks', {
      query_embedding: [0.5], query_text: 'evening agitation', match_count: 30, min_similarity: MIN_SIMILARITY,
    });
    expect(out.map((r) => r.id)).toEqual(['r0', 'r1', 'r2']);
  });

  it('a null result is an empty list; an RPC error throws with its message', async () => {
    rpcReturns({ data: null, error: null });
    expect(await openaiClient.search('q')).toEqual([]);
    rpcReturns({ data: null, error: { message: 'statement timeout' } });
    await expect(openaiClient.search('q2')).rejects.toThrow('Supabase search error: statement timeout');
  });
});

// ─── chatStream ──────────────────────────────────────────────────────────────
describe('chatStream', () => {
  it('requires credentials', async () => {
    await expect(openaiClient.chatStream('q').next()).rejects.toBeInstanceOf(OpenAIAuthError);
  });

  it('builds the request from the shared prompt modules and the last six history turns', async () => {
    withKey();
    fetchMock.mockResolvedValue(sseResponse([delta('Hi.')]));
    const history = Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}`, extra: 1 }));
    const opts = { conciseMode: false, responseStyle: 'detailed', jargonMode: 'avoid', ariaPersonality: 'calm', isCaregiversSetup: true, skipThrottle: true, preRetrievedChunks: CHUNKS };
    await drain(openaiClient.chatStream('How do I help at night?', history, null, opts));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: CHAT_MODEL, max_tokens: 900, temperature: GENERATION_TEMPERATURE, stream: true });
    expect(body.messages[0]).toEqual({
      role: 'system',
      content: buildSystemPrompt({ conciseMode: false, responseStyle: 'detailed', jargonMode: 'avoid', ariaPersonality: 'calm', isCaregiversSetup: true, includeSources: true }),
    });
    expect(body.messages.slice(1, -1)).toEqual(history.slice(-6).map(({ role, content }) => ({ role, content })));
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: buildUserContent('How do I help at night?', CHUNKS) });
    expect(fake.rpc).not.toHaveBeenCalled(); // pre-retrieved chunks skip search
  });

  it('defaults to a balanced, warm, non-carer prompt', async () => {
    withKey();
    fetchMock.mockResolvedValue(sseResponse([]));
    await drain(openaiClient.chatStream('q', undefined, null, { skipThrottle: true, preRetrievedChunks: CHUNKS }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].content).toBe(buildSystemPrompt({ conciseMode: false, responseStyle: 'balanced', jargonMode: 'explain', ariaPersonality: 'warm', isCaregiversSetup: false, includeSources: true }));
  });

  it('parses SSE across chunk boundaries and skips comments, [DONE], bad JSON and empty deltas', async () => {
    withKey();
    const split = delta(' world');
    fetchMock.mockResolvedValue(sseResponse([
      ': keep-alive\n',
      delta('Hello'),
      'data: {not json}\n',
      'data: {"choices":[{"delta":{}}]}\n',
      split.slice(0, 12), split.slice(12),
      'data: [DONE]\n',
    ]));
    const pieces = await drain(openaiClient.chatStream('q', [], null, { skipThrottle: true, preRetrievedChunks: CHUNKS }));
    expect(pieces.join('')).toBe('Hello world');
  });

  it('strips inline [S#] markers while streaming and reports renumbered citations at the end', async () => {
    withKey();
    fetchMock.mockResolvedValue(sseResponse([delta('Keep evenings calm [S'), delta('2]. Try a routine [S1, S2]. See [note')]));
    const cbs = { onRagDone: vi.fn(), onLlmSend: vi.fn(), onSources: vi.fn(), onFinal: vi.fn() };
    const pieces = await drain(openaiClient.chatStream('q', [], cbs, { skipThrottle: true, preRetrievedChunks: CHUNKS }));
    const streamed = pieces.join('');
    expect(streamed).not.toMatch(/\[S/);
    expect(streamed.endsWith('[note')).toBe(true); // ordinary bracket text survives the flush
    const final = cbs.onFinal.mock.calls[0][0];
    expect(final.text).toBe('Keep evenings calm [1]. Try a routine [2][1]. See [note');
    expect(final.sources.map((s) => [s.num, s.id, s.title])).toEqual([[1, 'c2', 'Routine'], [2, 'c1', 'Late-day restlessness']]);
    expect(cbs.onSources).toHaveBeenCalledWith(final.sources);
    expect(cbs.onRagDone).toHaveBeenCalledTimes(1);
    expect(cbs.onLlmSend).toHaveBeenCalledTimes(1);
  });

  it('a stream_interrupted event from the proxy is an error, not a short answer', async () => {
    withKey();
    fetchMock.mockResolvedValue(sseResponse([delta('Partial'), 'data: {"error":"stream_interrupted"}\n']));
    await expect(drain(openaiClient.chatStream('q', [], null, { skipThrottle: true, preRetrievedChunks: CHUNKS })))
      .rejects.toThrow('The answer was cut off — please try again.');
  });

  it('maps a failed response through the shared status mapping', async () => {
    withGuest();
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));
    await expect(drain(openaiClient.chatStream('q', [], null, { skipThrottle: true, preRetrievedChunks: CHUNKS })))
      .rejects.toBeInstanceOf(StudyAccessError);
    expect(fetchMock.mock.calls[0][0]).toBe(apiUrl('/api/chat'));
  });

  it('retrieves itself when not given chunks', async () => {
    withKey();
    fetchMock.mockResolvedValueOnce(embeddingResponse()).mockResolvedValueOnce(sseResponse([delta('ok')]));
    rpcReturns({ data: [], error: null });
    await drain(openaiClient.chatStream('q', [], null, { skipThrottle: true }));
    expect(fake.rpc).toHaveBeenCalledTimes(1);
  });

  it('a retrieval failure degrades to a zero-passage answer and is logged', async () => {
    withKey();
    fetchMock.mockResolvedValueOnce(embeddingResponse()).mockResolvedValueOnce(sseResponse([delta('ok')]));
    rpcReturns({ data: null, error: { message: 'down' } });
    const pieces = await drain(openaiClient.chatStream('q', [], null, { skipThrottle: true }));
    expect(pieces).toEqual(['ok']);
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/retrieval failed/));
  });

  it('a non-Error retrieval rejection is still logged', async () => {
    withKey();
    vi.spyOn(openaiClient, 'search').mockRejectedValueOnce('rpc gone');
    fetchMock.mockResolvedValueOnce(sseResponse([]));
    await drain(openaiClient.chatStream('q', [], null, { skipThrottle: true }));
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/retrieval failed \(rpc gone\)/));
  });

  it('throttles back-to-back requests to one per 750 ms unless told to skip', async () => {
    vi.useFakeTimers();
    withKey();
    fetchMock.mockImplementation(async () => sseResponse([]));
    openaiClient._lastRequestAt = Date.now();
    const done = drain(openaiClient.chatStream('q', [], null, { preRetrievedChunks: CHUNKS }));
    await vi.advanceTimersByTimeAsync(749);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(openaiClient._lastRequestAt).toBe(Date.now());
  });

  it('times out after 12 s with no first byte', async () => {
    vi.useFakeTimers();
    withKey();
    fetchMock.mockImplementation((url, init) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const settled = drain(openaiClient.chatStream('q', [], null, { skipThrottle: true, preRetrievedChunks: CHUNKS })).catch((e) => e);
    await vi.advanceTimersByTimeAsync(12000);
    expect((await settled).message).toBe('OpenAI stream timed out waiting for first response');
  });

  it('a network failure before the response is rethrown as-is', async () => {
    withKey();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(drain(openaiClient.chatStream('q', [], null, { skipThrottle: true, preRetrievedChunks: CHUNKS })))
      .rejects.toThrow('Failed to fetch');
  });

  it('caps the whole stream at 60 s even after the first byte', async () => {
    vi.useFakeTimers();
    withKey();
    fetchMock.mockImplementation(async (url, init) => hangingBody(init.signal, delta('Start')));
    const gen = openaiClient.chatStream('q', [], null, { skipThrottle: true, preRetrievedChunks: CHUNKS });
    expect((await gen.next()).value).toBe('Start');
    const settled = gen.next().catch((e) => e);
    await vi.advanceTimersByTimeAsync(59999);
    await vi.advanceTimersByTimeAsync(1);
    expect((await settled).message).toBe('OpenAI stream timed out');
  });

  it('the caller’s signal aborts the stream (barge-in) and the listener is removed', async () => {
    withKey();
    const ac = new AbortController();
    const remove = vi.spyOn(ac.signal, 'removeEventListener');
    fetchMock.mockImplementation(async (url, init) => hangingBody(init.signal, delta('Start')));
    const gen = openaiClient.chatStream('q', [], null, { skipThrottle: true, preRetrievedChunks: CHUNKS, signal: ac.signal });
    expect((await gen.next()).value).toBe('Start');
    const settled = gen.next().catch((e) => e);
    ac.abort();
    expect((await settled).name).toBe('AbortError');
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});

describe('chatStream with the legacy trailing-citation mode', () => {
  it('passes content through untouched and reports no inline sources', async () => {
    vi.resetModules();
    vi.doMock('@core/rag/ragConfig', async (importOriginal) => ({ ...(await importOriginal()), CITATION_MODE: 'trailing' }));
    try {
      const mod = await import('../src/services/openaiClient.js');
      withKey();
      fetchMock.mockResolvedValue(sseResponse([delta('Calm evenings [S1].')]));
      const onFinal = vi.fn();
      const pieces = await drain(mod.openaiClient.chatStream('q', [], { onFinal }, { skipThrottle: true, preRetrievedChunks: CHUNKS }));
      expect(pieces).toEqual(['Calm evenings [S1].']);
      expect(onFinal).not.toHaveBeenCalled();
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content)
        .toBe(buildSystemPrompt({ conciseMode: false, responseStyle: 'balanced', jargonMode: 'explain', ariaPersonality: 'warm', isCaregiversSetup: false, includeSources: false }));
    } finally {
      vi.doUnmock('@core/rag/ragConfig');
      vi.resetModules();
    }
  });
});

// ─── TTS ─────────────────────────────────────────────────────────────────────
describe('tts', () => {
  it('requires credentials', async () => {
    await expect(openaiClient.tts('hi')).rejects.toBeInstanceOf(OpenAIAuthError);
  });

  it('direct: asks tts-1 for mp3 and returns a base64 data URI of the whole body', async () => {
    withKey();
    const bytes = new Uint8Array(0x8000 * 2 + 17).map((_, i) => i % 251); // spans three encode chunks
    fetchMock.mockResolvedValue(new Response(bytes, { status: 200 }));
    const uri = await openaiClient.tts('Hello', 'shimmer');
    expect(uri).toBe(`data:audio/mpeg;base64,${Buffer.from(bytes).toString('base64')}`);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/speech');
    expect(JSON.parse(init.body)).toEqual({ model: 'tts-1', voice: 'shimmer', input: 'Hello', response_format: 'mp3' });
  });

  it('proxied: sends only voice and input (nova by default)', async () => {
    withGuest();
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    expect(await openaiClient.tts('Hi')).toBe('data:audio/mpeg;base64,AQID');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(apiUrl('/api/speech'));
    expect(JSON.parse(init.body)).toEqual({ voice: 'nova', input: 'Hi' });
    expect(init.headers['x-study-code']).toBe('guest-access-code-0001');
  });

  it('labels its failures as TTS errors', async () => {
    withKey();
    fetchMock.mockResolvedValue(new Response('bad voice', { status: 400 }));
    await expect(openaiClient.tts('Hi')).rejects.toThrow('TTS error: bad voice');
  });
});

// ─── Whisper ─────────────────────────────────────────────────────────────────
describe('transcribe', () => {
  it('requires credentials', async () => {
    await expect(openaiClient.transcribe(new Blob(['x']))).rejects.toBeInstanceOf(OpenAIAuthError);
  });

  it('uploads the blob as whisper-1 English and returns the trimmed text', async () => {
    withKey();
    fetchMock.mockResolvedValue(jsonResponse({ text: '  how do I help  ' }));
    const blob = new Blob(['audio'], { type: 'audio/webm' });
    expect(await openaiClient.transcribe(blob)).toBe('how do I help');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(init.headers).toEqual({ Authorization: 'Bearer sk-test-key-123' });
    expect(init.body.get('model')).toBe('whisper-1');
    expect(init.body.get('language')).toBe('en');
    expect(init.body.get('file').name).toBe('recording.webm');
  });

  it('keeps a caller-supplied filename and treats a missing text field as empty', async () => {
    withKey();
    fetchMock.mockResolvedValue(jsonResponse({}));
    expect(await openaiClient.transcribe(new Blob(['a']), 'recording.mp4')).toBe('');
    expect(fetchMock.mock.calls[0][1].body.get('file').name).toBe('recording.mp4');
  });

  it('an abort is reported as a timeout the participant can act on', async () => {
    withKey();
    fetchMock.mockRejectedValueOnce(new DOMException('x', 'AbortError'));
    await expect(openaiClient.transcribe(new Blob(['a']))).rejects.toThrow('Transcription timed out — please check your connection and try again');
    fetchMock.mockRejectedValueOnce(new Error('The user aborted a request.'));
    await expect(openaiClient.transcribe(new Blob(['a']))).rejects.toThrow(/Transcription timed out/);
  });

  it('other network errors are rethrown unchanged', async () => {
    withKey();
    const err = new TypeError('Failed to fetch');
    fetchMock.mockRejectedValueOnce(err);
    await expect(openaiClient.transcribe(new Blob(['a']))).rejects.toBe(err);
    fetchMock.mockRejectedValueOnce(null);
    await expect(openaiClient.transcribe(new Blob(['a']))).rejects.toBeNull();
  });

  it('labels HTTP failures as Whisper errors', async () => {
    withKey();
    fetchMock.mockResolvedValue(new Response('unsupported format', { status: 400 }));
    await expect(openaiClient.transcribe(new Blob(['a']))).rejects.toThrow('Whisper error: unsupported format');
  });
});

// ─── chat-screen entry point ─────────────────────────────────────────────────
describe('mapSourcesToCitations', () => {
  it('keeps the drawer fields and links a matching library article', () => {
    const out = mapSourcesToCitations([
      { num: 1, title: 'Respite options', org: 'Dementia NZ', url: 'u', excerpt: 'e', id: 'x' },
      { num: 2, title: 'Zebra', org: 'Nobody', url: null, excerpt: 'z' },
    ]);
    expect(out).toEqual([
      { title: 'Respite options', org: 'Dementia NZ', url: 'u', excerpt: 'e', num: 1, articleId: 'respite', cat: 'wellbeing' },
      { title: 'Zebra', org: 'Nobody', url: null, excerpt: 'z', num: 2 },
    ]);
  });

  it('no sources is no citations', () => {
    expect(mapSourcesToCitations(undefined)).toEqual([]);
  });
});

describe('realGenerate', () => {
  async function* yields(pieces, cbs, final) {
    cbs.onRagDone();
    cbs.onLlmSend();
    for (const p of pieces) yield p;
    if (final) cbs.onFinal(final);
  }

  it('streams accumulated text, marks the stages, and returns the final transcript with citations', async () => {
    const final = { text: 'Rest helps [1].', sources: [{ num: 1, id: 's1', title: 'Respite care', org: 'NZ', url: null, excerpt: '' }] };
    const spy = vi.spyOn(openaiClient, 'chatStream').mockImplementation((q, h, cbs) => yields(['Rest ', 'helps.'], cbs, final));
    const onToken = vi.fn();
    const onStage = vi.fn();
    const ac = new AbortController();
    const out = await realGenerate({
      question: 'Is respite available?',
      settings: { concise: true, responseStyle: 'thorough', jargon: 'fine', ariaStyle: 'calm', setupType: 'exploring' },
      history: [
        { role: 'aria', text: 'Hello' },
        { role: 'user', text: '' },
        { role: 'aria', text: 'typing', streaming: true },
        { role: 'user', text: 'Is respite available?' },
      ],
      signal: ac.signal,
      onToken,
      onStage,
    });
    const [q, history, , opts] = spy.mock.calls[0];
    expect(q).toBe('Is respite available?');
    expect(history).toEqual([{ role: 'assistant', content: 'Hello' }]); // current question dropped
    expect(opts).toEqual({ conciseMode: true, responseStyle: 'detailed', jargonMode: 'ok', ariaPersonality: 'calm', isCaregiversSetup: false, signal: ac.signal });
    expect(onToken.mock.calls.map((c) => c[0])).toEqual(['Rest ', 'Rest helps.']);
    expect(onStage.mock.calls.map((c) => c[0])).toEqual(['ragDone', 'llmSend', 'firstToken', 'firstToken']);
    expect(out).toEqual({
      text: 'Rest helps [1].',
      citations: [{ title: 'Respite care', org: 'NZ', url: null, excerpt: '', num: 1, articleId: 'respite', cat: 'wellbeing' }],
      sources: final.sources,
      safety: false,
    });
  });

  it('without a final result it returns the streamed text; a high-risk question sets the safety flag', async () => {
    vi.spyOn(openaiClient, 'chatStream').mockImplementation((q, h, cbs) => yields(['Stay ', 'safe.'], cbs, null));
    const out = await realGenerate({ question: 'He hit me today', settings: undefined, history: undefined, onToken: vi.fn() });
    expect(out).toEqual({ text: 'Stay safe.', citations: [], sources: [], safety: true });
  });

  it('keeps an earlier identical user turn that is not the last one', async () => {
    const spy = vi.spyOn(openaiClient, 'chatStream').mockImplementation((q, h, cbs) => yields([], cbs, null));
    await realGenerate({ question: 'Q', history: [{ role: 'user', text: 'Q' }, { role: 'aria', text: 'A' }], onToken: vi.fn() });
    expect(spy.mock.calls[0][1]).toEqual([{ role: 'user', content: 'Q' }, { role: 'assistant', content: 'A' }]);
  });

  it('runs end to end over a real stream', async () => {
    withKey();
    fetchMock.mockResolvedValueOnce(embeddingResponse()).mockResolvedValueOnce(sseResponse([delta('Calm evenings help [S1].')]));
    rpcReturns({ data: [], error: null });
    const out = await realGenerate({ question: 'Evenings?', settings: {}, history: [], onToken: vi.fn(), signal: undefined });
    // Zero passages retrieved → the model's [S1] cites nothing real and is dropped.
    expect(out.text).toBe('Calm evenings help.');
    expect(out.sources).toEqual([]);
  });
});
