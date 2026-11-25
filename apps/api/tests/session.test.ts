import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionVerifier } from '../src/session.ts';

/** A token shaped like a JWT whose payload expires at `exp` (seconds). Not signed: Supabase is the verifier. */
const tokenExpiring = (exp: number, tag = 'a') =>
  `h.${Buffer.from(JSON.stringify({ exp, tag })).toString('base64url')}.sig`;

function setup(
  reply: (token: string) => Response | Promise<Response>,
  options: { cacheMs?: number; maxEntries?: number } = {}
) {
  let clock = 1_000_000;
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchFn = (async (url: string, init: { headers: Record<string, string> }) => {
    calls.push({ url, headers: init.headers });
    return reply(init.headers.Authorization!.slice(7));
  }) as unknown as typeof fetch;
  const verify = createSessionVerifier({
    supabaseUrl: 'https://abc.supabase.co',
    serviceKey: 'service-key',
    fetch: fetchFn,
    now: () => clock,
    ...options,
  });
  return { verify, calls, advance: (ms: number) => (clock += ms), nowSeconds: () => clock / 1000 };
}

const user = (id: string) => new Response(JSON.stringify({ id }), { status: 200 });

afterEach(() => vi.restoreAllMocks());

describe('createSessionVerifier', () => {
  it('asks Supabase who the token belongs to', async () => {
    const { verify, calls, nowSeconds } = setup(() => user('user-1'));
    const token = tokenExpiring(nowSeconds() + 3600);
    expect(await verify(token)).toBe('user-1');
    expect(calls).toEqual([
      {
        url: 'https://abc.supabase.co/auth/v1/user',
        headers: { Authorization: `Bearer ${token}`, apikey: 'service-key' },
      },
    ]);
  });

  it('refuses a missing token without asking anyone', async () => {
    const { verify, calls } = setup(() => user('user-1'));
    expect(await verify('')).toBeNull();
    expect(calls).toEqual([]);
  });

  it('remembers a verified session, then checks again once the memory lapses', async () => {
    const { verify, calls, advance, nowSeconds } = setup(() => user('user-1'), { cacheMs: 60_000 });
    const token = tokenExpiring(nowSeconds() + 3600);
    await verify(token);
    advance(59_000);
    expect(await verify(token)).toBe('user-1');
    expect(calls).toHaveLength(1);
    advance(2_000);
    expect(await verify(token)).toBe('user-1');
    expect(calls).toHaveLength(2);
  });

  it('never remembers a session past the moment its token expires', async () => {
    const { verify, calls, advance, nowSeconds } = setup(() => user('user-1'), {
      cacheMs: 600_000,
    });
    const token = tokenExpiring(nowSeconds() + 10);
    await verify(token);
    advance(11_000);
    await verify(token);
    expect(calls).toHaveLength(2);
  });

  it('still verifies a token whose payload cannot be read, and remembers it for the usual time', async () => {
    const { verify, calls, advance } = setup(() => user('user-1'), { cacheMs: 60_000 });
    expect(await verify('not-a-jwt')).toBe('user-1');
    advance(30_000);
    await verify('not-a-jwt');
    expect(calls).toHaveLength(1);
  });

  it.each([
    ['Supabase rejects the token', () => new Response('{"msg":"invalid JWT"}', { status: 401 })],
    ['the reply names no user', () => new Response('{}', { status: 200 })],
    ['the user id is not text', () => new Response('{"id":42}', { status: 200 })],
  ])('refuses when %s, and does not remember the refusal', async (_name, reply) => {
    const { verify, calls } = setup(reply);
    expect(await verify('h.e30.sig')).toBeNull();
    expect(await verify('h.e30.sig')).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it('refuses, and says why in the log, when Supabase cannot be reached', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { verify } = setup(() => Promise.reject(new Error('network down')));
    expect(await verify('h.e30.sig')).toBeNull();
    expect(log).toHaveBeenCalledWith('[session] verification request failed: network down');
  });

  it('describes a failure that is not an Error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { verify } = setup(() => Promise.reject('socket closed'));
    await verify('h.e30.sig');
    expect(log).toHaveBeenCalledWith('[session] verification request failed: socket closed');
  });

  it('forgets the oldest session when its memory is full', async () => {
    const { verify, calls, nowSeconds } = setup((token) => user(`user-of-${token.length}`), {
      maxEntries: 2,
    });
    const exp = nowSeconds() + 3600;
    const [a, b, c] = [
      tokenExpiring(exp, 'a'),
      tokenExpiring(exp, 'bb'),
      tokenExpiring(exp, 'ccc'),
    ];
    await verify(a);
    await verify(b);
    await verify(c); // pushes `a` out
    expect(calls).toHaveLength(3);
    await verify(b);
    await verify(c);
    expect(calls).toHaveLength(3);
    await verify(a);
    expect(calls).toHaveLength(4);
  });

  it('uses the global fetch and clock unless others are supplied', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(user('user-9'));
    const verify = createSessionVerifier({
      supabaseUrl: 'https://abc.supabase.co',
      serviceKey: 'k',
    });
    expect(await verify('h.e30.sig')).toBe('user-9');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
