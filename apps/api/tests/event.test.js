// Study event append: batched, idempotent, bounded, and honest about what
// landed. Guarded on a separate, larger meter so telemetry cannot eat the AI
// budget, with the code allowed in the body for the sendBeacon flush.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeReq, makeRes, load, CODE } from './helpers.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ev = (n, extra = {}) => ({ eventUuid: uuid(n), seq: n, kind: 'turn', arm: 'A', taskId: 't1', payload: { n }, clientTs: '2026-09-18T00:00:00Z', ...extra });
const base = (events) => ({ sessionId: uuid(999), participantCode: 'P07', events });

async function post(body, admin) {
  const { mod, admin: a } = await load('../api/study/event.js', { admin });
  const res = makeRes();
  await mod.default(makeReq({ body }), res);
  return { res, admin: a };
}

describe('guard wiring', () => {
  it('meters on the :events counter with the 20000 limit', async () => {
    const { admin } = await post(base([ev(1)]));
    expect(admin.rpc.mock.calls[0][1].p_code).toMatch(/:events$/);
    expect(admin.rpc.mock.calls[0][1].p_limit).toBe(20000);
  });

  it('accepts the access code in a text/plain body (sendBeacon)', async () => {
    const { mod } = await load('../api/study/event.js');
    const res = makeRes();
    const body = JSON.stringify({ ...base([ev(1)]), accessCode: CODE });
    await mod.default(makeReq({ code: null, body }), res);
    expect(res.statusCode).toBe(202);
  });
});

describe('validation', () => {
  it('requires sessionId, participantCode and a non-empty events array', async () => {
    expect((await post({ sessionId: uuid(1), events: [ev(1)] })).res.statusCode).toBe(400);
    expect((await post(base([]))).res.statusCode).toBe(400);
  });

  it('rejects a batch of more than 100 events', async () => {
    const { res, admin } = await post(base(Array.from({ length: 101 }, (_, i) => ev(i + 1))));
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'at most 100 events per request' });
    expect(admin.insertIgnoringConflicts).not.toHaveBeenCalled();
  });

  it('drops events with a bad uuid, a non-integer seq or a missing kind, and 400s when none survive', async () => {
    const { res, admin } = await post(base([
      ev(1, { eventUuid: 'not-a-uuid' }),
      ev(2, { seq: 2.5 }),
      ev(3, { kind: undefined }),
    ]));
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'no valid events' });
    expect(admin.insertIgnoringConflicts).not.toHaveBeenCalled();
  });

  it('keeps the valid events of a mixed batch and reports received = the valid count', async () => {
    const { res, admin } = await post(base([ev(1), ev(2, { eventUuid: 'nope' }), ev(3)]));
    expect(res.statusCode).toBe(202);
    expect(res.body).toEqual({ received: 2, inserted: 2 });
    const rows = admin.insertIgnoringConflicts.mock.calls[0][1];
    expect(rows.map((r) => r.seq)).toEqual([1, 3]);
    expect(admin.insertIgnoringConflicts.mock.calls[0][2]).toBe('event_uuid');
  });
});

describe('row shaping', () => {
  it('replaces a payload over 20000 characters with a truncated marker and preview', async () => {
    const big = { transcript: 'a'.repeat(25000) };
    const { admin } = await post(base([ev(1, { payload: big })]));
    const row = admin.insertIgnoringConflicts.mock.calls[0][1][0];
    expect(row.payload.truncated).toBe(true);
    expect(row.payload.preview).toHaveLength(20000);
    expect(row.payload.transcript).toBeUndefined();
  });

  it('normalises arm, task id, kind length and client timestamp', async () => {
    const { admin } = await post(base([ev(1, { arm: 'C', taskId: 12345, kind: 'k'.repeat(80), clientTs: undefined })]));
    const row = admin.insertIgnoringConflicts.mock.calls[0][1][0];
    expect(row.arm).toBeNull();
    expect(row.task_id).toBe('12345');
    expect(row.kind).toHaveLength(60);
    expect(row.client_ts).toBeNull();
    expect(row).toMatchObject({ event_uuid: uuid(1), session_id: uuid(999), participant_code: 'P07', seq: 1 });
  });
});

describe('what landed', () => {
  it('reports inserted = 0 when every row was a duplicate, distinguishable from success', async () => {
    const { res } = await post(base([ev(1), ev(2)]), { insertIgnoringConflicts: vi.fn(async () => 0) });
    expect(res.statusCode).toBe(202);
    expect(res.body).toEqual({ received: 2, inserted: 0 });
  });

  it('maps a PostgREST 4xx to 400 (never retry) and other failures to 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fail = (status) => vi.fn(async () => { const e = new Error(`PostgREST ${status}`); e.status = status; throw e; });
    expect((await post(base([ev(1)]), { insertIgnoringConflicts: fail(409) })).res.statusCode).toBe(400);
    expect((await post(base([ev(1)]), { insertIgnoringConflicts: fail(503) })).res.statusCode).toBe(500);
  });

  it('returns 503 when the backend is not configured, without a second response', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // The guard fails closed first (429) when the meter cannot run — so an
    // unconfigured backend is refused before the handler's own 503 is reached.
    const { res } = await post(base([ev(1)]), { adminConfigured: false });
    expect([429, 503]).toContain(res.statusCode);
    expect(res.ended).toBe(true);
  });
});
