// The service-role PostgREST client, tested against a stubbed fetch.
//
// Every other test replaces this module (helpers.js load()). Here it is the real
// one, so these pin what actually goes over the wire: the URL, the service-role
// headers, the Prefer header each write depends on, and the error contract that
// keeps an upstream body out of the thrown message.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { stubFetch, jsonResponse } from './helpers.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const URL_BASE = 'https://example.supabase.co';
const KEY = 'service-role-test';

/** Import a fresh copy under the given env (it reads its config at load time). */
async function loadAdmin(env = {}) {
  vi.resetModules();
  vi.unstubAllEnvs();
  const all = { SUPABASE_URL: URL_BASE, SUPABASE_SERVICE_ROLE_KEY: KEY, VITE_SUPABASE_URL: undefined, ...env };
  for (const [k, v] of Object.entries(all)) vi.stubEnv(k, v ?? '');
  return import('../api/_lib/supabaseAdmin.js');
}

const call = (fetch, i = 0) => {
  const [url, init] = fetch.mock.calls[i];
  return { url, ...init, json: init.body === undefined ? undefined : JSON.parse(init.body) };
};

describe('configuration', () => {
  it('is configured with a URL and the service-role key', async () => {
    expect((await loadAdmin()).adminConfigured).toBe(true);
  });

  it('falls back to VITE_SUPABASE_URL for the project URL', async () => {
    const admin = await loadAdmin({ SUPABASE_URL: undefined, VITE_SUPABASE_URL: URL_BASE });
    expect(admin.adminConfigured).toBe(true);
    const fetch = stubFetch(jsonResponse(true));
    await admin.rpc('ping', {});
    expect(fetch.mock.calls[0][0]).toBe(`${URL_BASE}/rest/v1/rpc/ping`);
  });

  it('is not configured without the service-role key, or without any URL', async () => {
    expect((await loadAdmin({ SUPABASE_SERVICE_ROLE_KEY: undefined })).adminConfigured).toBe(false);
    expect((await loadAdmin({ SUPABASE_URL: undefined })).adminConfigured).toBe(false);
  });
});

describe('rpc', () => {
  it('POSTs the arguments to /rpc/<fn> with the service-role headers and returns the result', async () => {
    const admin = await loadAdmin();
    const fetch = stubFetch(jsonResponse(31));
    expect(await admin.rpc('claim_participant_number', {})).toBe(31);
    const c = call(fetch);
    expect(c.url).toBe(`${URL_BASE}/rest/v1/rpc/claim_participant_number`);
    expect(c.method).toBe('POST');
    expect(c.headers).toEqual({ apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' });
    expect(c.json).toEqual({});
  });

  it('returns null for an empty 200 body', async () => {
    const admin = await loadAdmin();
    stubFetch(new Response('', { status: 200 }));
    expect(await admin.rpc('void_fn', { a: 1 })).toBeNull();
  });
});

describe('selectOne', () => {
  it('GETs one row with the columns encoded and the query passed through', async () => {
    const admin = await loadAdmin();
    const row = { id: 'abc', participant_code: 'P07' };
    const fetch = stubFetch(jsonResponse([row]));
    expect(await admin.selectOne('study_sessions', 'id,participant_code', 'participant_code=eq.P07')).toEqual(row);
    const c = call(fetch);
    expect(c.url).toBe(`${URL_BASE}/rest/v1/study_sessions?select=id%2Cparticipant_code&participant_code=eq.P07&limit=1`);
    expect(c.method).toBe('GET');
    expect(c.headers.Authorization).toBe(`Bearer ${KEY}`);
  });

  it('returns null when nothing matches', async () => {
    const admin = await loadAdmin();
    stubFetch(jsonResponse([]));
    expect(await admin.selectOne('study_sessions', 'id', 'participant_code=eq.P99')).toBeNull();
  });
});

describe('insertReturning', () => {
  it('POSTs the row as a one-element array and asks for the representation back', async () => {
    const admin = await loadAdmin();
    const fetch = stubFetch(jsonResponse([{ id: 'new-id' }], 201));
    expect(await admin.insertReturning('study_sessions', { participant_code: 'P31' }, 'id')).toEqual({ id: 'new-id' });
    const c = call(fetch);
    expect(c.url).toBe(`${URL_BASE}/rest/v1/study_sessions?select=id`);
    expect(c.method).toBe('POST');
    expect(c.headers.Prefer).toBe('return=representation');
    expect(c.json).toEqual([{ participant_code: 'P31' }]);
  });

  it('returns null when no row comes back', async () => {
    const admin = await loadAdmin();
    stubFetch(jsonResponse([], 201));
    expect(await admin.insertReturning('study_sessions', {}, 'id')).toBeNull();
  });
});

describe('insertIgnoringConflicts', () => {
  it('sends nothing for an empty batch', async () => {
    const admin = await loadAdmin();
    const fetch = stubFetch(jsonResponse([]));
    expect(await admin.insertIgnoringConflicts('study_events', [], 'event_uuid')).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('ignores duplicates and reports the inserted count from Content-Range', async () => {
    const admin = await loadAdmin();
    const fetch = stubFetch(new Response('', { status: 201, headers: { 'Content-Range': '*/1' } }));
    const rows = [{ seq: 1 }, { seq: 2 }];
    // Two offered, one landed: the other was a retry of an event already stored.
    expect(await admin.insertIgnoringConflicts('study_events', rows, 'event_uuid')).toBe(1);
    const c = call(fetch);
    expect(c.url).toBe(`${URL_BASE}/rest/v1/study_events?on_conflict=event_uuid`);
    expect(c.method).toBe('POST');
    expect(c.headers.Prefer).toBe('resolution=ignore-duplicates,return=minimal,count=exact');
    expect(c.json).toEqual(rows);
  });

  it('reports 0 when the whole batch was duplicates', async () => {
    const admin = await loadAdmin();
    stubFetch(new Response('', { status: 201, headers: { 'Content-Range': '*/0' } }));
    expect(await admin.insertIgnoringConflicts('study_events', [{ seq: 1 }], 'event_uuid')).toBe(0);
  });

  it('assumes every row landed when the count is missing', async () => {
    const admin = await loadAdmin();
    stubFetch(new Response(null, { status: 204 }));
    expect(await admin.insertIgnoringConflicts('usage_events', [{ a: 1 }, { a: 2 }, { a: 3 }], 'id')).toBe(3);
  });
});

describe('updateWhere', () => {
  it('PATCHes the matching rows with return=minimal', async () => {
    const admin = await loadAdmin();
    const fetch = stubFetch(new Response(null, { status: 204, headers: { 'Content-Range': '0-0/*' } }));
    const out = await admin.updateWhere('study_sessions', { step: 'task' }, 'id=eq.abc');
    expect(out).toEqual({ rows: null, contentRange: '0-0/*' });
    const c = call(fetch);
    expect(c.url).toBe(`${URL_BASE}/rest/v1/study_sessions?id=eq.abc`);
    expect(c.method).toBe('PATCH');
    expect(c.headers.Prefer).toBe('return=minimal');
    expect(c.json).toEqual({ step: 'task' });
  });
});

describe('errors', () => {
  it('throws with the status, logging the upstream detail rather than putting it in the message', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const admin = await loadAdmin();
    const body = JSON.stringify({ message: 'duplicate key', details: 'participant_code=P07 row contents' });
    stubFetch(new Response(body, { status: 409 }));
    const thrown = await admin.insertReturning('study_sessions', {}, 'id').catch((e) => e);
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown.message).toBe('PostgREST 409');
    expect(thrown.status).toBe(409);
    expect(thrown.message).not.toContain('P07');
    expect(err).toHaveBeenCalledWith(expect.stringContaining('PostgREST 409 on study_sessions?select=id: {"message":"duplicate key"'));
  });

  it('caps the logged detail at 300 characters', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const admin = await loadAdmin();
    stubFetch(new Response('x'.repeat(1000), { status: 500 }));
    await expect(admin.rpc('f', {})).rejects.toMatchObject({ status: 500 });
    const logged = err.mock.calls[0][0];
    expect(logged.endsWith(`: ${'x'.repeat(300)}`)).toBe(true);
  });

  it('still throws the status when the error body cannot be read', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const admin = await loadAdmin();
    const broken = new ReadableStream({ start(c) { c.error(new Error('connection reset')); } });
    stubFetch(new Response(broken, { status: 503 }));
    await expect(admin.updateWhere('study_sessions', {}, 'id=eq.x')).rejects.toMatchObject({ message: 'PostgREST 503', status: 503 });
    expect(err.mock.calls[0][0]).toMatch(/PostgREST 503 on study_sessions\?id=eq\.x: $/);
  });
});
