// Decisions that protect the dataset, kept as pure functions so they can be
// tested. They used to live inline — in a router branch, a provider, a
// disabled prop — where the only way to check them was to run a session by
// hand and hope.
import { ARM_A, ARM_B, GROUPS } from '@core/study/studyConfig.mjs';

/** The one app route each arm is conducted in. */
export const ARM_ROUTE = { [ARM_A]: '#/app/voice', [ARM_B]: '#/app/chat' };

/** Steps where the session is over and there is nothing left to protect. */
export const TERMINAL_STEPS = ['done', 'stopped'];

const ARM_PATHS = { '/app/voice': ARM_A, '/app/chat': ARM_B };

/**
 * Where to send a participant who is on the wrong arm's screen, or null.
 *
 * Each arm has exactly one interface and the other must be unreachable, in BOTH
 * directions. Only the Arm B half of this existed for a while, which left the
 * text screen open throughout Arm A: close the avatar, land on Home, click
 * "Chat" in the sidebar, and every turn after that is stamped Arm A while being
 * conducted in the Arm B interface. Worse than a missing measurement, because
 * nothing in the data says it happened.
 *
 * Lifted once the session ends: `isStudyMode()` stays true until the device is
 * cleared, and someone reading back through the app afterwards should not be
 * bounced between two screens by a stage index that no longer means anything.
 */
export function wrongArmRedirect(path, study) {
  if (!study?.active) return null;
  const arm = study.stage?.arm;
  if (!arm || TERMINAL_STEPS.includes(study.step)) return null;
  const pathArm = ARM_PATHS[path];
  if (!pathArm || pathArm === arm) return null;
  return ARM_ROUTE[arm] ?? null;
}

/**
 * Whether the person at the keyboard has to confirm the session this device
 * restored belongs to them.
 *
 * The study runs on ONE forwarded link, so more than one person will open it in
 * the same browser. Without this, a second person arriving at a device where the
 * first did not finish is resumed silently into the first participant's session:
 * their code, their answers, their Latin square cell. Two people become one row,
 * with nothing recording that it happened.
 *
 * Not asked for a session created in this page load — that person just typed the
 * codes in — and not on the closing screens, which offer the device handover of
 * their own accord.
 */
export function needsResumeCheck({ sessionId, step }, acknowledged) {
  return Boolean(sessionId) && !acknowledged && !TERMINAL_STEPS.includes(step);
}

/**
 * Whether the setup screen's Start button is disabled.
 *
 * The mic rule is the new half. The setup page always had a microphone check,
 * but Start ignored it — so the first tester to skip it discovered mid-task
 * that their mic didn't work, with no record of it anywhere in the data. Start
 * now waits for either a passing check or an explicit "continue without the
 * microphone" acknowledgement (typing is a supported path through every Arm A
 * task, so a dead mic must not lock anyone out — it just can't be a surprise).
 */
export function setupStartDisabled({ busy, accessCode, group, supporterPresent, micStatus, micAck }) {
  if (busy || !String(accessCode ?? '').trim() || !GROUPS.includes(group)) return true;
  // A PLWD session cannot proceed without a support person present.
  if (group === 'plwd' && supporterPresent !== true) return true;
  return micStatus !== 'ok' && micAck !== true;
}
