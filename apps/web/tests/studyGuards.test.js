// The two guards that stop the dataset being quietly corrupted mid-session.
//
// Neither failure is visible while it is happening. A participant in the wrong
// arm's interface sees a working app; a second participant resumed into the
// first one's session sees a study that is already half done and assumes that is
// normal. Both produce rows that look fine and mean something other than what
// the analysis will claim — so the checks live here rather than in a manual
// walkthrough nobody will repeat before every session.
import { describe, it, expect } from 'vitest';
import { wrongArmRedirect, needsResumeCheck, setupStartDisabled, ARM_ROUTE } from '../src/study/guards.js';

/** A live session standing in `arm`, at `step`. */
const live = (arm, step = 'task') => ({ active: true, step, stage: { arm } });

describe('keeping each arm in its own interface', () => {
  it('sends an Arm B participant out of the avatar screen', () => {
    // Arm B is the text baseline. A participant who reaches the avatar is in
    // neither condition.
    expect(wrongArmRedirect('/app/voice', live('B'))).toBe(ARM_ROUTE.B);
  });

  it('sends an Arm A participant out of the text screen', () => {
    // The half that was missing. Close the avatar, land on Home, click "Chat" in
    // the sidebar — and every turn after that is stamped Arm A while running
    // through the Arm B interface.
    expect(wrongArmRedirect('/app/chat', live('A'))).toBe(ARM_ROUTE.A);
  });

  it('leaves each arm alone on its own screen', () => {
    expect(wrongArmRedirect('/app/voice', live('A'))).toBeNull();
    expect(wrongArmRedirect('/app/chat', live('B'))).toBeNull();
  });

  it('does not touch the rest of the app', () => {
    // Home, Library and Settings are reachable in both arms — the participant
    // has to be able to get back out of a screen, and the overlay is what brings
    // them back to the study.
    for (const path of ['/app/home', '/app/library', '/app/settings', '/study', '/privacy']) {
      expect(wrongArmRedirect(path, live('A'))).toBeNull();
      expect(wrongArmRedirect(path, live('B'))).toBeNull();
    }
  });

  it('leaves people who are not in a study alone', () => {
    expect(wrongArmRedirect('/app/chat', { active: false, stage: { arm: 'A' } })).toBeNull();
    expect(wrongArmRedirect('/app/chat', null)).toBeNull();
    expect(wrongArmRedirect('/app/chat', undefined)).toBeNull();
  });

  it('stops enforcing once the session has ended', () => {
    // isStudyMode() stays true until the device is cleared. Without this, a
    // participant reading back through the app after finishing is bounced
    // between two screens by a stage index that no longer means anything.
    expect(wrongArmRedirect('/app/chat', live('A', 'done'))).toBeNull();
    expect(wrongArmRedirect('/app/chat', live('A', 'stopped'))).toBeNull();
    expect(wrongArmRedirect('/app/voice', live('B', 'done'))).toBeNull();
  });

  it('does nothing before an arm has been assigned', () => {
    // Between consent and the first arm brief there is no stage yet.
    expect(wrongArmRedirect('/app/chat', { active: true, step: 'background', stage: null })).toBeNull();
  });
});

describe('claiming a restored session', () => {
  it('asks when this device has someone else\'s session part-finished', () => {
    expect(needsResumeCheck({ sessionId: 'abc', step: 'sus' }, false)).toBe(true);
  });

  it('does not ask when there is no session to inherit', () => {
    expect(needsResumeCheck({ sessionId: '', step: 'intro' }, false)).toBe(false);
  });

  it('does not ask again once the person has said it is them', () => {
    expect(needsResumeCheck({ sessionId: 'abc', step: 'sus' }, true)).toBe(false);
  });

  it('does not ask on the closing screens', () => {
    // Those screens carry the device handover themselves, and the participant
    // still needs their code off them — an interstitial here would push it
    // behind a tap at the exact moment they are told to write it down.
    expect(needsResumeCheck({ sessionId: 'abc', step: 'done' }, false)).toBe(false);
    expect(needsResumeCheck({ sessionId: 'abc', step: 'stopped' }, false)).toBe(false);
  });

  it('asks even mid-task', () => {
    // The likeliest handover of all: the previous person stopped without
    // pressing anything, leaving the session open on the task they were doing.
    expect(needsResumeCheck({ sessionId: 'abc', step: 'task' }, false)).toBe(true);
  });
});

describe('letting a session start', () => {
  /** A setup form with everything in order except what the test overrides. */
  const form = (over = {}) => ({
    busy: false,
    accessCode: 'abc123',
    group: 'caregiver',
    supporterPresent: null,
    micStatus: 'ok',
    micAck: false,
    ...over,
  });

  it('starts when the basics and the mic check are in order', () => {
    expect(setupStartDisabled(form())).toBe(false);
  });

  it('still requires a code, a known group, and a settled request', () => {
    expect(setupStartDisabled(form({ accessCode: '  ' }))).toBe(true);
    expect(setupStartDisabled(form({ accessCode: null }))).toBe(true);
    expect(setupStartDisabled(form({ group: 'nope' }))).toBe(true);
    expect(setupStartDisabled(form({ busy: true }))).toBe(true);
  });

  it('still requires a support person for a PLWD session', () => {
    expect(setupStartDisabled(form({ group: 'plwd' }))).toBe(true);
    expect(setupStartDisabled(form({ group: 'plwd', supporterPresent: false }))).toBe(true);
    expect(setupStartDisabled(form({ group: 'plwd', supporterPresent: true }))).toBe(false);
  });

  it('waits for the mic check when it has not been run', () => {
    // The gap the first tester fell through: the check was optional, so a dead
    // mic was discovered mid-task and read as the app being broken.
    expect(setupStartDisabled(form({ micStatus: null }))).toBe(true);
    expect(setupStartDisabled(form({ micStatus: 'denied' }))).toBe(true);
  });

  it('lets an explicit "continue without the microphone" through', () => {
    // Typing is a supported path through every Arm A task; the tick just makes
    // the tradeoff a decision instead of a surprise.
    expect(setupStartDisabled(form({ micStatus: 'denied', micAck: true }))).toBe(false);
    expect(setupStartDisabled(form({ micStatus: null, micAck: true }))).toBe(false);
  });
});
