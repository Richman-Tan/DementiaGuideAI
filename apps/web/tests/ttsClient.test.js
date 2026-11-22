// The web TTS cascade (services/ttsClient.js): ElevenLabs with character
// alignment first — direct with a personal key, or through the guest-code proxy —
// then OpenAI tts-1 with no alignment (the renderer falls back to RMS lipsync).
// Every ElevenLabs failure must warn and still return audio.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveKeys } from '../src/state/keysStore.js';
import { saveAccess } from '../src/state/accessStore.js';
import { apiUrl } from '../src/services/apiBase.js';

vi.mock('../src/services/openaiClient.js', () => ({
  openaiClient: { tts: vi.fn(async (text, voice) => `data:audio/mpeg;base64,OPENAI:${voice}`) },
}));
vi.mock('@core/lipsync/createVisemeTimeline', () => ({
  createVisemeTimeline: vi.fn((alignment, opts) => ({
    frames: ['f'],
    totalDuration: 1,
    alignment,
    opts,
  })),
}));

const { tts } = await import('../src/services/ttsClient.js');
const { openaiClient } = await import('../src/services/openaiClient.js');
const { createVisemeTimeline } = await import('@core/lipsync/createVisemeTimeline');

const ALIGNMENT = {
  characters: ['h', 'i'],
  character_start_times_seconds: [0, 0.1],
  character_end_times_seconds: [0.1, 0.2],
};

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const okJson = (data) => ({ ok: true, status: 200, json: async () => data });

let fetchMock;
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  fetchMock = vi.fn(async () => okJson({ audio_base64: 'QUJD', alignment: ALIGNMENT }));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  openaiClient.tts.mockClear();
  createVisemeTimeline.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ElevenLabs direct (personal key)', () => {
  beforeEach(() => saveKeys({ openai: '', eleven: 'el-key', azure: '' }));

  it('posts the full request to the with-timestamps endpoint and builds a viseme timeline', async () => {
    const out = await tts('Hello there', {
      elevenVoiceId: 'voice/1',
      speechRate: 0.9,
      visemeWeights: { aa: 0.5 },
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice%2F1/with-timestamps');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'xi-api-key': 'el-key', 'Content-Type': 'application/json' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body)).toEqual({
      text: 'Hello there',
      model_id: 'eleven_turbo_v2_5',
      output_format: 'mp3_44100_64',
      voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.2, speed: 0.9 },
    });
    expect(createVisemeTimeline).toHaveBeenCalledWith(ALIGNMENT, { visemeWeights: { aa: 0.5 } });
    expect(out).toEqual({
      audio: 'data:audio/mpeg;base64,QUJD',
      visemeTimeline: expect.objectContaining({ frames: ['f'] }),
    });
    expect(openaiClient.tts).not.toHaveBeenCalled();
  });

  it('defaults to the warm female voice, the 0.78 rate and the renderer’s own weights', async () => {
    await tts('Hi');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/EXAVITQu4vr4xnSDxMaL/');
    expect(JSON.parse(init.body).voice_settings.speed).toBe(0.78);
    expect(createVisemeTimeline).toHaveBeenCalledWith(ALIGNMENT, { visemeWeights: undefined });
  });

  it('speaks numbers as words before they reach the provider', async () => {
    await tts('Call 111');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).text).not.toMatch(/\d/);
  });

  it('a response without alignment still plays, just without a timeline', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ audio_base64: 'QUJD' }));
    expect(await tts('Hi')).toEqual({ audio: 'data:audio/mpeg;base64,QUJD', visemeTimeline: null });
    expect(createVisemeTimeline).not.toHaveBeenCalled();
  });
});

describe('ElevenLabs proxied (guest code)', () => {
  it('sends only text, voice and rate to the proxy with the guest code', async () => {
    saveAccess('guest-access-code-0001');
    await tts('Hello', { elevenVoiceId: 'v1', speechRate: 0.65 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(apiUrl('/api/eleven-tts'));
    expect(init.headers).toEqual({
      'x-study-code': 'guest-access-code-0001',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body)).toEqual({ text: 'Hello', voiceId: 'v1', speechRate: 0.65 });
  });
});

describe('fallback to OpenAI TTS', () => {
  beforeEach(() => saveKeys({ openai: 'sk-1', eleven: 'el-key', azure: '' }));

  it('an HTTP error carries the provider’s message into the fallback warning', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'invalid_api_key',
    });
    const out = await tts('Hi', { openaiVoice: 'onyx' });
    expect(out).toEqual({ audio: 'data:audio/mpeg;base64,OPENAI:onyx', visemeTimeline: null });
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('ElevenLabs TTS error: invalid_api_key')
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/elevenlabs failed: .*falling back to OpenAI TTS/)
    );
  });

  it('an unreadable error body falls back to the status code', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => {
        throw new Error('stream');
      },
    });
    await tts('Hi');
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('ElevenLabs TTS error: HTTP 502')
    );
  });

  it('a response with no audio is a failure, not silence', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ alignment: ALIGNMENT }));
    await tts('Hi');
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('ElevenLabs response missing audio_base64')
    );
    expect(openaiClient.tts).toHaveBeenCalledTimes(1);
  });

  it('a network failure falls back', async () => {
    fetchMock.mockRejectedValueOnce(new Error('x'.repeat(200)));
    const out = await tts('Hi');
    expect(out.audio).toBe('data:audio/mpeg;base64,OPENAI:nova');
  });

  it('a non-Error rejection is still reported', async () => {
    fetchMock.mockRejectedValueOnce('boom');
    await tts('Hi');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });
});

describe('a key that disappears between the check and the request', () => {
  it('fails the ElevenLabs leg with a clear reason and still speaks through OpenAI', async () => {
    // tts() checks for ElevenLabs, then the request builder resolves the
    // transport again. Storage shared with another tab can change in between
    // ("Clear this device"); simulate that by serving the key exactly once.
    const keys = JSON.stringify({ openai: 'sk-1', eleven: 'el-key', azure: '' });
    let served = false;
    vi.stubGlobal('localStorage', {
      getItem: (k) => {
        if (k !== 'dg_keys') return null;
        if (served) return JSON.stringify({ openai: 'sk-1', eleven: '', azure: '' });
        served = true;
        return keys;
      },
      setItem: () => {},
      removeItem: () => {},
    });
    const out = await tts('Hi');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('No ElevenLabs API key configured')
    );
    expect(out.audio).toBe('data:audio/mpeg;base64,OPENAI:nova');
  });
});

describe('OpenAI voice selection', () => {
  it('goes straight to OpenAI when ElevenLabs is unavailable', async () => {
    saveKeys({ openai: 'sk-1', eleven: '', azure: '' });
    await tts('Hi', { openaiVoice: 'shimmer' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(openaiClient.tts).toHaveBeenCalledWith('Hi', 'shimmer');
  });

  it('accepts the legacy `voice` option and falls back to nova for anything unknown', async () => {
    saveKeys({ openai: 'sk-1', eleven: '', azure: '' });
    await tts('A', { voice: 'echo' });
    await tts('B', { openaiVoice: 'not-a-voice' });
    await tts('C');
    expect(openaiClient.tts.mock.calls.map((c) => c[1])).toEqual(['echo', 'nova', 'nova']);
  });
});
