// Single source of truth for the study's arms, tasks and counterbalancing.
//
// Lives in @core because BOTH the web client and the backend need it: the
// assignment a participant is shown and the assignment written to the database
// must come from one definition or they can silently drift apart.
//
// `.mjs`, not `.js`: this package deliberately has no `"type": "module"` (see
// ../README.md — `rag/` and `brand/` must stay require()-able by scripts/), so a
// `.js` file using `export` syntax would fail to parse under plain Node. The API
// imports this directly in Node, so the extension has to be unambiguous.
//
// Scoring rubrics and expected knowledge-base chunks are NOT here — they live in
// docs/study/tasks.md and scripts/study/. Anything in this file ships to the
// browser, and a participant who opens developer tools should not be able to
// read the answer key.

export const ARM_A = 'A'; // avatar — voice in, spoken answer, lip-synced face
export const ARM_B = 'B'; // text baseline — same RAG, typed in, text out

// The assistant's name is NOT hardcoded here. The web default is Aaron, the
// Three.js fallback is Aria, and a participant can be on either — so the copy
// takes the name from the effective avatar profile at render time. Phrasing
// avoids pronouns for the same reason: the roster is mixed.
export const armLabel = (arm, name) =>
  arm === ARM_A ? `Talking with ${name}` : `Typing to ${name}`;

// Standing warning on every task card. Repeated rather than shown once at the
// start, because it is the instruction most likely to be forgotten mid-task.
export const IDENTITY_WARNING =
  'Please don’t type or say real names, addresses, or anything else that would '
  + 'identify you or the person you care for. Made-up names are fine.';

export const TASK_SETS = {
  1: [
    {
      id: 't1a',
      set: 1,
      category: 'behaviour',
      title: 'Evenings are difficult',
      situation:
        'Imagine you are caring for someone who becomes restless, confused and upset '
        + 'most afternoons, and it gets worse as the evening goes on. By dinner time it '
        + 'is hard to settle them.',
      goal: 'Use the app to find out what you could try.',
    },
    {
      id: 't1b',
      set: 1,
      category: 'safety',
      title: 'Awake and moving at night',
      situation:
        'Imagine the person you care for keeps waking during the night and walking '
        + 'around the house. You are worried about them getting hurt, and you are not '
        + 'sleeping.',
      goal: 'Use the app to find out how to manage this.',
    },
    {
      id: 't1c',
      set: 1,
      category: 'services',
      title: 'You need a break',
      situation:
        'Imagine you have been caring for someone for two years without a proper break, '
        + 'and you are exhausted. You want to know what help exists so you can have some '
        + 'time off.',
      goal: 'Use the app to find out what your options are in New Zealand.',
    },
  ],
  2: [
    {
      id: 't2a',
      set: 2,
      category: 'behaviour',
      title: 'The same question, over and over',
      situation:
        'Imagine the person you care for asks you the same question many times an hour. '
        + 'You have answered it each time and you are starting to lose patience.',
      goal: 'Use the app to find out how to handle this.',
    },
    {
      id: 't2b',
      set: 2,
      category: 'safety',
      title: 'The bathroom feels unsafe',
      situation:
        'Imagine the person you care for has slipped in the bathroom twice in the past '
        + 'month. Nothing serious so far, but you want to make the room safer before '
        + 'something is.',
      goal: 'Use the app to find out what you should change.',
    },
    {
      id: 't2c',
      set: 2,
      category: 'services',
      title: 'Wondering whether home is still the right place',
      situation:
        'Imagine you are starting to wonder whether you can keep caring for someone at '
        + 'home, and what would happen if you couldn’t.',
      goal:
        'Use the app to find out how to think about this decision and what is involved '
        + 'in New Zealand.',
    },
  ],
};

// Shortened set for participants living with dementia: one task per arm, first
// person, gentler, and no cue that they are being timed. See protocol.md §3.3.
export const PLWD_TASKS = {
  1: [
    {
      id: 'd1',
      set: 1,
      category: 'plwd',
      title: 'Sleeping at night',
      situation:
        'Sometimes people find it hard to sleep through the night, or wake up and feel '
        + 'unsure where they are.',
      goal: 'Have a look and see what the app suggests might help.',
    },
  ],
  2: [
    {
      id: 'd2',
      set: 2,
      category: 'plwd',
      title: 'Finding support',
      situation:
        'Lots of people want to know what help is available for them and their family.',
      goal: 'Have a look and see what the app tells you about support in New Zealand.',
    },
  ],
};

export const GROUPS = ['caregiver', 'worker', 'plwd', 'pilot'];

/**
 * Participant codes look like `P07`. Returns the number, or null if malformed.
 * Case-insensitive and tolerant of surrounding whitespace, because the code is
 * copied out of an email by hand.
 */
export function parseParticipantCode(code) {
  const m = /^\s*p\s*-?\s*(\d{1,3})\s*$/i.exec(String(code || ''));
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? n : null;
}

export function normaliseParticipantCode(code) {
  const n = parseParticipantCode(code);
  return n === null ? null : `P${String(n).padStart(2, '0')}`;
}

/**
 * Deterministic Latin square on the participant number (protocol.md §2.1).
 * Crosses arm order with task-set order, so neither a learning effect nor an
 * easier task set can be confounded with the arm. Deterministic rather than
 * random: at n < 20 it guarantees balanced cells and can be audited afterwards.
 *
 *   n mod 4 = 1 → A/Set1 then B/Set2
 *           = 2 → B/Set1 then A/Set2
 *           = 3 → A/Set2 then B/Set1
 *           = 0 → B/Set2 then A/Set1
 */
export function assignmentFor(participantNumber) {
  const cell = ((participantNumber % 4) + 4) % 4;
  const armOrder = cell === 1 || cell === 3 ? 'AB' : 'BA';
  const setOrder = cell === 1 || cell === 2 ? '12' : '21';
  return { cell, armOrder, setOrder };
}

/**
 * The full ordered plan: which arm the participant meets first, with which task
 * set. `group` selects the shortened task list for participants living with
 * dementia.
 */
export function sequenceFor(participantNumber, group = 'caregiver') {
  const { armOrder, setOrder } = assignmentFor(participantNumber);
  const tasks = group === 'plwd' ? PLWD_TASKS : TASK_SETS;
  const sets = setOrder.split('').map(Number);
  return armOrder.split('').map((arm, i) => ({
    arm,
    set: sets[i],
    tasks: tasks[sets[i]],
  }));
}

export const STUDY_VERSION = '1.0';
export const CONSENT_FORM_VERSION = '1.0';
