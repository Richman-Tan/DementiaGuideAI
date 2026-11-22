// The three small proxies: embed, OpenAI speech, ElevenLabs speech. Each has an
// allowlist, a character cap, and a pinned upstream shape.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeReq, makeRes, load, stubFetch, jsonResponse } from './helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function call(modulePath, body, response, headers = {}) {
  const { mod, admin } = await load(modulePath);
  const fetch = stubFetch(response);
  const res = makeRes();
  await mod.default(makeReq({ body, headers }), res);
  return { res, fetch, admin };
}
const sent = (fetch) => JSON.parse(fetch.mock.calls[0][1].body);

describe('embed', () => {
  const ok = () => jsonResponse({ data: [{ embedding: [0.1] }], usage: { total_tokens: 7 } });

  it('rejects models outside the allowlist and empty input', async () => {
    expect(
      (await call('../api/embed.js', { model: 'text-embedding-ada-002', input: 'q' }, ok())).res
        .statusCode
    ).toBe(400);
    expect(
      (await call('../api/embed.js', { model: 'text-embedding-3-small', input: '   ' }, ok())).res
        .statusCode
    ).toBe(400);
  });

  it('silently slices input to 4000 characters and forwards the model', async () => {
    const { res, fetch } = await call(
      '../api/embed.js',
      { model: 'text-embedding-3-small', input: 'x'.repeat(5000) },
      ok()
    );
    expect(res.statusCode).toBe(200);
    expect(fetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/embeddings');
    expect(sent(fetch).input).toHaveLength(4000);
    expect(sent(fetch).model).toBe('text-embedding-3-small');
  });

  it('returns the upstream body and meters total_tokens', async () => {
    const claims = Buffer.from(JSON.stringify({ sub: 'u' })).toString('base64url');
    const { res, admin } = await call(
      '../api/embed.js',
      { model: 'text-embedding-3-small', input: 'q' },
      ok(),
      { authorization: `Bearer a.${claims}.b` }
    );
    expect(res.body.usage.total_tokens).toBe(7);
    expect(admin.insertIgnoringConflicts.mock.calls[0][1][0]).toMatchObject({
      kind: 'embedding',
      units: 7,
    });
  });

  it('maps 429 → 429 and 500 → 502', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      (
        await call(
          '../api/embed.js',
          { model: 'text-embedding-3-small', input: 'q' },
          jsonResponse({}, 429)
        )
      ).res.statusCode
    ).toBe(429);
    expect(
      (
        await call(
          '../api/embed.js',
          { model: 'text-embedding-3-small', input: 'q' },
          jsonResponse({}, 500)
        )
      ).res.statusCode
    ).toBe(502);
  });
});

describe('speech (OpenAI tts-1)', () => {
  const ok = () => new Response(new Uint8Array([1, 2, 3]), { status: 200 });

  it('rejects unknown voices and empty input', async () => {
    expect(
      (await call('../api/speech.js', { input: 'hi', voice: 'gandalf' }, ok())).res.statusCode
    ).toBe(400);
    expect((await call('../api/speech.js', { input: '' }, ok())).res.statusCode).toBe(400);
  });

  it('pins tts-1/mp3, defaults the voice to nova, slices to 4000 chars, and never caches', async () => {
    const { res, fetch } = await call('../api/speech.js', { input: 'y'.repeat(4500) }, ok());
    expect(res.statusCode).toBe(200);
    expect(sent(fetch)).toMatchObject({ model: 'tts-1', voice: 'nova', response_format: 'mp3' });
    expect(sent(fetch).input).toHaveLength(4000);
    expect(res.getHeader('Content-Type')).toBe('audio/mpeg');
    expect(res.getHeader('Cache-Control')).toBe('no-store');
    expect(Buffer.from(res.body)).toEqual(Buffer.from([1, 2, 3]));
  });

  it('meters in characters of the input', async () => {
    const claims = Buffer.from(JSON.stringify({ sub: 'u' })).toString('base64url');
    const { admin } = await call('../api/speech.js', { input: 'hello', voice: 'alloy' }, ok(), {
      authorization: `Bearer a.${claims}.b`,
    });
    expect(admin.insertIgnoringConflicts.mock.calls[0][1][0]).toMatchObject({
      kind: 'tts',
      units: 5,
      model: 'tts-1',
    });
  });
});

describe('eleven-tts', () => {
  const AARON = 'nPczCjzI2devNBz1zQrb';
  const ok = () => jsonResponse({ audio_base64: 'AAA=', alignment: {} });

  it('rejects a voice outside the two-voice roster and empty text', async () => {
    expect(
      (await call('../api/eleven-tts.js', { text: 'hi', voiceId: 'someone-else' }, ok())).res
        .statusCode
    ).toBe(400);
    expect(
      (await call('../api/eleven-tts.js', { text: ' ', voiceId: AARON }, ok())).res.statusCode
    ).toBe(400);
  });

  it('calls the with-timestamps REST endpoint with the pinned model and returns the JSON unchanged', async () => {
    const { res, fetch } = await call(
      '../api/eleven-tts.js',
      { text: 'Kia ora', voiceId: AARON },
      ok()
    );
    expect(fetch.mock.calls[0][0]).toBe(
      `https://api.elevenlabs.io/v1/text-to-speech/${AARON}/with-timestamps`
    );
    expect(fetch.mock.calls[0][1].headers['xi-api-key']).toBe('el-test');
    expect(sent(fetch)).toMatchObject({
      model_id: 'eleven_turbo_v2_5',
      output_format: 'mp3_44100_64',
    });
    expect(res.body).toEqual({ audio_base64: 'AAA=', alignment: {} });
  });

  it('clamps speechRate to [0.5, 1.2] and defaults it to 0.78', async () => {
    for (const [given, expected] of [
      [2, 1.2],
      [0.1, 0.5],
      [0.9, 0.9],
      [undefined, 0.78],
      ['x', 0.78],
    ]) {
      const { fetch } = await call(
        '../api/eleven-tts.js',
        { text: 'hi', voiceId: AARON, speechRate: given },
        ok()
      );
      expect(sent(fetch).voice_settings.speed, `speechRate ${given}`).toBe(expected);
    }
  });

  it('slices text to 4000 characters', async () => {
    const { fetch } = await call(
      '../api/eleven-tts.js',
      { text: 'z'.repeat(4100), voiceId: AARON },
      ok()
    );
    expect(sent(fetch).text).toHaveLength(4000);
  });
});

// What all three share: the guard runs first, the server key must be present,
// and an upstream failure is reported as the proxy's own 502 (or a 429 passed
// through), never as the upstream's status, even when its body is unreadable.
describe.each([
  ['embed', '../api/embed.js', { model: 'text-embedding-3-small', input: 'q' }, 'OPENAI_API_KEY'],
  ['speech', '../api/speech.js', { input: 'hello' }, 'OPENAI_API_KEY'],
  [
    'eleven-tts',
    '../api/eleven-tts.js',
    { text: 'hello', voiceId: 'nPczCjzI2devNBz1zQrb' },
    'ELEVENLABS_API_KEY',
  ],
])('%s: guard, configuration and upstream failures', (_name, modulePath, body, keyName) => {
  async function invoke({ code, env, fetchImpl } = {}) {
    const { mod, admin } = await load(modulePath, { env });
    const fetch = vi.fn(fetchImpl ?? (async () => jsonResponse({})));
    vi.stubGlobal('fetch', fetch);
    const res = makeRes();
    await mod.default(makeReq({ body, ...(code !== undefined ? { code } : {}) }), res);
    return { res, fetch, admin };
  }

  it('refuses a caller without the access code before calling upstream', async () => {
    const { res, fetch } = await invoke({ code: null });
    expect(res.statusCode).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 503 when the server key is not configured', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { res, fetch } = await invoke({ env: { [keyName]: undefined } });
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'study backend not configured' });
    expect(fetch).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledWith(`[study] ${keyName} is not configured`);
  });

  it('returns 502 when fetch itself throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { res, admin } = await invoke({
      fetchImpl: async () => {
        throw new Error('ECONNRESET');
      },
    });
    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: 'upstream request failed' });
    expect(admin.insertIgnoringConflicts).not.toHaveBeenCalled();
  });

  it('passes a 429 through and maps any other failure to 502, without metering', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const limited = await invoke({ fetchImpl: async () => jsonResponse({}, 429) });
    expect(limited.res.statusCode).toBe(429);
    const failed = await invoke({ fetchImpl: async () => jsonResponse({}, 401) });
    expect(failed.res.statusCode).toBe(502);
    expect(failed.res.body).toEqual({ error: 'upstream error' });
    expect(failed.admin.insertIgnoringConflicts).not.toHaveBeenCalled();
  });

  it('still answers 502 when the upstream error body cannot be read', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.error(new Error('reset'));
          },
        }),
        { status: 500 }
      );
    const { res } = await invoke({ fetchImpl: async () => broken() });
    expect(res.statusCode).toBe(502);
    expect(err.mock.calls[0][0]).toMatch(/upstream 500: $/);
  });
});
