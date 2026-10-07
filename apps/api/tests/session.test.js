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
