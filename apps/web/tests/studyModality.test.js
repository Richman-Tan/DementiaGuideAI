// Typed turns inside the avatar arm.
//
// The avatar screen keeps its message bar during Arm A on purpose: a participant
// who finds speaking hard has to have a way through, and taking it away would
// suppress an accessibility finding rather than record one. But a typed turn in
// Arm A never touches speech recognition, synthesis or lip sync — it is a turn
// through the Arm B pipeline wearing an Arm A label. Before `modality` existed
// there was nothing in the data that could tell the two apart afterwards, which
// meant the headline arm comparison could be diluted by an unknown amount with
// no trace of it anywhere.
//
// Every event below is built the way emit() builds it.
import { describe, it, expect } from 'vitest';
import {
  turnsInWindow,
  typedTurnsInWindow,
  offModalityTurns,
} from '../../../scripts/study/recover.mjs';
import { MODALITY_SPOKEN, MODALITY_TYPED } from '@core/study/studyConfig.mjs';

const SESSION = '11111111-2222-3333-4444-555555555555';

let seq = 0;
const ev = (kind, { arm = null, taskId = null, ...payload } = {}) => ({
  event_uuid: `uuid-${++seq}`,
  session_id: SESSION,
  participant_code: 'P07',
  seq,
  kind,
  arm,
  task_id: taskId,
  payload,
  client_ts: null,
});

/** An Arm A task where the participant spoke twice and typed once. */
function mixedArmA() {
  seq = 0;
  const events = [
    ev('task_start', { arm: 'A', taskId: 't1a' }),
    ev('turn_start', { arm: 'A', taskId: 't1a', modality: MODALITY_SPOKEN }),
    ev('turn_start', { arm: 'A', taskId: 't1a', modality: MODALITY_TYPED }),
    ev('turn_start', { arm: 'A', taskId: 't1a', modality: MODALITY_SPOKEN }),
    ev('task_end', { arm: 'A', taskId: 't1a', durationMs: 90000 }),
  ];
  const start = events.find((e) => e.kind === 'task_start');
  const end = events.find((e) => e.kind === 'task_end');
  return { events, from: start.seq, to: end.seq };
}

describe('counting typed turns inside a task window', () => {
  it('still counts every turn, however it was asked', () => {
    const { events, from, to } = mixedArmA();
    // The efficiency measure is turns, full stop — a typed turn is a real turn
    // and must not vanish from the count just because it is flagged.
    expect(turnsInWindow(events, SESSION, from, to)).toBe(3);
  });

  it('separates the ones that never entered the speech pipeline', () => {
    const { events, from, to } = mixedArmA();
    expect(typedTurnsInWindow(events, SESSION, from, to)).toBe(1);
  });

  it('flags them as off-modality for Arm A', () => {
    const { events, from, to } = mixedArmA();
    expect(offModalityTurns(events, SESSION, from, to, 'A')).toBe(1);
  });

  it('finds nothing off-modality in a fully spoken Arm A task', () => {
    seq = 0;
    const events = [
      ev('task_start', { arm: 'A', taskId: 't1a' }),
      ev('turn_start', { arm: 'A', taskId: 't1a', modality: MODALITY_SPOKEN }),
      ev('turn_start', { arm: 'A', taskId: 't1a', modality: MODALITY_SPOKEN }),
      ev('task_end', { arm: 'A', taskId: 't1a' }),
    ];
    expect(offModalityTurns(events, SESSION, 0, 99, 'A')).toBe(0);
    expect(typedTurnsInWindow(events, SESSION, 0, 99)).toBe(0);
  });

  it('does not flag Arm B, where typing is the condition', () => {
    seq = 0;
    const events = [
      ev('task_start', { arm: 'B', taskId: 't2a' }),
      ev('turn_start', { arm: 'B', taskId: 't2a', modality: MODALITY_TYPED }),
      ev('turn_start', { arm: 'B', taskId: 't2a', modality: MODALITY_TYPED }),
      ev('task_end', { arm: 'B', taskId: 't2a' }),
    ];
    // Every Arm B turn is typed by definition — that is the baseline, not a
    // deviation from it.
    expect(offModalityTurns(events, SESSION, 0, 99, 'B')).toBe(0);
    expect(typedTurnsInWindow(events, SESSION, 0, 99)).toBe(2);
  });

  it('counts turns from other sessions and other windows out', () => {
    seq = 0;
    const start = ev('task_start', { arm: 'A', taskId: 't1a' });
    const inside = ev('turn_start', { arm: 'A', taskId: 't1a', modality: MODALITY_TYPED });
    const end = ev('task_end', { arm: 'A', taskId: 't1a' });
    const after = ev('turn_start', { arm: 'A', taskId: 't1b', modality: MODALITY_TYPED });
    const other = { ...ev('turn_start', { arm: 'A', modality: MODALITY_TYPED }), session_id: 'other' };
    const events = [start, inside, end, after, other];
    expect(typedTurnsInWindow(events, SESSION, start.seq, end.seq)).toBe(1);
  });
});

describe('an event with no modality recorded', () => {
  // Only reachable from a build older than study version 1.1, which no session
  // in this dataset ran on. Treated as "not known to be off-modality" rather
  // than guessed from the arm: inventing the value would put a number in the
  // manipulation check that nobody measured.
  it('is neither counted as typed nor flagged as off-modality', () => {
    seq = 0;
    const events = [
      ev('task_start', { arm: 'A', taskId: 't1a' }),
      ev('turn_start', { arm: 'A', taskId: 't1a' }),
      ev('task_end', { arm: 'A', taskId: 't1a' }),
    ];
    expect(turnsInWindow(events, SESSION, 0, 99)).toBe(1);
    expect(typedTurnsInWindow(events, SESSION, 0, 99)).toBe(0);
    expect(offModalityTurns(events, SESSION, 0, 99, 'A')).toBe(0);
  });
});
