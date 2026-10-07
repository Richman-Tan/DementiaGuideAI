// Guest access codes: an invited carer uses the whole app through the credential
// proxy with no study session. Exercised through the real stores, transport and
// emit(), with localStorage and fetch stubbed.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openaiTransport, elevenTransport, transportKind, hasCredentials, validateAccessCode } from '../src/services/transport.js';
import { saveAccess, loadAccess, markAccessRejected, clearAccess, guestAccessCode } from '../src/state/accessStore.js';
import { saveKeys } from '../src/state/keysStore.js';
import { saveStudy, clearStudy } from '../src/study/studyStore.js';
import { credentialErrorCopy } from '../src/services/credentialErrorCopy.js';
import { emit } from '../src/study/events.js';

const GUEST = 'guest-access-code-0001';
const STUDY = 'study-access-code-0001';

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

describe('transport precedence: personal key → study session → guest code → none', () => {
  it('with nothing stored the app has no credentials (mock mode)', () => {
    expect(openaiTransport()).toBeNull();
    expect(transportKind()).toBe('none');
    expect(hasCredentials()).toBe(false);
  });

  it('a guest code alone proxies with the code in x-study-code', () => {
    saveAccess(GUEST);
    expect(openaiTransport()).toEqual({ proxied: true, guest: true, headers: { 'x-study-code': GUEST } });
    expect(transportKind()).toBe('guest');
    expect(hasCredentials()).toBe(true);
  });

  it('a personal OpenAI key beats a guest code', () => {
    saveAccess(GUEST);
    saveKeys({ openai: 'sk-personal', eleven: '', azure: '' });
    expect(openaiTransport().proxied).toBe(false);
    expect(transportKind()).toBe('key');
  });

  it('a live study session beats a guest code', () => {
    saveAccess(GUEST);
    saveStudy({ sessionId: '11111111-2222-3333-4444-555555555555', accessCode: STUDY });
    expect(openaiTransport().headers['x-study-code']).toBe(STUDY);
    expect(transportKind()).toBe('study');
  });

  it('a stale study code with no session never proxies on its own', () => {
    saveStudy({ accessCode: STUDY });
    expect(openaiTransport()).toBeNull();
    saveAccess(GUEST);
    expect(openaiTransport().headers['x-study-code']).toBe(GUEST);
  });

  it('ElevenLabs uses the guest code only when there is no personal OpenAI key', () => {
    saveAccess(GUEST);
    expect(elevenTransport().headers['x-study-code']).toBe(GUEST);
    saveKeys({ openai: 'sk-personal', eleven: '', azure: '' });
    expect(elevenTransport()).toBeNull();
  });

  it('clearing a study leaves the guest code in place', () => {
    saveAccess(GUEST);
    saveStudy({ sessionId: '11111111-2222-3333-4444-555555555555', accessCode: STUDY });
    clearStudy();
    expect(guestAccessCode()).toBe(GUEST);
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
    expect(credentialErrorCopy(named('StudyAccessError'), 'guest')).toMatch(/no longer accepted — update it in Settings/);
    expect(loadAccess().status).toBe('rejected');
  });

  it('a refused study code keeps the invitation-email wording', () => {
    expect(credentialErrorCopy(named('StudyAccessError'), 'study')).toMatch(/invitation email/);
  });

  it('the daily cap says when it resets; unknown errors fall through', () => {
    expect(credentialErrorCopy(named('StudyLimitError'), 'guest')).toMatch(/resets around midday NZ time/);
    expect(credentialErrorCopy(named('TypeError'), 'guest')).toBeNull();
  });
});

describe('guest use is not a study', () => {
  it('nothing reaches the study event queue', () => {
    saveAccess(GUEST);
    emit('turn', { question: 'How do I find respite care?' });
    expect(globalThis.localStorage.getItem('dg_study_queue')).toBeNull();
  });
});
