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
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveStudy, transcriptFields, transcriptsConsented } from '../src/study/studyStore.js';
import { CONSENT_ITEMS } from '../src/study/instruments.js';
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

// The on-screen ticks are recorded with `formVersion`, so they assert the
// participant agreed to that version of the approved form. If the screen carries
// fewer items than the form, that assertion is false — which is what happened:
// seven ticks against a twelve-item form, missing the overseas-transfer item.
// Nothing failed, because nothing compared the two.
describe('the consent screen matches the approved form', () => {
  const formPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..', '..', '..', 'docs', 'study', 'ethics', 'consent-form.md',
  );
  const form = readFileSync(formPath, 'utf8');
  // The standard form only; the PLWD short form below it uses unnumbered ticks.
  const numbered = [...form.matchAll(/^☐ \*\*(\d+)\.\*\*([\s\S]*?)(?=^☐|\n---)/gm)];
  const optional = numbered.filter(([, , body]) => /\(Optional/i.test(body));

  it('finds the numbered items in the form', () => {
    expect(numbered.length).toBeGreaterThan(0);
    // Exactly one item is optional: the transcript question, asked separately
    // because declining it must not block participation.
    expect(optional).toHaveLength(1);
  });

  it('has one tick per required form item', () => {
    const required = numbered.length - optional.length;
    expect(
      CONSENT_ITEMS.length,
      `The form has ${required} required items; the screen shows ${CONSENT_ITEMS.length}. `
        + 'Add the missing tick to CONSENT_ITEMS, or amend the form and bump CONSENT_FORM_VERSION.',
    ).toBe(required);
  });

  it('names the overseas processors, which no other screen does', () => {
    const text = CONSENT_ITEMS.map((i) => i.text).join(' ');
    expect(text).toMatch(/OpenAI/);
    expect(text).toMatch(/ElevenLabs/);
  });

  it('covers conversation storage and publication', () => {
    const ids = CONSENT_ITEMS.map((i) => i.id);
    expect(ids).toContain('saves_conversations');
    expect(ids).toContain('reporting');
  });

  it('uses unique, stable ids — they are the keys consent is stored under', () => {
    const ids = CONSENT_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(CONSENT_ITEMS.every((i) => i.text && i.text.length > 20)).toBe(true);
  });
});
