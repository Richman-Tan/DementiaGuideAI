// The chat proxy is a passthrough with bounds. What it must hold: the model
// allowlist, an input cap (input is billed too), the output ceiling, a
// temperature that defaults rather than becoming NaN, honest upstream status
// mapping, and a visible marker when the stream dies after the 200 went out.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeReq, makeRes, load, stubFetch, jsonResponse } from './helpers.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const messages = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hello' }];

function sseResponse(frames, { failAfter = null } = {}) {
  let i = 0;
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    pull(controller) {
      if (failAfter !== null && i >= failAfter) { controller.error(new Error('socket reset')); return; }
      if (i >= frames.length) { controller.close(); return; }
      controller.enqueue(enc.encode(frames[i++]));
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

async function run(body, { response, env } = {}) {
  const { mod } = await load('../api/chat.js', { env });
  const fetch = stubFetch(response ?? sseResponse(['data: {"choices":[]}\n\n', 'data: [DONE]\n\n']));
  const res = makeRes();
  await mod.default(makeReq({ body }), res);
  return { res, fetch };
}

describe('input bounds', () => {
  it('rejects a model outside the allowlist before calling upstream', async () => {
    const { res, fetch } = await run({ model: 'gpt-4.1', messages });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'model not permitted' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requires a non-empty messages array', async () => {
    const { res } = await run({ model: 'gpt-4o', messages: [] });
    expect(res.statusCode).toBe(400);
  });

  it('rejects more than 60 messages', async () => {
    const many = Array.from({ length: 61 }, () => ({ role: 'user', content: 'x' }));
    const { res, fetch } = await run({ model: 'gpt-4o', messages: many });
    expect(res.statusCode).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 413 once the conversation exceeds 60,000 characters', async () => {
    const big = [{ role: 'user', content: 'x'.repeat(60001) }];
    const { res, fetch } = await run({ model: 'gpt-4o', messages: big });
    expect(res.statusCode).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
    const ok = await run({ model: 'gpt-4o', messages: [{ role: 'user', content: 'x'.repeat(60000) }] });
    expect(ok.res.statusCode).toBe(200);
  });
});

describe('what goes upstream', () => {
  it('caps max_tokens at 1600 and defaults it to 800', async () => {
    const capped = await run({ model: 'gpt-4o', messages, max_tokens: 5000 });
    expect(JSON.parse(capped.fetch.mock.calls[0][1].body).max_tokens).toBe(1600);
    const dflt = await run({ model: 'gpt-4o', messages });
    expect(JSON.parse(dflt.fetch.mock.calls[0][1].body).max_tokens).toBe(800);
  });

  it('clamps temperature to [0, 1] and defaults a missing or non-numeric value to 0.4', async () => {
    const cases = [[1.7, 1], [-2, 0], [0.7, 0.7], [undefined, 0.4], ['abc', 0.4]];
    for (const [given, expected] of cases) {
      const { fetch } = await run({ model: 'gpt-4o', messages, temperature: given });
      const sent = JSON.parse(fetch.mock.calls[0][1].body);
      expect(sent.temperature, `temperature ${given}`).toBe(expected);
      expect(sent.temperature).not.toBeNull(); // NaN would serialise as null → OpenAI default 1.0
    }
  });

  // Number(null) is 0, not NaN, so a JSON `temperature: null` generates at 0
  // rather than the 0.4 default the comment in chat.js promises for a missing
  // value. No client sends null today; recorded, not fixed.
  it.todo('treats temperature: null as missing (defaults to 0.4) — currently clamps to 0');

  it('streams with include_usage so the turn is meterable, using the server key', async () => {
    const { fetch } = await run({ model: 'gpt-4o-mini', messages });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    const sent = JSON.parse(init.body);
    expect(sent.stream).toBe(true);
    expect(sent.stream_options).toEqual({ include_usage: true });
    expect(sent.model).toBe('gpt-4o-mini');
  });
});

describe('upstream status mapping', () => {
  it('maps upstream 429 to 429', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { res } = await run({ model: 'gpt-4o', messages }, { response: jsonResponse({ error: 'slow down' }, 429) });
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: 'rate limited' });
  });

  it('maps every other upstream failure — including 401, which is OUR key — to 502', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const status of [401, 500, 503]) {
      const { res } = await run({ model: 'gpt-4o', messages }, { response: jsonResponse({}, status) });
      expect(res.statusCode, `upstream ${status}`).toBe(502);
    }
  });

  it('returns 502 when fetch itself throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { mod } = await load('../api/chat.js');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET'); }));
    const res = makeRes();
    await mod.default(makeReq({ body: { model: 'gpt-4o', messages } }), res);
    expect(res.statusCode).toBe(502);
  });

  it('returns 503 when the server key is not configured', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { res } = await run({ model: 'gpt-4o', messages }, { env: { OPENAI_API_KEY: undefined } });
    expect(res.statusCode).toBe(503);
  });
});

describe('streaming', () => {
  it('relays the frames verbatim and ends cleanly', async () => {
    const frames = ['data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n', 'data: [DONE]\n\n'];
    const { res } = await run({ model: 'gpt-4o', messages }, { response: sseResponse(frames) });
    expect(res.statusCode).toBe(200);
    expect(res.getHeader('Content-Type')).toMatch(/text\/event-stream/);
    expect(res.chunks.join('')).toBe(frames.join(''));
    expect(res.chunks.join('')).not.toContain('stream_interrupted');
    expect(res.ended).toBe(true);
  });

  it('emits the stream_interrupted marker when upstream dies mid-stream', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const frames = ['data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'];
    const { res } = await run({ model: 'gpt-4o', messages }, { response: sseResponse(frames, { failAfter: 1 }) });
    expect(res.statusCode).toBe(200);
    expect(res.chunks.at(-1)).toBe('data: {"error":"stream_interrupted"}\n\n');
    expect(res.ended).toBe(true);
  });

  it('records total_tokens from the trailing usage frame, and 0 when there is none', async () => {
    const withUsage = [
      'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":2400,"completion_tokens":200,"total_tokens":2600}}\n\ndata: [DONE]\n\n',
    ];
    const claims = Buffer.from(JSON.stringify({ sub: 'user-1' })).toString('base64url');
    const auth = { authorization: `Bearer a.${claims}.b` };

    const a = await load('../api/chat.js');
    stubFetch(sseResponse(withUsage));
    await a.mod.default(makeReq({ body: { model: 'gpt-4o', messages }, headers: auth }), makeRes());
    expect(a.admin.insertIgnoringConflicts).toHaveBeenCalledWith(
      'usage_events', [{ user_id: 'user-1', kind: 'chat', units: 2600, model: 'gpt-4o' }], 'id',
    );

    const b = await load('../api/chat.js');
    stubFetch(sseResponse(['data: {"choices":[]}\n\ndata: [DONE]\n\n']));
    await b.mod.default(makeReq({ body: { model: 'gpt-4o', messages }, headers: auth }), makeRes());
    expect(b.admin.insertIgnoringConflicts.mock.calls[0][1][0].units).toBe(0);
  });
});
