// Conversation history — localStorage `dg_history`, shared by Chat and Voice.
// Capped at 100 entries (mobile parity); only the last MAX_HISTORY go to the model.
const KEY = 'dg_history';
const MAX_PERSISTED = 100;

export function loadHistory() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveHistory(msgs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(msgs.slice(-MAX_PERSISTED)));
  } catch {
    /* full/blocked */
  }
}

export function clearHistory() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* blocked */
  }
}
