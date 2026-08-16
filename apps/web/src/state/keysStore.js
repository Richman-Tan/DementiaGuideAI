// API keys — localStorage `dg_keys` (browser-side by design, parity with the
// app's on-device key entry). Keys: openai, eleven, azure (azure unused on web).
const KEY = 'dg_keys';

export function loadKeys() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return { openai: '', eleven: '', azure: '', ...(v || {}) };
  } catch {
    return { openai: '', eleven: '', azure: '' };
  }
}

export function saveKeys(keys) {
  try {
    localStorage.setItem(KEY, JSON.stringify(keys));
  } catch {
    /* blocked */
  }
}

export function clearKeys() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* blocked */
  }
}

export const getOpenaiKey = () => loadKeys().openai.trim();
export const getElevenKey = () => loadKeys().eleven.trim();
