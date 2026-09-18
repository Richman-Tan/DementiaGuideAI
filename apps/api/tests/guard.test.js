// The request guard is the only thing between a stranger and a billed API.
// These pin the properties its comments promise: weak codes refused at config
// time, a digest-based compare, a digest-based meter key, an origin allowlist
// rather than `*`, preflight answered before the method check, and the
// fail-closed / fail-open split on the meter.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { makeReq, makeRes, load, CODE, ORIGIN } from './helpers.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('access codes', () => {
  it('refuses a code shorter than 16 characters at configuration time', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { mod } = await load('../api/_lib/guard.js', { env: { STUDY_ACCESS_CODES: 'short-code' } });
    const res = makeRes();
    const out = await mod.guard(makeReq({ code: 'short-code' }), res);
    expect(out).toBeNull();
    expect(res.statusCode).toBe(401);
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/shorter than 16/));
  });

  it('accepts the exact code and returns it', async () => {
    const { mod, admin } = await load('../api/_lib/guard.js');
    const res = makeRes();
    expect(await mod.guard(makeReq(), res)).toBe(CODE);
    expect(res.ended).toBe(false);
    expect(admin.rpc).toHaveBeenCalledTimes(1);
  });

  it('rejects a prefix, an extension, and a same-length variant of the code', async () => {
    const { mod } = await load('../api/_lib/guard.js');
    for (const bad of [CODE.slice(0, -1), `${CODE}x`, `${CODE.slice(0, -1)}X`, '']) {
      const res = makeRes();
      expect(await mod.guard(makeReq({ code: bad }), res)).toBeNull();
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: 'invalid or missing study access code' });
    }
  });

  it('accepts a second configured code and tolerates whitespace in the list', async () => {
    const other = 'another-code-abcdefghijklmnop';
    const { mod } = await load('../api/_lib/guard.js', { env: { STUDY_ACCESS_CODES: ` ${CODE} , ${other} ` } });
    expect(await mod.guard(makeReq({ code: other }), makeRes())).toBe(other);
  });

  it('reads the code from the body only when the route allows it (sendBeacon flush)', async () => {
    const { mod } = await load('../api/_lib/guard.js');
    const body = JSON.stringify({ accessCode: CODE });
    const denied = makeRes();
    expect(await mod.guard(makeReq({ code: null, body }), denied)).toBeNull();
    expect(denied.statusCode).toBe(401);
    expect(await mod.guard(makeReq({ code: null, body }), makeRes(), { allowBodyCode: true })).toBe(CODE);
  });
});

describe('meter key', () => {
  it('meters against a digest prefix, never the raw code, with the suffix in the clear', async () => {
    const { mod, admin } = await load('../api/_lib/guard.js');
    await mod.guard(makeReq(), makeRes(), { meterSuffix: ':events', meterLimit: 20000 });
    const args = admin.rpc.mock.calls[0];
    expect(args[0]).toBe('bump_study_usage');
    const expected = createHash('sha256').update(CODE).digest('hex').slice(0, 32) + ':events';
    expect(args[1]).toEqual({ p_code: expected, p_limit: 20000 });
    expect(args[1].p_code).not.toContain(CODE);
  });

  it('defaults the limit to STUDY_DAILY_REQUEST_LIMIT', async () => {
    const { mod, admin } = await load('../api/_lib/guard.js', { env: { STUDY_DAILY_REQUEST_LIMIT: '123' } });
    await mod.guard(makeReq(), makeRes());
    expect(admin.rpc.mock.calls[0][1].p_limit).toBe(123);
  });
});

describe('CORS', () => {
  it('echoes an allowlisted origin and marks the response as varying on it', async () => {
    const { mod } = await load('../api/_lib/guard.js');
    const res = makeRes();
    await mod.guard(makeReq(), res);
    expect(res.getHeader('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.getHeader('Vary')).toBe('Origin');
  });

  it('never answers a non-allowlisted origin with a CORS header, and never with *', async () => {
    const { mod } = await load('../api/_lib/guard.js');
    const res = makeRes();
    await mod.guard(makeReq({ origin: 'https://evil.example' }), res);
    expect(res.getHeader('Access-Control-Allow-Origin')).toBeUndefined();
    expect(Object.values(res.headers)).not.toContain('*');
  });

  it('answers a preflight with 204 before the method or code checks run', async () => {
    const { mod, admin } = await load('../api/_lib/guard.js');
    const res = makeRes();
    const out = await mod.guard(makeReq({ method: 'OPTIONS', code: null }), res, { methods: ['POST'] });
    expect(out).toBeNull();
    expect(res.statusCode).toBe(204);
    expect(res.getHeader('Access-Control-Allow-Headers')).toMatch(/x-study-code/);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('rejects a method the route does not list with 405 and an Allow header', async () => {
    const { mod } = await load('../api/_lib/guard.js');
    const res = makeRes();
    expect(await mod.guard(makeReq({ method: 'GET' }), res)).toBeNull();
    expect(res.statusCode).toBe(405);
    expect(res.getHeader('Allow')).toBe('POST');
  });
});

describe('daily meter', () => {
  it('fails CLOSED when the service-role key is absent: no rpc, request refused', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { mod, admin } = await load('../api/_lib/guard.js', {
      env: { SUPABASE_SERVICE_ROLE_KEY: undefined },
      admin: { adminConfigured: false },
    });
    const res = makeRes();
    expect(await mod.guard(makeReq(), res)).toBeNull();
    expect(res.statusCode).toBe(429);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('fails OPEN on a transient database error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { mod } = await load('../api/_lib/guard.js', {
      admin: { rpc: vi.fn(async () => { throw new Error('PostgREST 503'); }) },
    });
    expect(await mod.guard(makeReq(), makeRes())).toBe(CODE);
  });

  it('returns 429 once bump_study_usage reports the cap reached', async () => {
    const { mod } = await load('../api/_lib/guard.js', { admin: { rpc: vi.fn(async () => false) } });
    const res = makeRes();
    expect(await mod.guard(makeReq(), res)).toBeNull();
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: 'study request limit reached for today' });
  });

  it('skips the meter entirely when the route opts out', async () => {
    const { mod, admin } = await load('../api/_lib/guard.js', { admin: { rpc: vi.fn(async () => false) } });
    expect(await mod.guard(makeReq(), makeRes(), { meter: false })).toBe(CODE);
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});

describe('readRaw', () => {
  it('concatenates the chunks of a body under the limit', async () => {
    const { mod } = await load('../api/_lib/guard.js');
    const req = Readable.from([Buffer.from('ab'), Buffer.from('cd')]);
    expect((await mod.readRaw(req, 10)).toString()).toBe('abcd');
  });

  it('rejects, without destroying the socket, once the body exceeds the limit', async () => {
    const { mod } = await load('../api/_lib/guard.js');
    const req = Readable.from([Buffer.alloc(6), Buffer.alloc(6)]);
    const pause = vi.spyOn(req, 'pause');
    const destroy = vi.spyOn(req, 'destroy');
    await expect(mod.readRaw(req, 10)).rejects.toThrow('payload too large');
    // Paused, so the 413 the caller sends can still reach the client. The
    // stream's own end-of-input autoDestroy is fine; a teardown with an error
    // is what must not happen.
    expect(pause).toHaveBeenCalled();
    expect(destroy.mock.calls.some((c) => c[0] instanceof Error)).toBe(false);
  });
});

describe('readUserId', () => {
  it('labels with the bearer token sub and never trusts a malformed token', async () => {
    const { mod } = await load('../api/_lib/guard.js');
    const claims = Buffer.from(JSON.stringify({ sub: 'user-1' })).toString('base64url');
    expect(mod.readUserId({ headers: { authorization: `Bearer x.${claims}.y` } })).toBe('user-1');
    expect(mod.readUserId({ headers: { authorization: 'Bearer nope' } })).toBeNull();
    expect(mod.readUserId({ headers: {} })).toBeNull();
  });
});
