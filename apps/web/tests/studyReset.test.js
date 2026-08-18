// Handing the device to the next participant.
//
// A shared device is the expected setup for the PLwD sessions, so clearing one
// participant's session has to be possible. It also has to be safe: resetQueue()
// discards the outbound queue, and for a session that ran on bad wifi that queue
// is the entire record. StudyContext refuses to clear while pendingCount() is
// non-zero, so these tests pin the number that decision is made on.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveStudy, loadStudy, clearStudy } from '../src/study/studyStore.js';
import { emit, flush, pendingCount, resetQueue } from '../src/study/events.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

const session = () =>
  saveStudy({
    sessionId: '11111111-2222-3333-4444-555555555555',
    accessCode: 'test-access-code',
    participantCode: 'P07',
    step: 'task',
    taskId: 't1b',
  });

beforeEach(() => {
  globalThis.localStorage = memoryStorage();
  // Offline: nothing drains the queue, which is the situation the guard is for.
  globalThis.fetch = vi.fn(() => Promise.reject(new Error('offline')));
});

describe('pendingCount', () => {
  it('is zero on a device with no queued events', () => {
    session();
    expect(pendingCount()).toBe(0);
  });

  it('counts what has not reached the server', () => {
    session();
    emit('task_start', { arm: 'B', taskId: 't1b' });
    emit('turn', { arm: 'B', taskId: 't1b' });
    emit('task_end', { arm: 'B', taskId: 't1b' });
    expect(pendingCount()).toBe(3);
  });

  it('stays zero outside a session — emit() is a no-op there', () => {
    emit('turn', { arm: 'B' });
    expect(pendingCount()).toBe(0);
  });
});

describe('resetQueue', () => {
  it('discards unsent events — which is why the caller must check first', () => {
    session();
    emit('task_start', { arm: 'B', taskId: 't1b' });
    expect(pendingCount()).toBe(1);
    resetQueue();
    expect(pendingCount()).toBe(0);
  });
});

// A batch is inserted in one statement, so a single event Postgres refuses — a
// stray NUL in a transcript, a malformed client_ts — used to fail the whole
// request, and the client discarded all of it. Up to 100 events, gone, on one
// console.warn nobody reads during an unmoderated session.
describe('a rejected batch is isolated, not discarded', () => {
  /** Sizes of each batch the client offered, in order. */
  const sizes = [];
  const rejectAll = () => vi.fn(async (_url, opts) => {
    sizes.push(JSON.parse(opts.body).events.length);
    return { ok: false, status: 400, json: async () => ({}) };
  });

  beforeEach(async () => {
    sizes.length = 0;
    session();
    // Drain any batch-size state left by an earlier test with one clean flush.
    emit('tab_hidden', {});
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 202, json: async () => ({ received: 1, inserted: 1 }) }));
    await flush();
  });

  it('keeps every event when the server rejects the batch', async () => {
    for (let i = 0; i < 8; i++) emit('turn_start', { arm: 'A', taskId: 't1a' });
    globalThis.fetch = rejectAll();
    await flush();
    // Previously this was 0: the whole batch was removed.
    expect(pendingCount()).toBe(8);
  });

  it('narrows the batch on each rejection so the offender can be found', async () => {
    for (let i = 0; i < 8; i++) emit('turn_start', { arm: 'A', taskId: 't1a' });
    globalThis.fetch = rejectAll();
    await flush();
    await flush();
    await flush();
    expect(sizes.length).toBeGreaterThanOrEqual(3);
    expect(sizes[1]).toBeLessThan(sizes[0]);
    expect(sizes[2]).toBeLessThan(sizes[1]);
  });

  it('drops exactly one event once it is provably the bad one', async () => {
    emit('turn_start', { arm: 'A', taskId: 't1a' });
    globalThis.fetch = rejectAll();
    // One event in the queue, so the first batch is already a single event and
    // there is nothing left to bisect.
    await flush();
    expect(pendingCount()).toBe(0);
  });
});

describe('clearing the session', () => {
  it('leaves nothing of the previous participant for the next one to inherit', () => {
    session();
    saveStudy({ responses: { 'sus.A.q1': 4, 't1b.found': 'yes' }, stageIndex: 1, taskIndex: 2 });
    clearStudy();

    const next = loadStudy();
    expect(next.responses).toEqual({});
    expect(next.participantCode).toBe('');
    expect(next.sessionId).toBe('');
    expect(next.stageIndex).toBe(0);
    expect(next.taskIndex).toBe(0);
    expect(next.consentTranscripts).toBe(false);
  });
});
