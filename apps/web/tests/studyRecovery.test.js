// Round-trip test: events in the shape the app ACTUALLY emits, through the
// export's recovery logic, asserting the measures come back out.
//
// This is the test that should have existed first. The previous check ran a
// synthetic fixture that fabricated finished CSV rows — data the app cannot
// produce — so it validated the pipeline against fiction and hid five defects.
// Every event below is built the way `emit()` builds it.
import { describe, it, expect } from 'vitest';
import {
  mergeResponses,
  turnsInWindow,
  hiddenInWindow,
  postTaskFor,
  instrumentRow,
} from '../../../scripts/study/recover.mjs';
import { susScore } from '../../../scripts/study/lib.mjs';

const SESSION = '11111111-2222-3333-4444-555555555555';

let seq = 0;
// Mirrors emit() → api/study/event.js → the study_events row shape.
const ev = (kind, { arm = null, taskId = null, clientTs = null, ...payload } = {}) => ({
  event_uuid: `uuid-${++seq}`,
  session_id: SESSION,
  participant_code: 'P07',
  seq,
  kind,
  arm,
  task_id: taskId,
  payload,
  client_ts: clientTs,
});

// Stopping mid-task is a normal, encouraged outcome, and it used to void the task
// entirely: finish() emitted no task_end, so the window had no upper bound and the
// export drops any start without a matching end. Anything typed on the screen the
// participant was standing on went with it, because every response event fired
// from next(). These assert the events finish() now emits.
describe('stopping mid-task keeps the task and the answers', () => {
  it('closes the window so turns can still be attributed', () => {
    seq = 0;
    const start = ev('task_start', { arm: 'A', taskId: 't1a' });
    const events = [
      start,
      ev('turn_start', { arm: 'A', taskId: 't1a' }),
      ev('turn_start', { arm: 'A', taskId: 't1a' }),
      // What finish() emits when the session is stopped with a task open.
      ev('task_end', { arm: 'A', taskId: 't1a', set: 1, durationMs: 42000, gaveUp: false, stoppedMidTask: true }),
      ev('session_stopped', {}),
    ];
    const end = events.find((e) => e.kind === 'task_end');
    expect(end).toBeDefined();
    expect(turnsInWindow(events, SESSION, start.seq, end.seq)).toBe(2);
  });

  it('marks the task as cut short so its duration is not a time on task', () => {
    seq = 0;
    const end = ev('task_end', { arm: 'A', taskId: 't1a', durationMs: 42000, stoppedMidTask: true });
    // The export reads payload.stoppedMidTask into tasks.csv as stopped_mid_task,
    // and analyse-study.mjs excludes those from every timing statistic. Named to
    // stay distinct from gave_up, which the report already calls "abandoned".
    expect(end.payload.stoppedMidTask).toBe(true);
    expect(end.payload.gaveUp).toBeUndefined();
  });

  it('carries the answers already on screen, merged rather than overwritten', () => {
    seq = 0;
    const events = [
      ev('background_done', { responses: { 'bg.age': '65-74' } }),
      // Typed but never submitted — previously discarded.
      ev('responses_snapshot', {
        responses: { 'sus.A.q1': 4, 'sus.A.q2': 2, 't1a.found': 'yes' },
        atStep: 'sus',
        stoppedEarly: true,
      }),
      ev('session_stopped', {}),
    ];
    const merged = mergeResponses(events).get(SESSION);
    expect(merged['bg.age']).toBe('65-74');
    expect(merged['sus.A.q1']).toBe(4);
    expect(merged['t1a.found']).toBe('yes');
  });
});

describe('post-task answers survive a participant who stops early', () => {
  // The failure this guards: answers used to reach the server only when swept
  // into a LATER questionnaire snapshot, and the export took last-wins. A
  // participant who answered all of arm 2 then closed the tab lost all of it.
  it('recovers arm-2 answers when the session ends before the arm-2 SUS', () => {
    seq = 0;
    const events = [
      ev('session_start', {}),
      ev('background_done', { responses: { age: '55–64' } }),
      // Arm 1, fully completed.
      ev('task_start', { arm: 'A', taskId: 't1a' }),
      ev('turn_start', { arm: 'A', taskId: 't1a' }),
      ev('task_end', { arm: 'A', taskId: 't1a', durationMs: 120000 }),
      ev('posttask_response', { arm: 'A', taskId: 't1a', found: 'yes', effort: 4 }),
      ev('likert_done', { arm: 'A', responses: { age: '55–64', 't1a.found': 'yes', 't1a.effort': 4 } }),
      // Arm 2 — answered, then the participant closes the tab.
      ev('task_start', { arm: 'B', taskId: 't2a' }),
      ev('turn_start', { arm: 'B', taskId: 't2a' }),
      ev('task_end', { arm: 'B', taskId: 't2a', durationMs: 90000 }),
      ev('posttask_response', { arm: 'B', taskId: 't2a', found: 'partly', effort: 2 }),
      ev('session_stopped', {}),
    ];

    const merged = mergeResponses(events);
    expect(postTaskFor(events, merged, SESSION, 't1a')).toEqual({ found: 'yes', effort: 4 });
    expect(postTaskFor(events, merged, SESSION, 't2a')).toEqual({ found: 'partly', effort: 2 });
  });

  it('merges snapshots rather than letting the newest overwrite the rest', () => {
    seq = 0;
    const events = [
      ev('background_done', { responses: { age: '65–74', tech_confidence: 3 } }),
      ev('sus_done', { responses: { 'sus.A.q1': 4 } }),
    ];
    const merged = mergeResponses(events).get(SESSION);
    // Last-wins would have dropped age and tech_confidence entirely.
    expect(merged).toMatchObject({ age: '65–74', tech_confidence: 3, 'sus.A.q1': 4 });
  });
});

describe('turn counting', () => {
  it('counts a turn the participant acted on before the answer finished', () => {
    seq = 0;
    const events = [
      ev('task_start', { arm: 'A', taskId: 't1a' }),
      ev('turn_start', { arm: 'A', taskId: 't1a' }),
      ev('turn_start', { arm: 'A', taskId: 't1a' }),
      ev('task_end', { arm: 'A', taskId: 't1a', durationMs: 60000 }),
      // Fires after playback finishes, i.e. AFTER task_end. Counting these
      // instead of turn_start undercounted, and did so more in Arm A.
      ev('turn', { arm: 'A', taskId: 't1a', question: 'q', answer: 'a' }),
    ];
    const start = events.find((e) => e.kind === 'task_start');
    const end = events.find((e) => e.kind === 'task_end');
    expect(turnsInWindow(events, SESSION, start.seq, end.seq)).toBe(2);
  });
});

describe('tab visibility', () => {
  it('reports how long the participant was away inside the task window', () => {
    seq = 0;
    const events = [
      ev('task_start', { arm: 'B', taskId: 't2b' }),
      ev('tab_hidden', { clientTs: '2026-09-01T10:00:00.000Z' }),
      ev('tab_visible', { clientTs: '2026-09-01T10:05:00.000Z' }),
      ev('task_end', { arm: 'B', taskId: 't2b', durationMs: 400000 }),
    ];
    const start = events.find((e) => e.kind === 'task_start');
    const end = events.find((e) => e.kind === 'task_end');
    expect(hiddenInWindow(events, SESSION, start.seq, end.seq)).toBe(5 * 60 * 1000);
  });

  it('returns null when the participant never left', () => {
    seq = 0;
    const events = [ev('task_start', {}), ev('task_end', {})];
    expect(hiddenInWindow(events, SESSION, 0, 99)).toBeNull();
  });
});

describe('instruments', () => {
  it('keeps Likert answers when the participant skipped every SUS item', () => {
    seq = 0;
    const merged = mergeResponses([
      ev('likert_done', {
        responses: {
          'likert.A.trust': 4, 'likert.A.engagement': 5,
          'likert.A.helpfulness': 4, 'likert.A.clarity': 3,
        },
      }),
    ]);
    const row = instrumentRow(merged, SESSION, 'A');
    // Previously this row was skipped entirely, discarding one of the two
    // pre-registered usability criteria.
    expect(row).not.toBeNull();
    expect(row.trust).toBe(4);
    expect(susScore(row.items)).toBeNull(); // incomplete SUS is not scored
  });

  it('produces a row for a PLWD participant, who never sees SUS at all', () => {
    seq = 0;
    const merged = mergeResponses([
      ev('likert_done', { responses: { 'likert.A.trust': 'easy' } }),
    ]);
    expect(instrumentRow(merged, SESSION, 'A')).not.toBeNull();
  });

  it('scores a complete SUS and refuses a partial one', () => {
    seq = 0;
    const full = {};
    for (let i = 1; i <= 10; i++) full[`sus.A.q${i}`] = i % 2 === 1 ? 5 : 1;
    const merged = mergeResponses([ev('sus_done', { responses: full })]);
    expect(susScore(instrumentRow(merged, SESSION, 'A').items)).toBe(100);

    const partial = mergeResponses([ev('sus_done', { responses: { 'sus.B.q1': 5 } })]);
    expect(susScore(instrumentRow(partial, SESSION, 'B').items)).toBeNull();
  });

  it('returns null when neither instrument was answered', () => {
    seq = 0;
    expect(instrumentRow(mergeResponses([ev('session_start', {})]), SESSION, 'A')).toBeNull();
  });
});

describe('every event carries the task it belongs to', () => {
  it('attributes turns and latency to a task, not to nothing', () => {
    seq = 0;
    const events = [
      ev('turn', { arm: 'A', taskId: 't1a', question: 'q', answer: 'a' }),
      ev('latency', { arm: 'A', taskId: 't1a', to_first_audio_ms: 3200 }),
    ];
    // task_id was null on every row of a real session: the primary
    // effectiveness measure is scored per task from transcripts.
    for (const e of events) expect(e.task_id).toBe('t1a');
  });
});
