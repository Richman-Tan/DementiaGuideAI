// Counterbalancing and instrument invariants.
//
// The Latin square is the study's only defence against order effects, and it is
// applied by a pure function that nothing else exercises — so if it silently
// skews, every result is confounded and nobody would notice until analysis.
import { describe, it, expect } from 'vitest';
import {
  assignmentFor,
  sequenceFor,
  parseParticipantCode,
  normaliseParticipantCode,
  TASK_SETS,
  PLWD_TASKS,
} from '@core/study/studyConfig.mjs';
import { SUS_ITEMS, LIKERT_ITEMS, POST_TASK, DEBRIEF } from '../src/study/instruments.js';

describe('participant codes', () => {
  it('parses the documented form and tolerates hand-copied variants', () => {
    expect(parseParticipantCode('P07')).toBe(7);
    expect(parseParticipantCode('p7')).toBe(7);
    expect(parseParticipantCode('  P-12 ')).toBe(12);
    expect(normaliseParticipantCode('p7')).toBe('P07');
    expect(normaliseParticipantCode('P12')).toBe('P12');
  });

  it('rejects anything that is not a participant code', () => {
    for (const bad of ['', 'P', 'P0', 'X7', '7', 'PP7', null, undefined]) {
      expect(parseParticipantCode(bad)).toBeNull();
    }
  });
});

describe('counterbalancing', () => {
  it('fills all four Latin-square cells evenly over 12 participants', () => {
    const cells = {};
    for (let n = 1; n <= 12; n++) {
      const { armOrder, setOrder } = assignmentFor(n);
      cells[armOrder + setOrder] = (cells[armOrder + setOrder] || 0) + 1;
    }
    expect(Object.keys(cells).sort()).toEqual(['AB12', 'AB21', 'BA12', 'BA21']);
    expect(Object.values(cells)).toEqual([3, 3, 3, 3]);
  });

  it('matches the table in docs/study/protocol.md §2.1', () => {
    expect(assignmentFor(1)).toMatchObject({ armOrder: 'AB', setOrder: '12' });
    expect(assignmentFor(2)).toMatchObject({ armOrder: 'BA', setOrder: '12' });
    expect(assignmentFor(3)).toMatchObject({ armOrder: 'AB', setOrder: '21' });
    expect(assignmentFor(4)).toMatchObject({ armOrder: 'BA', setOrder: '21' });
  });

  it('is deterministic — the same participant always gets the same assignment', () => {
    for (let n = 1; n <= 20; n++) {
      expect(assignmentFor(n)).toEqual(assignmentFor(n));
    }
  });

  it('gives every participant both arms and both task sets, exactly once each', () => {
    for (let n = 1; n <= 12; n++) {
      const seq = sequenceFor(n);
      expect(seq).toHaveLength(2);
      expect(seq.map((s) => s.arm).sort()).toEqual(['A', 'B']);
      expect(seq.map((s) => s.set).sort()).toEqual([1, 2]);
    }
  });

  it('never repeats a task within a participant', () => {
    for (let n = 1; n <= 12; n++) {
      const ids = sequenceFor(n).flatMap((s) => s.tasks.map((t) => t.id));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('gives participants living with dementia the shortened set', () => {
    const seq = sequenceFor(1, 'plwd');
    expect(seq).toHaveLength(2);
    for (const stage of seq) expect(stage.tasks).toHaveLength(1);
  });
});

describe('task sets', () => {
  it('has three tasks per set', () => {
    expect(TASK_SETS[1]).toHaveLength(3);
    expect(TASK_SETS[2]).toHaveLength(3);
    expect(PLWD_TASKS[1]).toHaveLength(1);
    expect(PLWD_TASKS[2]).toHaveLength(1);
  });

  it('matches the sets by category so neither arm draws the easier one', () => {
    const cats = (set) => set.map((t) => t.category).sort();
    expect(cats(TASK_SETS[1])).toEqual(cats(TASK_SETS[2]));
    expect(cats(TASK_SETS[1])).toEqual(['behaviour', 'safety', 'services']);
  });

  it('never leaks the scoring rubric or the expected chunk to the browser', () => {
    // The answer key lives in docs/study/tasks.md and scripts/study/, not here:
    // a participant with developer tools open must not be able to read it.
    for (const t of [...TASK_SETS[1], ...TASK_SETS[2], ...PLWD_TASKS[1], ...PLWD_TASKS[2]]) {
      expect(t).not.toHaveProperty('keyPoints');
      expect(t).not.toHaveProperty('expectedChunk');
      expect(Object.keys(t).sort()).toEqual(['category', 'goal', 'id', 'set', 'situation', 'title']);
    }
  });

  it('describes a situation rather than handing over the query', () => {
    // A card that reads like a question would measure typing, not information
    // seeking (docs/study/tasks.md §1).
    for (const t of [...TASK_SETS[1], ...TASK_SETS[2]]) {
      expect(t.situation.startsWith('Imagine')).toBe(true);
      expect(t.situation).not.toMatch(/\?$/);
    }
  });
});

describe('instruments', () => {
  it('has the ten standard SUS items with alternating polarity', () => {
    expect(SUS_ITEMS).toHaveLength(10);
    SUS_ITEMS.forEach((item, i) => {
      // Odd-numbered items are positively worded, even negatively — the scoring
      // in scripts/study/analyse-study.mjs depends on this.
      expect(item.positive).toBe(i % 2 === 0);
    });
  });

  it('carries the four constructs SUS does not', () => {
    expect(LIKERT_ITEMS.map((i) => i.construct)).toEqual(
      ['trust', 'engagement', 'helpfulness', 'clarity']
    );
  });

  it('keeps every Likert scale pointing the same way', () => {
    for (const item of LIKERT_ITEMS) {
      expect(item.options.map((o) => o.value)).toEqual([1, 2, 3, 4, 5]);
      expect(item.options[0].label).toMatch(/Strongly disagree/);
      expect(item.options[4].label).toMatch(/Strongly agree/);
    }
  });

  it('asks two items after each task and five at debrief', () => {
    expect(POST_TASK).toHaveLength(2);
    expect(DEBRIEF).toHaveLength(5);
  });
});
