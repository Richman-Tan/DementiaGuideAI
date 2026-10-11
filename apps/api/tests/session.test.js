// Session create/resume across the two protocols. The feedback round is off
// unless STUDY_PROTOCOLS enables it, and until then the endpoint must behave
// exactly as it did before the round existed — the protocol column may not
// even be in the database yet.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeReq, makeRes, load } from './helpers.js';
import {
  CONSENT_FORM_VERSION, FEEDBACK_NOTICE_VERSION, assignmentFor,
} from '../../../packages/core/study/studyConfig.mjs';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const SESSION_ID = '11111111-2222-4333-8444-555555555555';

async function post(body, { env = {}, admin = {} } = {}) {
  const { mod, admin: a } = await load('../api/study/session.js', {
    env,
    admin: {
      // claim_participant_number hands out 31; nothing else calls rpc here.
      rpc: vi.fn(async (name) => (name === 'claim_participant_number' ? 31 : true)),
      insertReturning: vi.fn(async () => ({ id: SESSION_ID })),
      ...admin,
    },
  });
  const res = makeRes();
  await mod.default(makeReq({ body }), res);
  return { res, admin: a };
}

describe('the tasks protocol, with the feedback round off (the default)', () => {
  it('creates a session exactly as before: no protocol column read or written', async () => {
    const { res, admin } = await post({ group: 'caregiver', consent: { a: true } });
    expect(res.statusCode).toBe(201);
    const [, row] = admin.insertReturning.mock.calls[0];
    expect(row).not.toHaveProperty('protocol');
    expect(row.consent.formVersion).toBe(CONSENT_FORM_VERSION);
    const { armOrder, setOrder } = assignmentFor(31);
    expect(row).toMatchObject({ participant_code: 'P31', arm_order: armOrder, set_order: setOrder });
    expect(res.body.protocol).toBe('tasks');
  });

  it('resumes without selecting the protocol column', async () => {
    const existing = { id: SESSION_ID, participant_code: 'P07', participant_number: 7, participant_group: 'caregiver', arm_order: 'AB', set_order: '21', step: 'task', stage_index: 1, task_index: 0, study_version: '1.1' };
    const { res, admin } = await post({ participantCode: 'P07', group: 'caregiver' }, { admin: { selectOne: vi.fn(async () => existing) } });
    expect(res.statusCode).toBe(200);
    expect(admin.selectOne.mock.calls[0][1]).not.toMatch(/protocol/);
    expect(res.body).toMatchObject({ resumed: true, protocol: 'tasks', armOrder: 'AB' });
  });

  it('refuses the feedback round with 403 "not available" — never a fall-back to tasks', async () => {
    const { res, admin } = await post({ protocol: 'feedback', group: 'caregiver' });
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'not available' });
    expect(admin.insertReturning).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalledWith('claim_participant_number', expect.anything());
  });

  it('rejects an unknown protocol', async () => {
    const { res } = await post({ protocol: 'explore', group: 'caregiver' });
    expect(res.statusCode).toBe(400);
  });
});

describe('with STUDY_PROTOCOLS=tasks,feedback', () => {
  const env = { STUDY_PROTOCOLS: 'tasks,feedback' };

  it('creates a feedback session with no arm or set order and the privacy-notice version', async () => {
    const { res, admin } = await post({ protocol: 'feedback', group: 'caregiver', consent: { privacyNoticeRead: true } }, { env });
    expect(res.statusCode).toBe(201);
    const [, row] = admin.insertReturning.mock.calls[0];
    expect(row).toMatchObject({ protocol: 'feedback', arm_order: null, set_order: null, participant_code: 'P31' });
    expect(row.consent).toEqual({ privacyNoticeRead: true, formVersion: FEEDBACK_NOTICE_VERSION });
    expect(res.body).toMatchObject({ protocol: 'feedback', armOrder: null, setOrder: null, resumed: false });
  });

  it('stamps tasks sessions with their protocol once the column exists', async () => {
    const { admin } = await post({ group: 'worker' }, { env });
    expect(admin.insertReturning.mock.calls[0][1].protocol).toBe('tasks');
  });

  it('keeps people living with dementia out of the feedback round', async () => {
    const { res, admin } = await post({ protocol: 'feedback', group: 'plwd' }, { env });
    expect(res.statusCode).toBe(400);
    expect(admin.insertReturning).not.toHaveBeenCalled();
  });

  it('will not resume one protocol\'s session from the other\'s link', async () => {
    const tasksRow = { id: SESSION_ID, participant_code: 'P07', participant_number: 7, participant_group: 'caregiver', arm_order: 'AB', set_order: '12', protocol: 'tasks' };
    const { res, admin } = await post({ protocol: 'feedback', participantCode: 'P07', group: 'caregiver' }, { env, admin: { selectOne: vi.fn(async () => tasksRow) } });
    expect(res.statusCode).toBe(409);
    expect(admin.selectOne.mock.calls[0][1]).toMatch(/,protocol$/);
  });

  it('resumes a feedback session as one', async () => {
    const row = { id: SESSION_ID, participant_code: 'P31', participant_number: 31, participant_group: 'caregiver', arm_order: null, set_order: null, step: 'explore', stage_index: 0, task_index: 0, protocol: 'feedback' };
    const { res } = await post({ protocol: 'feedback', participantCode: 'P31', group: 'caregiver' }, { env, admin: { selectOne: vi.fn(async () => row) } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ resumed: true, protocol: 'feedback', step: 'explore' });
  });
});

describe('progress', () => {
  it('accepts the feedback round\'s steps', async () => {
    const { mod, admin } = await load('../api/study/progress.js');
    for (const step of ['privacy', 'explore', 'feedback', 'feedbacksus']) {
      const res = makeRes();
      await mod.default(makeReq({ body: { sessionId: SESSION_ID, step } }), res);
      expect(res.statusCode).toBe(204);
    }
    expect(admin.updateWhere).toHaveBeenCalledTimes(4);
  });
});

describe('guard and configuration', () => {
  it('refuses a request without the access code, before any database call', async () => {
    const { mod, admin } = await load('../api/study/session.js');
    const res = makeRes();
    await mod.default(makeReq({ code: null, body: { group: 'caregiver' } }), res);
    expect(res.statusCode).toBe(401);
    expect(admin.selectOne).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('returns 503 when the backend is not configured', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { res, admin } = await post({ group: 'caregiver' }, { admin: { adminConfigured: false } });
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'study backend not configured' });
    expect(admin.insertReturning).not.toHaveBeenCalled();
  });
});

describe('input validation', () => {
  it('rejects a supplied participant code that is not of the P07 form', async () => {
    const { res, admin } = await post({ participantCode: 'seven', group: 'caregiver' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'participant code should look like P07' });
    expect(admin.selectOne).not.toHaveBeenCalled();
  });

  it('treats a blank participant code as none supplied, and allocates one', async () => {
    const { res, admin } = await post({ participantCode: '   ', group: 'caregiver' });
    expect(res.statusCode).toBe(201);
    expect(admin.selectOne).not.toHaveBeenCalled();
    expect(res.body.participantCode).toBe('P31');
  });

  it('rejects an unknown participant group', async () => {
    const { res, admin } = await post({ group: 'researcher' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'unknown participant group' });
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});

describe('a returning code with no row behind it', () => {
  it('re-creates the session under the number it was given, not a newly allocated one', async () => {
    // The code is hand-copied, so it arrives in a variant form and is normalised.
    const { res, admin } = await post({ participantCode: 'p-7', group: 'worker' });
    expect(res.statusCode).toBe(201);
    expect(admin.rpc).not.toHaveBeenCalledWith('claim_participant_number', expect.anything());
    const { armOrder, setOrder } = assignmentFor(7);
    const [, row] = admin.insertReturning.mock.calls[0];
    expect(row).toMatchObject({ participant_code: 'P07', participant_number: 7, arm_order: armOrder, set_order: setOrder });
    expect(res.body).toMatchObject({ participantCode: 'P07', participantNumber: 7, armOrder, setOrder, resumed: false });
  });
});

describe('the row written for a new session', () => {
  it('labels it with the caller and bounds the client-reported fields', async () => {
    const claims = Buffer.from(JSON.stringify({ sub: 'user-42' })).toString('base64url');
    const { mod, admin } = await load('../api/study/session.js', {
      admin: {
        rpc: vi.fn(async () => 31),
        insertReturning: vi.fn(async () => ({ id: SESSION_ID })),
      },
    });
    const res = makeRes();
    await mod.default(makeReq({
      headers: { authorization: `Bearer h.${claims}.s` },
      body: {
        group: 'pilot', consentTranscripts: 'yes', supporterPresent: true,
        userAgent: 'u'.repeat(500), browser: 'b'.repeat(80), renderer: 'r'.repeat(80),
      },
    }), res);
    expect(res.statusCode).toBe(201);
    const [table, row, columns] = admin.insertReturning.mock.calls[0];
    expect(table).toBe('study_sessions');
    expect(columns).toBe('id');
    expect(row).toMatchObject({
      user_id: 'user-42', is_pilot: true, consent_transcripts: true, supporter_present: true,
      study_version: '1.1',
    });
    expect(row.user_agent).toHaveLength(400);
    expect(row.browser).toHaveLength(60);
    expect(row.renderer).toHaveLength(60);
  });

  it('stores supporter_present as null unless it is a real boolean', async () => {
    const { admin } = await post({ group: 'caregiver', supporterPresent: 'no' });
    expect(admin.insertReturning.mock.calls[0][1]).toMatchObject({ supporter_present: null, user_id: null, is_pilot: false });
  });
});

describe('database failures never leave a half-made session', () => {
  it('returns 500 when the resume lookup fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { res, admin } = await post({ participantCode: 'P07', group: 'caregiver' }, {
      admin: { selectOne: vi.fn(async () => { throw new Error('PostgREST 500'); }) },
    });
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'could not start session' });
    expect(admin.insertReturning).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledWith('[study] session lookup failed: PostgREST 500');
  });

  it('returns 500 when the participant number cannot be allocated', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { res, admin } = await post({ group: 'caregiver' }, {
      admin: { rpc: vi.fn(async () => { throw new Error('PostgREST 404'); }) },
    });
    expect(res.statusCode).toBe(500);
    expect(admin.insertReturning).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledWith('[study] participant number allocation failed: PostgREST 404');
  });

  it('returns 500 when the allocator hands back something that is not a positive integer', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const bad of [null, 0, -3, 2.5, '31']) {
      const { res, admin } = await post({ group: 'caregiver' }, { admin: { rpc: vi.fn(async () => bad) } });
      expect(res.statusCode, `allocator returned ${JSON.stringify(bad)}`).toBe(500);
      expect(admin.insertReturning).not.toHaveBeenCalled();
    }
    expect(err).toHaveBeenCalledWith('[study] participant number allocation returned null');
  });

  it('returns 500 when the insert fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { res } = await post({ group: 'caregiver' }, {
      admin: { insertReturning: vi.fn(async () => { throw new Error('PostgREST 409'); }) },
    });
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'could not start session' });
    expect(err).toHaveBeenCalledWith('[study] session insert failed: PostgREST 409');
  });
});
