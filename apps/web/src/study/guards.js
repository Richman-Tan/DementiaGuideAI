// Two decisions that protect the dataset, kept as pure functions so they can be
// tested. Both used to live inline — one in a router branch, one in a provider —
// where the only way to check them was to run a session by hand and hope.
import { ARM_A, ARM_B } from '@core/study/studyConfig.mjs';

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
