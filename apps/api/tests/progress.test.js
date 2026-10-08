// Server-side resume point. Validates before anything else, so a malformed
// request is a 400 the client will not retry rather than a 500 it retries
// forever, and never blocks the participant on a database failure.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeReq, makeRes, load } from './helpers.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const SESSION_ID = '11111111-2222-4333-8444-555555555555';

async function post(body, { admin, code } = {}) {
  const { mod, admin: a } = await load('../api/study/progress.js', { admin });
  const res = makeRes();
  await mod.default(makeReq({ body, ...(code !== undefined ? { code } : {}) }), res);
  return { res, admin: a };
}

describe('study/progress', () => {
  it('records the step and indices and answers 204', async () => {
    const { res, admin } = await post({ sessionId: SESSION_ID, step: 'task', stageIndex: 1, taskIndex: 2 });
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    expect(admin.updateWhere).toHaveBeenCalledWith(
      'study_sessions', { step: 'task', stage_index: 1, task_index: 2 }, `id=eq.${SESSION_ID}`,
    );
  });

  it('stores 0 for an index that is missing or not an integer', async () => {
    const { admin } = await post({ sessionId: SESSION_ID, step: 'sus', stageIndex: '1', taskIndex: 1.5 });
    expect(admin.updateWhere.mock.calls[0][1]).toEqual({ step: 'sus', stage_index: 0, task_index: 0 });
  });

  it('rejects a session id that is not a uuid, before touching the database', async () => {
    for (const sessionId of ['P07', '', undefined, `${SESSION_ID}x`]) {
      const { res, admin } = await post({ sessionId, step: 'task' });
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: 'valid sessionId required' });
      expect(admin.updateWhere).not.toHaveBeenCalled();
    }
    expect((await post(undefined)).res.statusCode).toBe(400);
  });

  it('rejects a step the study does not have', async () => {
    const { res, admin } = await post({ sessionId: SESSION_ID, step: 'admin' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'unknown step' });
    expect(admin.updateWhere).not.toHaveBeenCalled();
  });

  it('validates even when the backend is unconfigured, then 503s a valid request', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = await post({ sessionId: 'nope', step: 'task' }, { admin: { adminConfigured: false } });
    expect(bad.res.statusCode).toBe(400);
    const good = await post({ sessionId: SESSION_ID, step: 'task' }, { admin: { adminConfigured: false } });
    expect(good.res.statusCode).toBe(503);
    expect(good.res.body).toEqual({ error: 'study backend not configured' });
    expect(good.admin.updateWhere).not.toHaveBeenCalled();
  });

  it('is behind the access-code guard, unmetered', async () => {
    const denied = await post({ sessionId: SESSION_ID, step: 'task' }, { code: 'wrong-code-0123456789' });
    expect(denied.res.statusCode).toBe(401);
    expect(denied.admin.updateWhere).not.toHaveBeenCalled();
    expect(denied.admin.rpc).not.toHaveBeenCalled();
  });

  it('returns 500 when the update fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { res } = await post({ sessionId: SESSION_ID, step: 'done' }, { admin: { updateWhere: vi.fn(async () => { throw new Error('PostgREST 500'); }) } });
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'could not record progress' });
    expect(err).toHaveBeenCalledWith('[study] progress update failed: PostgREST 500');
  });
});
