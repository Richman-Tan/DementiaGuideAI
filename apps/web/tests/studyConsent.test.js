// Transcript consent, exercised through the real store and the real emit().
//
// The optional consent item asks whether we may *keep* the participant's
// questions and the app's answers. Gating that at export time would still have
// written the text to the database and held it for the retention period, so the
// property worth testing is stronger: when a participant declines, their words
// never enter the outbound queue at all.
//
// Deliberately driven through emit() rather than a fixture. The defect this
// guards against was invisible precisely because nothing exercised the real
// emission path.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveStudy, transcriptFields, transcriptsConsented } from '../src/study/studyStore.js';
import { emit } from '../src/study/events.js';

const QUEUE_KEY = 'dg_study_queue';
const QUESTION = 'How do I get my mother to accept help with showering?';
const ANSWER = 'Try offering a choice between two options rather than asking yes or no.';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

const queue = () => JSON.parse(globalThis.localStorage.getItem(QUEUE_KEY) || '[]');

/** A live session — emit() is a no-op without both of these. */
const session = (consentTranscripts) =>
  saveStudy({
    sessionId: '11111111-2222-3333-4444-555555555555',
    accessCode: 'test-access-code',
    participantCode: 'P07',
    step: 'task',
    taskId: 't1b',
    consentTranscripts,
  });

/** The call site as it appears in ChatContext and useVoiceConversation. */
const emitTurn = () =>
  emit('turn', {
    arm: 'B',
    taskId: 't1b',
    ...transcriptFields({ question: QUESTION, answer: ANSWER }),
    sourceIds: [12, 30],
  });

beforeEach(() => {
  globalThis.localStorage = memoryStorage();
  // emit() schedules a flush; keep the suite off the network.
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 202, json: async () => ({}) }));
});

describe('transcriptsConsented', () => {
  it('is false outside a study session, whatever the stored flag says', () => {
    saveStudy({ consentTranscripts: true });
    expect(transcriptsConsented()).toBe(false);
  });

  it('follows the participant’s answer inside a session', () => {
    session(false);
    expect(transcriptsConsented()).toBe(false);
    session(true);
    expect(transcriptsConsented()).toBe(true);
  });
});

describe('a participant who declines', () => {
  beforeEach(() => session(false));

  it('does not put their words in the queue', () => {
    emitTurn();
    const [ev] = queue();
    expect(ev.payload.question).toBeUndefined();
    expect(ev.payload.answer).toBeUndefined();
  });

  it('leaves no trace of the text anywhere in the serialised queue', () => {
    emitTurn();
    const raw = globalThis.localStorage.getItem(QUEUE_KEY);
    expect(raw).not.toContain(QUESTION);
    expect(raw).not.toContain(ANSWER);
  });

  it('is still counted — declining costs content, not the measure', () => {
    emitTurn();
    const [ev] = queue();
    expect(ev.kind).toBe('turn');
    expect(ev.taskId).toBe('t1b');
    expect(ev.arm).toBe('B');
    expect(ev.payload.sourceIds).toEqual([12, 30]);
  });
});

describe('a participant who agrees', () => {
  beforeEach(() => session(true));

  it('has their words recorded against the task', () => {
    emitTurn();
    const [ev] = queue();
    expect(ev.payload.question).toBe(QUESTION);
    expect(ev.payload.answer).toBe(ANSWER);
    expect(ev.taskId).toBe('t1b');
  });
});

describe('transcriptFields', () => {
  it('drops every field rather than blanking them, so no empty string is stored', () => {
    session(false);
    expect(transcriptFields({ question: QUESTION, answer: ANSWER })).toEqual({});
  });

  it('passes fields through untouched once consented', () => {
    session(true);
    expect(transcriptFields({ question: QUESTION })).toEqual({ question: QUESTION });
  });
});
