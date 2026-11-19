// Guest access codes: an invited carer uses the whole app through the credential
// proxy. Exercised through the real stores and transport, with localStorage and
// fetch stubbed.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openaiTransport, elevenTransport, hasCredentials, validateAccessCode } from '../src/services/transport.js';
import { saveAccess, loadAccess, markAccessRejected, clearAccess } from '../src/state/accessStore.js';
import { saveKeys } from '../src/state/keysStore.js';
import { credentialErrorCopy } from '../src/services/credentialErrorCopy.js';

const GUEST = 'guest-access-code-0001';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}
const named = (name) => Object.assign(new Error(name), { name });

beforeEach(() => { globalThis.localStorage = memoryStorage(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('transport precedence: personal key → guest code → none', () => {
  it('with nothing stored the app has no credentials (mock mode)', () => {
    expect(openaiTransport()).toBeNull();
    expect(hasCredentials()).toBe(false);
  });

  it('a guest code alone proxies with the code in x-study-code', () => {
    saveAccess(GUEST);
    expect(openaiTransport()).toEqual({ proxied: true, guest: true, headers: { 'x-study-code': GUEST } });
    expect(hasCredentials()).toBe(true);
  });

  it('a personal OpenAI key beats a guest code', () => {
    saveAccess(GUEST);
    saveKeys({ openai: 'sk-personal', eleven: '', azure: '' });
    expect(openaiTransport().proxied).toBe(false);
  });

  it('ElevenLabs uses the guest code only when there is no personal OpenAI key', () => {
    saveAccess(GUEST);
    expect(elevenTransport().headers['x-study-code']).toBe(GUEST);
    saveKeys({ openai: 'sk-personal', eleven: '', azure: '' });
    expect(elevenTransport()).toBeNull();
  });

  it('a code the server later refuses is kept and marked, never silently dropped', () => {
    saveAccess(GUEST);
    markAccessRejected();
    expect(loadAccess().status).toBe('rejected');
    expect(openaiTransport().guest).toBe(true);
    clearAccess();
    expect(openaiTransport()).toBeNull();
  });
});

describe('validateAccessCode maps the guard’s answer without any provider spend', () => {
  const answer = (status) => vi.fn(async () => ({ status }));
  for (const [status, expected] of [[400, { ok: true, status: 'ok' }], [429, { ok: true, status: 'limit' }],
    [401, { ok: false, status: 'rejected' }], [503, { ok: false, status: 'unavailable' }]]) {
    it(`HTTP ${status} → ${expected.status}`, async () => {
      const fetchMock = answer(status);
      vi.stubGlobal('fetch', fetchMock);
      expect(await validateAccessCode(`  ${GUEST} `)).toEqual(expected);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toMatch(/\/api\/speech$/);
      expect(init.headers['x-study-code']).toBe(GUEST);
      expect(init.body).toBe('{}');
    });
  }

  it('a network failure is "unavailable"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    expect(await validateAccessCode(GUEST)).toEqual({ ok: false, status: 'unavailable' });
  });

  it('a code shorter than the guard accepts is refused without a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await validateAccessCode('short')).toEqual({ ok: false, status: 'invalid' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('credential error copy', () => {
  it('a refused guest code asks the carer to update it, and marks it', () => {
    saveAccess(GUEST);
    expect(credentialErrorCopy(named('StudyAccessError'))).toMatch(/no longer accepted — update it in Settings/);
    expect(loadAccess().status).toBe('rejected');
  });

  it('the daily cap says when it resets; unknown errors fall through', () => {
    expect(credentialErrorCopy(named('StudyLimitError'))).toMatch(/resets around midday NZ time/);
    expect(credentialErrorCopy(named('TypeError'))).toBeNull();
  });
});
