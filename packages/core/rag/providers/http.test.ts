import { postJson } from './http.ts';
import type { Fetch } from './http.ts';

const respond = (status: number, body: string): Fetch =>
  (async () => new Response(body, { status })) as unknown as Fetch;

describe('postJson', () => {
  it('posts JSON with the given headers and returns the parsed body', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('{"ok":true}', { status: 200 });
    }) as unknown as Fetch;
    const signal = new AbortController().signal;
    const out = await postJson(
      fetchFn,
      'Svc',
      'https://x.test/a',
      { Authorization: 'Bearer k' },
      { q: 1 },
      signal
    );
    expect(out).toEqual({ ok: true });
    expect(calls).toEqual([
      {
        url: 'https://x.test/a',
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer k' },
          body: '{"q":1}',
          signal,
        },
      },
    ]);
  });

  it('sends no signal when none is given', async () => {
    let seen: RequestInit = {};
    const fetchFn = (async (_url: string, init: RequestInit) => {
      seen = init;
      return new Response('[]', { status: 200 });
    }) as unknown as Fetch;
    await postJson(fetchFn, 'Svc', 'https://x.test/a', {}, {});
    expect('signal' in seen).toBe(false);
  });

  it.each([
    [
      'a "detail" field',
      401,
      '{"detail":"Invalid API key"}',
      'Svc failed (HTTP 401): Invalid API key',
    ],
    [
      'a code and message',
      404,
      '{"code":"PGRST202","message":"Could not find the function"}',
      'Svc failed (HTTP 404): PGRST202: Could not find the function',
    ],
    ['a message only', 500, '{"message":"boom"}', 'Svc failed (HTTP 500): boom'],
    ['JSON with no explanation', 500, '{"error":true}', 'Svc failed (HTTP 500): {"error":true}'],
    ['plain text', 502, 'Bad gateway', 'Svc failed (HTTP 502): Bad gateway'],
    ['an empty body', 503, '', 'Svc failed (HTTP 503): no response body'],
  ])(
    'names the service and the reason when the reply is an error with %s',
    async (_n, status, body, message) => {
      await expect(
        postJson(respond(status, body), 'Svc', 'https://x.test/a', {}, {})
      ).rejects.toThrow(message);
    }
  );

  it('keeps a long error body short', async () => {
    const promise = postJson(respond(500, 'x'.repeat(1000)), 'Svc', 'https://x.test/a', {}, {});
    await expect(promise).rejects.toThrow(/^Svc failed \(HTTP 500\): x{200}$/);
  });
});
