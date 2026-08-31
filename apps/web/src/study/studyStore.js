// Study session state — localStorage `dg_study`.
//
// Kept in its own store rather than folded into dg_settings so that a study
// session can be cleared without touching a participant's accessibility
// preferences, and so nothing study-related leaks into the normal app for
// people who are not participants.
const KEY = 'dg_study';

const EMPTY = {
  accessCode: '',      // authorises the server-side credential proxy
  participantCode: '', // e.g. 'P07' — the only identifier we hold
  sessionId: '',
  group: 'caregiver',
  armOrder: '',
  setOrder: '',
  step: 'intro',
  stageIndex: 0,       // which of the two arms the participant is in
  taskIndex: 0,
  taskId: '',          // the task in progress, read by emit() from shared code
  consentTranscripts: false,
  responses: {},       // questionnaire answers, keyed by instrument id
  convoIds: {},        // conversation thread per arm, scoped to THIS session
  seq: 0,              // monotonic event counter, survives a reload
};

export function loadStudy() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return { ...EMPTY, ...(v || {}) };
  } catch {
    return { ...EMPTY };
  }
}

export function saveStudy(patch) {
  const next = { ...loadStudy(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* blocked */ }
  return next;
}

export function clearStudy() {
  try { localStorage.removeItem(KEY); } catch { /* blocked */ }
}

export const studyAccessCode = () => loadStudy().accessCode.trim();

/**
 * True once a participant has a live session. Used across the app to suppress
 * anything that would contaminate the study — the seeded demo conversation, the
 * raw API-key fields, the avatar in Arm B.
 */
export function isStudyMode() {
  const s = loadStudy();
  return Boolean(s.sessionId && s.accessCode);
}

/**
 * One conversation thread per (session, arm). The id lives in dg_study so a
 * mid-session reload rejoins the same thread, while "Clear this device" — which
 * removes dg_study — retires it. Without this, the chat context reused the anon
 * user's most recent arm thread, which on a shared study device is the PREVIOUS
 * participant's conversation: visible on screen and fed to the model as context.
 */
export function studyConversationId(arm) {
  const s = loadStudy();
  return (s.convoIds || {})[arm] || null;
}

export function rememberStudyConversation(arm, id) {
  const s = loadStudy();
  saveStudy({ convoIds: { ...(s.convoIds || {}), [arm]: id } });
}

/** The arm the participant is currently in, or null outside a study session. */
export function currentArm() {
  const s = loadStudy();
  if (!s.sessionId || !s.armOrder) return null;
  return s.armOrder[s.stageIndex] || null;
}

/** The task currently in progress, or null. Companion to currentArm(); both are
 *  read from shared code paths that must not import the React context. */
export function currentTaskId() {
  const s = loadStudy();
  return s.sessionId && s.step === 'task' ? s.taskId || null : null;
}

/**
 * Whether the participant agreed to their conversation being kept.
 *
 * Consulted before any question or answer text leaves the browser. Declining has
 * to mean the text is never stored: filtering it back out at export would still
 * have written it to the database and held it for the retention period, which is
 * not what the consent screen promises.
 */
export function transcriptsConsented() {
  const s = loadStudy();
  return Boolean(s.sessionId && s.consentTranscripts);
}

/**
 * The participant's own words, or nothing at all if they declined.
 *
 * Spread into an event payload rather than tested at each call site, so that
 * adding a field carrying what someone said is a deliberate act:
 *
 *   emit('turn', { arm, taskId, ...transcriptFields({ question, answer }) })
 */
export function transcriptFields(fields) {
  return transcriptsConsented() ? fields : {};
}

/** Next event sequence number. Monotonic across reloads so ordering survives. */
export function nextSeq() {
  const s = loadStudy();
  const seq = (s.seq || 0) + 1;
  saveStudy({ seq });
  return seq;
}
