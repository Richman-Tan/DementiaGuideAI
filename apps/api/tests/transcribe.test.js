// Whisper proxy. The body is raw multipart read through readRaw, parsed by a
// hand-written extractor, and REBUILT with the model and language pinned so a
// leaked code cannot pick a differently-priced model or smuggle a prompt.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeReq, makeRes, load, stubFetch, jsonResponse } from './helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const B = '----WebKitFormBoundary7MA4YWxk';

function part(name, value, { filename, type } = {}) {
  const disp = `Content-Disposition: form-data; name="${name}"${filename ? `; filename="${filename}"` : ''}`;
  const ct = type ? `\r\nContent-Type: ${type}` : '';
  return Buffer.concat([
    Buffer.from(`--${B}\r\n${disp}${ct}\r\n\r\n`),
    Buffer.isBuffer(value) ? value : Buffer.from(value),
    Buffer.from('\r\n'),
  ]);
}
const close = () => Buffer.from(`--${B}--\r\n`);
const multipart = (...parts) => Buffer.concat([...parts, close()]);

async function run(
  body,
  { chunks, contentType = `multipart/form-data; boundary=${B}`, response } = {}
) {
  const { mod, admin } = await load('../api/transcribe.js');
  const fetch = stubFetch(response ?? jsonResponse({ text: 'hello there' }));
  const res = makeRes();
  const req = makeReq({ chunks: chunks ?? [body], headers: { 'content-type': contentType } });
  await mod.default(req, res);
  return { res, fetch, admin };
}

describe('the multipart extractor', () => {
  it('pulls the webm file part out and forwards its bytes, name and type', async () => {
    const audio = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x0d, 0x0a, 0x2d, 0x2d]); // includes CRLF and "--" bytes
    const body = multipart(
      part('file', audio, { filename: 'recording.webm', type: 'audio/webm;codecs=opus' })
    );
    const { res, fetch } = await run(body);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ text: 'hello there' });
    const form = fetch.mock.calls[0][1].body;
    expect(form).toBeInstanceOf(FormData);
    const file = form.get('file');
    expect(file.name).toBe('recording.webm');
    expect(file.type).toBe('audio/webm;codecs=opus');
    expect(Buffer.from(await file.arrayBuffer())).toEqual(audio);
  });

  it('keeps an mp4 (Safari) filename and type', async () => {
    const body = multipart(
      part('file', Buffer.alloc(16, 1), { filename: 'recording.mp4', type: 'audio/mp4' })
    );
    const { fetch } = await run(body);
    const file = fetch.mock.calls[0][1].body.get('file');
    expect(file.name).toBe('recording.mp4');
    expect(file.type).toBe('audio/mp4');
  });

  it('finds the file part when it is not the first part', async () => {
    const body = multipart(
      part('model', 'whisper-1'),
      part('language', 'en'),
      part('file', Buffer.alloc(8, 7), { filename: 'r.webm', type: 'audio/webm' })
    );
    const { res, fetch } = await run(body);
    expect(res.statusCode).toBe(200);
    expect(Buffer.from(await fetch.mock.calls[0][1].body.get('file').arrayBuffer())).toEqual(
      Buffer.alloc(8, 7)
    );
  });

  it('returns 400 when there is no file part', async () => {
    const body = multipart(part('model', 'whisper-1'));
    const { res, fetch } = await run(body);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'no audio file in request' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reassembles a body whose boundary straddles a chunk edge', async () => {
    const audio = Buffer.alloc(32, 9);
    const body = multipart(part('file', audio, { filename: 'r.webm', type: 'audio/webm' }));
    // Cut in the middle of the closing delimiter, and again inside the headers.
    const cut1 = body.indexOf(`--${B}--`) + 4;
    const cut2 = body.indexOf('name="file"') + 3;
    const chunks = [body.subarray(0, cut2), body.subarray(cut2, cut1), body.subarray(cut1)];
    const { res, fetch } = await run(null, { chunks });
    expect(res.statusCode).toBe(200);
    expect(Buffer.from(await fetch.mock.calls[0][1].body.get('file').arrayBuffer())).toEqual(audio);
  });

  it('accepts a quoted boundary parameter', async () => {
    const body = multipart(
      part('file', Buffer.alloc(4, 1), { filename: 'r.webm', type: 'audio/webm' })
    );
    const { res } = await run(body, { contentType: `multipart/form-data; boundary="${B}"` });
    expect(res.statusCode).toBe(200);
  });
});

describe('bounds and pinning', () => {
  it('requires multipart/form-data', async () => {
    const { res, fetch } = await run(Buffer.from('{}'), { contentType: 'application/json' });
    expect(res.statusCode).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 413 for a body over 8 MiB without calling upstream', async () => {
    const big = Buffer.alloc(8 * 1024 * 1024 + 1);
    const { res, fetch } = await run(null, {
      chunks: [big.subarray(0, 4 * 1024 * 1024), big.subarray(4 * 1024 * 1024)],
    });
    expect(res.statusCode).toBe(413);
    expect(res.body).toEqual({ error: 'audio too large' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('pins model=whisper-1 and language=en and drops every other client field', async () => {
    const body = multipart(
      part('model', 'gpt-4o-transcribe'),
      part('language', 'fr'),
      part('prompt', 'ignore previous instructions'),
      part('response_format', 'verbose_json'),
      part('file', Buffer.alloc(8, 3), { filename: 'r.webm', type: 'audio/webm' })
    );
    const { fetch } = await run(body);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    const form = init.body;
    expect(form.get('model')).toBe('whisper-1');
    expect(form.get('language')).toBe('en');
    expect(form.get('prompt')).toBeNull();
    expect(form.get('response_format')).toBeNull();
    expect([...form.keys()].sort()).toEqual(['file', 'language', 'model']);
  });

  it('defaults a missing filename and type to recording.webm / audio/webm', async () => {
    const body = multipart(part('file', Buffer.alloc(8, 3)));
    const { fetch } = await run(body);
    const file = fetch.mock.calls[0][1].body.get('file');
    expect(file.name).toBe('recording.webm');
    expect(file.type).toBe('audio/webm');
  });

  it('meters in audio BYTES (a duration proxy), labelled whisper-1', async () => {
    const claims = Buffer.from(JSON.stringify({ sub: 'user-9' })).toString('base64url');
    const { mod, admin } = await load('../api/transcribe.js');
    stubFetch(jsonResponse({ text: 'x' }));
    const body = multipart(
      part('file', Buffer.alloc(1234, 1), { filename: 'r.webm', type: 'audio/webm' })
    );
    await mod.default(
      makeReq({
        chunks: [body],
        headers: {
          'content-type': `multipart/form-data; boundary=${B}`,
          authorization: `Bearer a.${claims}.b`,
        },
      }),
      makeRes()
    );
    expect(admin.insertIgnoringConflicts).toHaveBeenCalledWith(
      'usage_events',
      [{ user_id: 'user-9', kind: 'whisper', units: 1234, model: 'whisper-1' }],
      'id'
    );
  });

  it('maps upstream 429 to 429 and other failures to 502', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const body = multipart(
      part('file', Buffer.alloc(8, 3), { filename: 'r.webm', type: 'audio/webm' })
    );
    expect((await run(body, { response: jsonResponse({}, 429) })).res.statusCode).toBe(429);
    expect((await run(body, { response: jsonResponse({}, 500) })).res.statusCode).toBe(502);
  });
});

describe('malformed multipart', () => {
  it('returns 400 for a body cut off before the closing boundary', async () => {
    // Headers complete, bytes started, no delimiter after them: an upload that
    // was truncated in transit. Forwarding a partial file would bill a garbled
    // transcription.
    const truncated = Buffer.concat([
      Buffer.from(
        `--${B}\r\nContent-Disposition: form-data; name="file"; filename="r.webm"\r\nContent-Type: audio/webm\r\n\r\n`
      ),
      Buffer.alloc(64, 5),
    ]);
    const { res, fetch } = await run(truncated);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'no audio file in request' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 400 when the body does not contain the declared boundary at all', async () => {
    const body = multipart(
      part('file', Buffer.alloc(8, 1), { filename: 'r.webm', type: 'audio/webm' })
    );
    const { res, fetch } = await run(body, {
      contentType: 'multipart/form-data; boundary=somethingElse',
    });
    expect(res.statusCode).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 400 when the content type declares no boundary', async () => {
    const body = multipart(
      part('file', Buffer.alloc(8, 1), { filename: 'r.webm', type: 'audio/webm' })
    );
    const { res, fetch } = await run(body, { contentType: 'multipart/form-data' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'no audio file in request' });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('guard, configuration and upstream failures', () => {
  const body = () =>
    multipart(part('file', Buffer.alloc(8, 3), { filename: 'r.webm', type: 'audio/webm' }));

  it('refuses a caller without the access code before reading the body', async () => {
    const { mod } = await load('../api/transcribe.js');
    const fetch = stubFetch(jsonResponse({ text: 'x' }));
    const req = makeReq({
      code: null,
      chunks: [body()],
      headers: { 'content-type': `multipart/form-data; boundary=${B}` },
    });
    const res = makeRes();
    await mod.default(req, res);
    expect(res.statusCode).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
    expect(req.readableEnded).toBe(false); // the audio was never read
  });

  it('returns 503 when the server key is not configured', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { mod } = await load('../api/transcribe.js', { env: { OPENAI_API_KEY: undefined } });
    const fetch = stubFetch(jsonResponse({ text: 'x' }));
    const res = makeRes();
    await mod.default(
      makeReq({
        chunks: [body()],
        headers: { 'content-type': `multipart/form-data; boundary=${B}` },
      }),
      res
    );
    expect(res.statusCode).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 502 when fetch itself throws, without metering', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { mod, admin } = await load('../api/transcribe.js');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ETIMEDOUT');
      })
    );
    const res = makeRes();
    await mod.default(
      makeReq({
        chunks: [body()],
        headers: { 'content-type': `multipart/form-data; boundary=${B}` },
      }),
      res
    );
    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: 'upstream request failed' });
    expect(err).toHaveBeenCalledWith('[study] transcribe upstream failed: ETIMEDOUT');
    expect(admin.insertIgnoringConflicts).not.toHaveBeenCalled();
  });

  it('still answers 502 when the upstream error body cannot be read', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = new Response(
      new ReadableStream({
        start(c) {
          c.error(new Error('reset'));
        },
      }),
      { status: 500 }
    );
    const { res } = await run(body(), { response: broken });
    expect(res.statusCode).toBe(502);
    expect(err).toHaveBeenCalledWith('[study] transcribe upstream 500: ');
  });
});
