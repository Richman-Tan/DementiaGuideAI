// Guest access code — localStorage `dg_access`.
//
// Lets an invited carer use the whole app (chat, voice, library) through the
// credential proxy: nothing is written to the database beyond the per-code
// request count that every proxied call already adds. Only a code the server
// has accepted is ever stored (see validateAccessCode in transport.js).
const KEY = 'dg_access';

/** → { code, status: 'ok' | 'limit' | 'rejected', checkedAt } or null. */
export function loadAccess() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v && typeof v.code === 'string' && v.code.trim() ? v : null;
  } catch {
    return null;
  }
}

export function saveAccess(code, status = 'ok') {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ code: code.trim(), status, checkedAt: new Date().toISOString() })
    );
  } catch {
    /* storage blocked */
  }
}

// A code the server later refuses is kept, not dropped: dropping it would
// silently put the app back on example answers, which reads as "working".
// Marked, the next failure tells the carer to update it instead.
export function markAccessRejected() {
  const a = loadAccess();
  if (a && a.status !== 'rejected') saveAccess(a.code, 'rejected');
}

export function clearAccess() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
}

export const guestAccessCode = () => loadAccess()?.code.trim() || '';
