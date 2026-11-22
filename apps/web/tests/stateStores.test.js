// The small localStorage stores the rest of the app reads credentials and the
// avatar choice from: dg_keys (personal API keys), dg_access (guest code) and
// the non-React dg_settings snapshot. Each one has to survive corrupt or
// blocked storage without throwing into the caller.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadKeys, saveKeys, clearKeys, getOpenaiKey, getElevenKey } from '../src/state/keysStore.js';
import { loadAccess, saveAccess, markAccessRejected, clearAccess, guestAccessCode } from '../src/state/accessStore.js';
import { getSettingSnapshot } from '../src/state/settingsSnapshot.js';

function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

// Safari private mode and some embedded browsers throw on every access.
const blockedStorage = () => ({
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
  removeItem: () => { throw new Error('SecurityError'); },
});

let storage;
beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('keysStore (dg_keys)', () => {
  it('fills missing fields with empty strings and trims what the getters return', () => {
    storage.setItem('dg_keys', JSON.stringify({ openai: '  sk-abc  ' }));
    expect(loadKeys()).toEqual({ openai: '  sk-abc  ', eleven: '', azure: '' });
    expect(getOpenaiKey()).toBe('sk-abc');
    expect(getElevenKey()).toBe('');
  });

  it('round-trips saved keys and clearKeys removes the record', () => {
    saveKeys({ openai: 'sk-1', eleven: 'el-1', azure: '' });
    expect(JSON.parse(storage.getItem('dg_keys'))).toEqual({ openai: 'sk-1', eleven: 'el-1', azure: '' });
    expect(getElevenKey()).toBe('el-1');
    clearKeys();
    expect(storage.getItem('dg_keys')).toBeNull();
    expect(loadKeys()).toEqual({ openai: '', eleven: '', azure: '' });
  });

  it('a corrupt blob reads as no keys rather than throwing', () => {
    storage.setItem('dg_keys', '{not json');
    expect(loadKeys()).toEqual({ openai: '', eleven: '', azure: '' });
    expect(getOpenaiKey()).toBe('');
  });

  it('blocked storage is tolerated by every call', () => {
    vi.stubGlobal('localStorage', blockedStorage());
    expect(loadKeys()).toEqual({ openai: '', eleven: '', azure: '' });
    expect(() => saveKeys({ openai: 'x' })).not.toThrow();
    expect(() => clearKeys()).not.toThrow();
  });
});

describe('accessStore (dg_access)', () => {
  it('saves a trimmed code with a status and timestamp', () => {
    saveAccess('  guest-code-0123456789  ', 'limit');
    const a = loadAccess();
    expect(a.code).toBe('guest-code-0123456789');
    expect(a.status).toBe('limit');
    expect(Number.isNaN(Date.parse(a.checkedAt))).toBe(false);
    expect(guestAccessCode()).toBe('guest-code-0123456789');
  });

  it('a blank or code-less record is treated as absent', () => {
    storage.setItem('dg_access', JSON.stringify({ code: '   ' }));
    expect(loadAccess()).toBeNull();
    storage.setItem('dg_access', JSON.stringify({ status: 'ok' }));
    expect(loadAccess()).toBeNull();
    expect(guestAccessCode()).toBe('');
  });

  it('a corrupt record reads as absent', () => {
    storage.setItem('dg_access', '{oops');
    expect(loadAccess()).toBeNull();
  });

  it('markAccessRejected marks once and does nothing without a code', () => {
    markAccessRejected(); // nothing stored: no-op
    expect(storage.getItem('dg_access')).toBeNull();
    saveAccess('guest-code-0123456789');
    markAccessRejected();
    const first = storage.getItem('dg_access');
    expect(JSON.parse(first).status).toBe('rejected');
    markAccessRejected(); // already rejected: not rewritten
    expect(storage.getItem('dg_access')).toBe(first);
  });

  it('blocked storage is tolerated on save and clear', () => {
    vi.stubGlobal('localStorage', blockedStorage());
    expect(() => saveAccess('guest-code-0123456789')).not.toThrow();
    expect(() => clearAccess()).not.toThrow();
    expect(loadAccess()).toBeNull();
  });
});

describe('getSettingSnapshot (dg_settings outside React)', () => {
  it('defaults to aaron when nothing is stored', () => {
    expect(getSettingSnapshot()).toEqual({ avatarId: 'aaron' });
  });

  it('returns a stored avatarId untouched (retired ids are resolved by getAvatarProfile)', () => {
    storage.setItem('dg_settings', JSON.stringify({ avatarId: 'aria', textScale: 1.2 }));
    expect(getSettingSnapshot()).toEqual({ avatarId: 'aria', textScale: 1.2 });
    expect(JSON.parse(storage.getItem('dg_settings')).avatarId).toBe('aria');
    storage.setItem('dg_settings', JSON.stringify({ avatarId: 'ariana' }));
    expect(getSettingSnapshot().avatarId).toBe('ariana');
  });

  it('a corrupt blob falls back to the default avatar', () => {
    storage.setItem('dg_settings', 'nope');
    expect(getSettingSnapshot()).toEqual({ avatarId: 'aaron' });
  });
});
