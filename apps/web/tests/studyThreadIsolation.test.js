// A study session must never see another session's conversation.
//
// Conversations are server-side, one thread per (anon user, study arm) — and
// the anon auth token outlives "Clear this device". So on a shared study
// laptop, getOrCreateConversation() resolved the PREVIOUS participant's arm
// thread: their conversation rendered on the next participant's screen and was
// fed to the model as context (found in the 2026-09-01 pre-launch dry run).
// The fix scopes thread ids to the session in dg_study: created fresh via
// startNewConversation(), rejoined on reload, wiped with the session.
import { beforeEach, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = (p) => readFileSync(join(import.meta.dirname, p), 'utf8');

// studyStore reads localStorage at call time; give node a minimal one.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { studyConversationId, rememberStudyConversation, clearStudy } =
  await import('../src/study/studyStore.js');
const { shouldAdoptServerThread } = await import('../src/state/threadAdoption.js');

describe('session-scoped conversation ids', () => {
  beforeEach(() => store.clear());

  it('starts with no thread for either arm', () => {
    expect(studyConversationId('A')).toBeNull();
    expect(studyConversationId('B')).toBeNull();
  });

  it('remembers one thread per arm and reads it back', () => {
    rememberStudyConversation('A', 'conv-arm-a');
    rememberStudyConversation('B', 'conv-arm-b');
    expect(studyConversationId('A')).toBe('conv-arm-a');
    expect(studyConversationId('B')).toBe('conv-arm-b');
  });

  it('clearing the device retires the threads with the session', () => {
    rememberStudyConversation('A', 'conv-arm-a');
    clearStudy();
    expect(studyConversationId('A')).toBeNull();
  });
});

describe('ChatProvider thread selection', () => {
  const chatContext = src('../src/state/ChatContext.jsx');

  it('never reuses a most-recent arm thread during a study', () => {
    // The regression: passing the arm into getOrCreateConversation resolves
    // whatever arm thread this device's anon user touched last — the previous
    // participant's conversation.
    expect(chatContext).not.toMatch(/getOrCreateConversation\([^)]*studyArm:\s*studyArm/);
    expect(chatContext).toMatch(/startNewConversation\(userId,\s*\{\s*surface:\s*'chat',\s*studyArm\s*\}\)/);
    expect(chatContext).toMatch(/rememberStudyConversation\(studyArm,\s*id\)/);
  });

  it('adopts the new thread on an arm switch instead of bailing on emptiness', () => {
    // The regression: `if (!server.length) return` was unconditional, so arm
    // B's fresh empty thread never replaced the screen — arm A's conversation
    // stayed visible in the arm B interface and was fed to the model as
    // context (found live in the 2026-09-09 pilot run-through).
    expect(chatContext).toMatch(/shouldAdoptServerThread\(prevId,\s*id,\s*server\.length\)/);
    expect(chatContext).not.toMatch(/cancelled \|\| !server\.length/);
  });
});

describe('adopting a server thread', () => {
  it('a thread with content always replaces the screen', () => {
    expect(shouldAdoptServerThread(null, 'conv-a', 3)).toBe(true);
    expect(shouldAdoptServerThread('conv-a', 'conv-a', 3)).toBe(true);
  });

  it('same-thread emptiness keeps the cached render — a hiccup must not blank a real conversation', () => {
    expect(shouldAdoptServerThread('conv-a', 'conv-a', 0)).toBe(false);
    expect(shouldAdoptServerThread(null, 'conv-a', 0)).toBe(false);
  });

  it('a DIFFERENT empty thread replaces the screen — the arm switch', () => {
    // Arm B's thread is brand new and empty; keeping arm A's messages on
    // screen lets the participant re-read them and contaminates the model
    // context for arm B's first turn.
    expect(shouldAdoptServerThread('conv-arm-a', 'conv-arm-b', 0)).toBe(true);
  });
});

describe('a fresh session inherits no threads', () => {
  it('begin() resets convoIds for a non-resumed session', () => {
    expect(src('../src/study/StudyContext.jsx')).toMatch(/convoIds:\s*\{\}/);
  });
});

describe('chat turns are tagged with the arm at call time', () => {
  it('run() reads currentArm(), not the render closure', () => {
    // The regression: `send` is memoized once at mount and calls the first
    // render's `run`, whose captured studyArm is whatever the store held at
    // page load — null for a chat-first participant, mis-tagging their
    // turn/latency events (2026-09-02 regression run).
    const chatContext = src('../src/state/ChatContext.jsx');
    expect(chatContext).toMatch(/const arm = currentArm\(\);/);
    expect(chatContext).not.toMatch(/const arm = studyArm;/);
  });
});

describe('study-page stop is two-step', () => {
  it('StopBar confirms before ending the session', () => {
    const screen = src('../src/study/screens/StudyScreen.jsx');
    const stopBar = screen.slice(screen.indexOf('function StopBar'), screen.indexOf('Hands the device'));
    expect(stopBar).toMatch(/setConfirming\(true\)/);
    expect(stopBar).toMatch(/role="alertdialog"/);
    expect(stopBar).toMatch(/Keep going/);
  });
});
