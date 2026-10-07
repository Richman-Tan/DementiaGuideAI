// Credential routing and the services that sit directly on it: the guarded
// Supabase client, the OpenAI/ElevenLabs transports (direct key vs proxied
// access code), the study-proxy warm-up, streaming-TTS mode selection, the
// shared credential-error copy, and the chat facade's mock/real switch.
// localStorage and fetch are stubbed; the stores and transport are real.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveKeys } from '../src/state/keysStore.js';
import { saveAccess } from '../src/state/accessStore.js';
import { saveStudy } from '../src/study/studyStore.js';
import { openaiTransport, openaiUrl, elevenTransport, transportKind, warmStudyProxy } from '../src/services/transport.js';
import { credentialErrorCopy } from '../src/services/credentialErrorCopy.js';
import { apiUrl, apiIsCrossOrigin } from '../src/services/apiBase.js';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn((url, key) => ({ url, key })) }));
vi.mock('../src/services/openaiClient.js', () => ({
  realGenerate: vi.fn(async () => ({ text: 'real answer', citations: [], safety: false })),
}));
vi.mock('../src/data/services.js', async (importOriginal) => {
  const mod = await importOriginal();
  return { ...mod, mockReply: vi.fn(mod.mockReply) };
});

const STUDY = 'study-access-code-0001';
const GUEST = 'guest-access-code-0001';
const startStudy = () => saveStudy({ sessionId: '11111111-2222-3333-4444-555555555555', accessCode: STUDY });

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('supabase client guard', () => {
  async function load() {
    vi.resetModules();
    const { createClient } = await import('@supabase/supabase-js');
    createClient.mockClear();
    const mod = await import('../src/services/supabase.js');
    return { ...mod, createClient };
  }

  it('without env, warns and points the client at an unreachable host instead of throwing', async () => {
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', '');
    const { supabaseConfigured, supabase, createClient } = await load();
    expect(supabaseConfigured).toBe(false);
    expect(createClient).toHaveBeenCalledWith('https://unconfigured.invalid', 'unconfigured');
    expect(supabase).toEqual({ url: 'https://unconfigured.invalid', key: 'unconfigured' });
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/retrieval disabled/));
  });

  it('with env, uses the configured project and stays quiet', async () => {
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co');
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    const { supabaseConfigured, createClient } = await load();
    expect(supabaseConfigured).toBe(true);
    expect(createClient).toHaveBeenCalledWith('https://abc.supabase.co', 'anon-key');
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe('apiBase', () => {
  it('builds same-origin URLs when no API origin is configured', () => {
    expect(apiUrl('/api/chat')).toBe('/api/chat');
    expect(apiIsCrossOrigin).toBe(false);
  });

  it('prefixes a configured origin, dropping trailing slashes', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.org//');
    vi.resetModules();
    const mod = await import('../src/services/apiBase.js');
    expect(mod.apiUrl('/api/chat')).toBe('https://api.example.org/api/chat');
    expect(mod.apiIsCrossOrigin).toBe(true);
  });
});

describe('transport', () => {
  it('openaiUrl goes straight to OpenAI for a personal key', () => {
    saveKeys({ openai: 'sk-1', eleven: '', azure: '' });
    expect(openaiUrl(openaiTransport(), '/chat/completions')).toBe('https://api.openai.com/v1/chat/completions');
    expect(openaiUrl(null, '/embeddings')).toBe('https://api.openai.com/v1/embeddings');
  });

  it('openaiUrl maps each proxied OpenAI path to its study endpoint', () => {
    const t = { proxied: true };
    expect(openaiUrl(t, '/embeddings')).toBe('/api/embed');
    expect(openaiUrl(t, '/chat/completions')).toBe('/api/chat');
    expect(openaiUrl(t, '/audio/speech')).toBe('/api/speech');
    expect(openaiUrl(t, '/audio/transcriptions')).toBe('/api/transcribe');
  });

  it('refuses to proxy any OpenAI path that has no explicit study route', () => {
    expect(() => openaiUrl({ proxied: true }, '/files')).toThrow('no study route for /files');
  });

  it('ElevenLabs: a personal key goes direct, a study session proxies with the study code', () => {
    saveKeys({ openai: '', eleven: 'el-key', azure: '' });
    expect(elevenTransport()).toEqual({ proxied: false, headers: { 'xi-api-key': 'el-key' } });
    saveKeys({ openai: '', eleven: '', azure: '' });
    startStudy();
    expect(elevenTransport()).toEqual({ proxied: true, headers: { 'x-study-code': STUDY } });
    expect(elevenTransport()).not.toHaveProperty('guest');
  });

  it('ElevenLabs is unavailable with no key, no session and no guest code', () => {
    expect(elevenTransport()).toBeNull();
  });

  it('transportKind distinguishes study from guest proxying', () => {
    startStudy();
    expect(transportKind()).toBe('study');
  });
});

describe('warmStudyProxy', () => {
  it('does nothing without a proxied transport', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    warmStudyProxy(); // no credentials at all
    saveKeys({ openai: 'sk-1', eleven: '', azure: '' });
    warmStudyProxy(); // personal key: not proxied
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('boots embed, chat, transcribe and speech with the access code, and swallows failures', async () => {
    saveAccess(GUEST);
    const fetchMock = vi.fn(async () => { throw new TypeError('offline'); });
    vi.stubGlobal('fetch', fetchMock);
    expect(() => warmStudyProxy()).not.toThrow();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0)); // let the rejected fetches settle
    const calls = fetchMock.mock.calls.map(([url, init]) => [url, JSON.parse(init.body), init.headers['x-study-code']]);
    expect(calls).toEqual([
      ['/api/embed', { model: 'text-embedding-3-small', input: 'warm-up' }, GUEST],
      ['/api/chat', { model: 'gpt-4o-mini', max_tokens: 1, messages: [{ role: 'user', content: 'ok' }] }, GUEST],
      ['/api/transcribe', {}, GUEST],
      ['/api/speech', {}, GUEST],
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.method).toBe('POST');
      expect(init.headers['Content-Type']).toBe('application/json');
    }
  });
});

describe('credentialErrorCopy', () => {
  const named = (name) => Object.assign(new Error(name), { name });

  it('names the OpenAI key problem and the provider rate limit in the user’s terms', () => {
    expect(credentialErrorCopy(named('OpenAIAuthError'), 'key')).toBe('Your OpenAI API key looks invalid — check it in Settings → Advanced.');
    expect(credentialErrorCopy(named('OpenAIRateLimitError'), 'key')).toBe('The AI service is rate-limited right now — wait a moment and retry.');
  });

  it('returns null for a missing error so callers keep their own fallback', () => {
    expect(credentialErrorCopy(undefined, 'key')).toBeNull();
  });
});

describe('selectTtsMode / markTtsDegraded', () => {
  async function load() {
    vi.resetModules();
    return import('../src/services/ttsModeWeb.js');
  }

  it('streams only with an ElevenLabs key in the browser', async () => {
    const { selectTtsMode } = await load();
    expect(await selectTtsMode()).toBe('rest');
    startStudy(); // proxied ElevenLabs still cannot open the socket
    expect(await selectTtsMode()).toBe('rest');
    saveKeys({ openai: '', eleven: 'el-key', azure: '' });
    expect(await selectTtsMode()).toBe('eleven-stream');
  });

  it('a mid-turn failure degrades the rest of the session to REST, warning once', async () => {
    saveKeys({ openai: '', eleven: 'el-key', azure: '' });
    const { selectTtsMode, markTtsDegraded } = await load();
    markTtsDegraded('socket closed 1006');
    markTtsDegraded('again');
    expect(await selectTtsMode()).toBe('rest');
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith('[TTS] streaming degraded for this session: socket closed 1006');
  });
});

describe('chatService', () => {
  async function load() {
    const chat = await import('../src/services/chatService.js');
    const S = await import('../src/data/services.js');
    const { realGenerate } = await import('../src/services/openaiClient.js');
    S.mockReply.mockClear();
    realGenerate.mockClear();
    return { ...chat, mockReply: S.mockReply, realGenerate };
  }

  describe('isMockMode', () => {
    it('is on with no credentials and off with a personal key', async () => {
      const { isMockMode } = await load();
      expect(isMockMode()).toBe(true);
      saveKeys({ openai: 'sk-1', eleven: '', azure: '' });
      expect(isMockMode()).toBe(false);
    });

    it('is never on during a study session, even when forced', async () => {
      const { isMockMode } = await load();
      startStudy();
      vi.stubEnv('VITE_FORCE_MOCK', '1');
      expect(isMockMode()).toBe(false);
    });

    it('VITE_FORCE_MOCK or ?mock=1 force it on despite a key', async () => {
      const { isMockMode } = await load();
      saveKeys({ openai: 'sk-1', eleven: '', azure: '' });
      vi.stubEnv('VITE_FORCE_MOCK', '1');
      expect(isMockMode()).toBe(true);
      vi.unstubAllEnvs();
      vi.stubGlobal('location', { search: '?a=b&mock=1' });
      expect(isMockMode()).toBe(true);
      vi.stubGlobal('location', { search: '?nomock=0' });
      expect(isMockMode()).toBe(false);
    });
  });

  describe('generateReply in mock mode', () => {
    it('“types” for 1.1 s, then streams two words per 70 ms and resolves with the canned reply', async () => {
      vi.useFakeTimers();
      const { generateReply, mockReply } = await load();
      const onToken = vi.fn();
      const p = generateReply({ question: 'How do I help with wandering?', settings: { concise: true }, onToken });
      await vi.advanceTimersByTimeAsync(1099);
      expect(onToken).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(onToken).toHaveBeenCalledTimes(1);
      const expected = mockReply.mock.results[0].value;
      expect(onToken.mock.calls[0][0]).toBe(expected.text.split(' ').slice(0, 2).join(' '));
      await vi.runAllTimersAsync();
      const result = await p;
      expect(result).toEqual({ text: expected.text, citations: expected.citations, safety: expected.safety });
      expect(onToken).toHaveBeenLastCalledWith(expected.text);
      expect(mockReply).toHaveBeenCalledWith('How do I help with wandering?', { concise: true });
    });

    it('rejects with an AbortError when the turn is cancelled mid-stream', async () => {
      vi.useFakeTimers();
      const { generateReply } = await load();
      const ac = new AbortController();
      const onToken = vi.fn();
      const p = generateReply({ question: 'wandering', settings: {}, signal: ac.signal, onToken });
      const settled = p.catch((e) => e);
      await vi.advanceTimersByTimeAsync(1100);
      ac.abort();
      const err = await settled;
      expect(err.name).toBe('AbortError');
      const calls = onToken.mock.calls.length;
      await vi.runAllTimersAsync();
      expect(onToken).toHaveBeenCalledTimes(calls); // nothing after the abort
    });

    it('surfaces a mock knowledge-base outage as an error', async () => {
      vi.useFakeTimers();
      const { generateReply, mockReply } = await load();
      mockReply.mockReturnValueOnce({ error: true });
      const settled = generateReply({ question: 'q', settings: {}, onToken: vi.fn() }).catch((e) => e);
      await vi.advanceTimersByTimeAsync(1100);
      expect((await settled).message).toBe('mock knowledge base outage');
    });
  });

  it('generateReply delegates to the real RAG path when credentials exist', async () => {
    const { generateReply, realGenerate, mockReply } = await load();
    saveKeys({ openai: 'sk-1', eleven: '', azure: '' });
    const opts = { question: 'q', settings: {}, onToken: vi.fn() };
    expect(await generateReply(opts)).toEqual({ text: 'real answer', citations: [], safety: false });
    expect(realGenerate).toHaveBeenCalledWith(opts);
    expect(mockReply).not.toHaveBeenCalled();
  });
});
