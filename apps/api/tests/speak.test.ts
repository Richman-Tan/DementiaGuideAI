import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpeakHandler, parseSpeakRequest, SPEAK_LIMITS, VOICES } from '../src/speak.ts';
import type { SpeakDeps } from '../src/speak.ts';
import type { ApiRequest, ApiResponse } from '../src/http.ts';
import { makeReq, makeRes, ORIGIN } from './helpers.js';

const [AARON, ARIANA] = VOICES as [string, string];
const AUDIO = {
  audio_base64: 'AAAA',
  alignment: { characters: ['H', 'i'], character_start_times_seconds: [0, 0.1] },
};

describe('parseSpeakRequest', () => {
  const ok = (body: unknown) => {
    const parsed = parseSpeakRequest(body);
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.value;
  };
  const error = (body: unknown) => {
    const parsed = parseSpeakRequest(body);
    if (parsed.ok) throw new Error('expected a refusal');
    return parsed.error;
  };

  it('accepts a sentence and a roster voice, with the usual rate', () => {
    expect(ok({ text: '  Keep afternoons calm.  ', voiceId: AARON })).toEqual({
      text: 'Keep afternoons calm.',
      voiceId: AARON,
      speechRate: SPEAK_LIMITS.defaultRate,
    });
    expect(ok(JSON.stringify({ text: 'Hi', voiceId: ARIANA })).voiceId).toBe(ARIANA);
  });

  it('keeps the rate within what the voice can do', () => {
    expect(ok({ text: 'Hi', voiceId: AARON, speechRate: 0.92 }).speechRate).toBe(0.92);
    expect(ok({ text: 'Hi', voiceId: AARON, speechRate: 0.1 }).speechRate).toBe(0.5);
    expect(ok({ text: 'Hi', voiceId: AARON, speechRate: 9 }).speechRate).toBe(1.2);
  });

  it('bounds the text, counted after trimming', () => {
    expect(ok({ text: ` ${'a'.repeat(600)} `, voiceId: AARON }).text).toHaveLength(600);
    expect(error({ text: 'a'.repeat(601), voiceId: AARON })).toBe(
      'text is longer than 600 characters'
    );
  });

  it.each([
    ['{not json', 'the request body is not valid JSON'],
    [null, 'the request body must be a JSON object'],
    [[], 'the request body must be a JSON object'],
    [7, 'the request body must be a JSON object'],
    [{ voiceId: AARON }, 'text is required'],
    [{ text: '   ', voiceId: AARON }, 'text is required'],
    [{ text: 5, voiceId: AARON }, 'text is required'],
    [{ text: 'Hi' }, 'voiceId is not one of the available voices'],
    [
      { text: 'Hi', voiceId: 'someone-elses-cloned-voice' },
      'voiceId is not one of the available voices',
    ],
    [{ text: 'Hi', voiceId: 7 }, 'voiceId is not one of the available voices'],
    [{ text: 'Hi', voiceId: AARON, speechRate: 'fast' }, 'speechRate must be a number'],
    [{ text: 'Hi', voiceId: AARON, speechRate: Infinity }, 'speechRate must be a number'],
  ])('refuses %j', (body, message) => {
    expect(error(body)).toBe(message);
  });
});

describe('POST /api/speak', () => {
  const fakeRequest = makeReq as unknown as (options: Record<string, unknown>) => ApiRequest;
  const request = (overrides: Record<string, unknown> = {}) =>
    fakeRequest({
      code: '',
      headers: { authorization: 'Bearer session-token' },
      body: { text: 'Keep afternoons calm.', voiceId: AARON, speechRate: 0.92 },
      ...overrides,
    });
  type FakeRes = ApiResponse & { body: unknown; headers: Record<string, string> };
  const response = () => makeRes() as unknown as FakeRes;

  function setup(
    options: Partial<SpeakDeps> & { upstream?: () => Promise<Response> | Response } = {}
  ) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return options.upstream
        ? options.upstream()
        : new Response(JSON.stringify(AUDIO), { status: 200 });
    }) as unknown as typeof fetch;
    const spoken: unknown[] = [];
    const admit = vi.fn<SpeakDeps['admit']>(async () => ({ ok: true }));
    const verifySession = vi.fn(async () => 'user-1' as string | null);
    const handler = createSpeakHandler({
      apiKey: 'eleven-key',
      verifySession,
      admit,
      fetch: fetchFn,
      onSpoken: (reading) => spoken.push(reading),
      ...options,
    });
    return { handler, calls, spoken, admit, verifySession };
  }

  beforeEach(() => vi.stubEnv('ALLOWED_ORIGINS', ORIGIN));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('answers a preflight, and refuses anything but POST', async () => {
    const { handler, verifySession } = setup();
    const pre = response();
    await handler(request({ method: 'OPTIONS' }), pre);
    expect(pre.statusCode).toBe(204);
    const get = response();
    await handler(request({ method: 'GET' }), get);
    expect(get.statusCode).toBe(405);
    expect(get.headers.allow).toBe('POST');
    expect(verifySession).not.toHaveBeenCalled();
  });

  it('does nothing while switched off', async () => {
    const { handler, verifySession, calls } = setup({ apiKey: null });
    const res = response();
    await handler(request(), res);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'speech is not available yet' });
    expect(verifySession).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it('requires a verified session', async () => {
    const { handler, admit, calls } = setup({ verifySession: async () => null });
    const res = response();
    await handler(request(), res);
    expect(res.statusCode).toBe(401);
    expect(admit).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it('refuses a bad request before counting it', async () => {
    const { handler, admit } = setup();
    const res = response();
    await handler(request({ body: { text: 'Hi', voiceId: 'another-voice' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'voiceId is not one of the available voices' });

    const unparsed = request();
    Object.defineProperty(unparsed, 'body', {
      get() {
        throw new Error('Invalid JSON');
      },
    });
    const res2 = response();
    await handler(unparsed, res2);
    expect(res2.statusCode).toBe(400);
    expect(res2.body).toEqual({ error: 'the request body is not valid JSON' });
    expect(admit).not.toHaveBeenCalled();
  });

  it('obeys the daily cap, and asks the provider for nothing when refused', async () => {
    const admit = vi.fn<SpeakDeps['admit']>(async () => ({
      ok: false,
      status: 429,
      code: 'demo_limit',
      error: "The live demo has reached today's limit.",
    }));
    const { handler, calls, spoken } = setup({ admit });
    const res = response();
    await handler(request(), res);
    expect(admit).toHaveBeenCalledWith('user-1');
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({
      error: "The live demo has reached today's limit.",
      code: 'demo_limit',
    });
    expect(calls).toEqual([]);
    expect(spoken).toEqual([]);
  });

  it('asks the provider for the speech with the server’s key, and returns its reply unchanged', async () => {
    const { handler, calls, spoken } = setup();
    const res = response();
    await handler(request(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(AUDIO);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      `https://api.elevenlabs.io/v1/text-to-speech/${AARON}/with-timestamps`
    );
    expect(calls[0]?.init.headers).toEqual({
      'xi-api-key': 'eleven-key',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({
      text: 'Keep afternoons calm.',
      model_id: 'eleven_turbo_v2_5',
      output_format: 'mp3_44100_64',
      voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.2, speed: 0.92 },
    });
    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
    expect(spoken).toEqual([{ userId: 'user-1', chars: 21, model: 'eleven_turbo_v2_5' }]);
  });

  it('answers 502 when the provider cannot be reached, with the reason in the log only', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const [failure, logged] of [
      [new Error('socket hang up'), 'socket hang up'],
      ['timed out', 'timed out'],
    ] as const) {
      const { handler, spoken } = setup({ upstream: () => Promise.reject(failure) });
      const res = response();
      await handler(request(), res);
      expect(res.statusCode).toBe(502);
      expect(res.body).toEqual({ error: 'speech could not be produced', code: 'unavailable' });
      expect(log).toHaveBeenCalledWith(`[speak] upstream request failed: ${logged}`);
      expect(spoken).toEqual([]);
    }
  });

  it('keeps the provider’s error text out of the reply', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const quota = setup({
      upstream: () =>
        new Response('{"detail":"quota_exceeded for account acct_123"}', { status: 429 }),
    });
    const res = response();
    await quota.handler(request(), res);
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: 'speech could not be produced', code: 'unavailable' });
    expect(log).toHaveBeenCalledWith(
      '[speak] upstream 429: {"detail":"quota_exceeded for account acct_123"}'
    );

    const broken = setup({ upstream: () => new Response('oops', { status: 500 }) });
    const res2 = response();
    await broken.handler(request(), res2);
    expect(res2.statusCode).toBe(502);
    expect(JSON.stringify(res2.body)).not.toContain('oops');
    expect(broken.spoken).toEqual([]);
  });

  it('logs an empty detail when the provider’s error cannot be read', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unreadable = new Response(null, { status: 500 });
    vi.spyOn(unreadable, 'text').mockRejectedValue(new Error('stream closed'));
    const { handler } = setup({ upstream: () => unreadable });
    await handler(request(), response());
    expect(log).toHaveBeenCalledWith('[speak] upstream 500: ');
  });

  it('uses the global fetch and needs no metering callback', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify(AUDIO), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    const handler = createSpeakHandler({
      apiKey: 'eleven-key',
      verifySession: async () => 'user-1',
      admit: async () => ({ ok: true }),
    });
    const res = response();
    await handler(request(), res);
    expect(res.statusCode).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
