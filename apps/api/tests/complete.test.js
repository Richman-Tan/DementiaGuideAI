// Closing a session: completed normally, or stopped early through the "I need
// to stop" control (docs/study/ethics/risk-and-distress-protocol.md §2). An
// early stop has to be recorded as one, or a withdrawal reads as a completion.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeReq, makeRes, load } from './helpers.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const SESSION_ID = '11111111-2222-4333-8444-555555555555';

async function post(body, { admin, code } = {}) {
  const { mod, admin: a } = await load('../api/study/complete.js', { admin });
  const res = makeRes();
  await mod.default(makeReq({ body, ...(code !== undefined ? { code } : {}) }), res);
  return { res, admin: a };
}

describe('study/complete', () => {
  it('stamps completed_at and stopped_early=false on a normal finish', async () => {
    const before = Date.now();
    const { res, admin } = await post({ sessionId: SESSION_ID });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const [table, patch, query] = admin.updateWhere.mock.calls[0];
    expect(table).toBe('study_sessions');
    expect(query).toBe(`id=eq.${SESSION_ID}`);
    expect(patch.stopped_early).toBe(false);
    const at = Date.parse(patch.completed_at);
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
  });

  it('records an early stop as one', async () => {
    const { admin } = await post({ sessionId: SESSION_ID, stoppedEarly: true });
    expect(admin.updateWhere.mock.calls[0][1].stopped_early).toBe(true);
  });

  it('encodes the session id into the filter so it cannot widen the update', async () => {
    const { admin } = await post({ sessionId: 'x&id=neq.0' });
    expect(admin.updateWhere.mock.calls[0][2]).toBe('id=eq.x%26id%3Dneq.0');
  });

  it('requires a session id', async () => {
    for (const body of [{}, { stoppedEarly: true }, undefined]) {
      const { res, admin } = await post(body);
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: 'sessionId required' });
      expect(admin.updateWhere).not.toHaveBeenCalled();
    }
  });

  it('is behind the access-code guard, unmetered', async () => {
    const denied = await post({ sessionId: SESSION_ID }, { code: null });
    expect(denied.res.statusCode).toBe(401);
    expect(denied.admin.updateWhere).not.toHaveBeenCalled();
    const ok = await post({ sessionId: SESSION_ID });
    expect(ok.admin.rpc).not.toHaveBeenCalled();
  });

  it('returns 503, once, when the backend is not configured', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { res, admin } = await post({ sessionId: SESSION_ID }, { admin: { adminConfigured: false } });
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'study backend not configured' });
    expect(admin.updateWhere).not.toHaveBeenCalled();
  });

  it('returns 500 when the update fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { res } = await post({ sessionId: SESSION_ID }, { admin: { updateWhere: vi.fn(async () => { throw new Error('PostgREST 503'); }) } });
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'could not close session' });
    expect(err).toHaveBeenCalledWith('[study] session complete failed: PostgREST 503');
  });
});
