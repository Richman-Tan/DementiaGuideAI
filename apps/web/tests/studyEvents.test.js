// @vitest-environment jsdom
// Study event capture (study/events.js): batching, retry and the unload flush.
//
// Unmoderated sessions have no observer, so an event this module loses is lost
// for good. These pin how it batches and retries, and how it copes with
// browsers that lack crypto.randomUUID (insecure origins) or
// navigator.sendBeacon. All of that is timing, so it is tested here on a fake
// clock rather than left to whatever the e2e runs happen to hit.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// events.js keeps its flush timer and in-flight flag in module state, so each
// test gets a fresh copy: a timer left over from one test would otherwise
// suppress the next one's.
let saveStudy, emit, flush, newUuid, flushOnUnload, installUnloadFlush, pendingCount;

// The API's own check (apps/api/api/study/event.js): an event whose id fails it
// is dropped server-side, so every id the client makes has to pass.
const API_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUEUE_KEY = 'dg_study_queue';
const SESSION = { sessionId: '11111111-2222-4333-8444-555555555555', accessCode: 'test-access-code', participantCode: 'P07', step: 'task' };

const accepted = (inserted) => ({ ok: true, status: 202, json: async () => ({ received: inserted, inserted }) });
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const sent = (call) => JSON.parse(call[1].body).events;

beforeEach(async () => {
  vi.useFakeTimers(); // the flush timer only fires when a test advances the clock
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.resetModules();
  ({ saveStudy } = await import('../src/study/studyStore.js'));
  ({ emit, flush, newUuid, flushOnUnload, installUnloadFlush, pendingCount } = await import('../src/study/events.js'));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('newUuid', () => {
  it('uses crypto.randomUUID where the browser has it', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'from-crypto' });
    expect(newUuid()).toBe('from-crypto');
  });

  it('falls back to a v4-shaped id the API accepts when it does not', () => {
    vi.stubGlobal('crypto', {});
    const ids = Array.from({ length: 50 }, () => newUuid());
    for (const id of ids) {
      expect(id).toMatch(API_UUID);
      expect(id[14]).toBe('4'); // version nibble
      expect(id[19]).toBe('a'); // RFC 4122 variant
    }
    // It is the dedup key server-side, so a collision would silently drop an event.
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('also falls back when there is no crypto object at all', () => {
    vi.stubGlobal('crypto', undefined);
    expect(newUuid()).toMatch(API_UUID);
  });
});

describe('the stored queue', () => {
  it.each([['unparseable', '{oops'], ['not a list', '{"kind":"turn"}']])('%s storage reads as empty, and recording carries on', (_label, raw) => {
    saveStudy(SESSION);
    localStorage.setItem(QUEUE_KEY, raw);
    expect(pendingCount()).toBe(0);
    emit('turn', {});
    expect(pendingCount()).toBe(1);
  });
});

describe('sending', () => {
  beforeEach(() => { saveStudy(SESSION); });

  it('a few events wait for the 2 s timer and then go out together', async () => {
    fetch.mockResolvedValue(accepted(3));
    for (let i = 0; i < 3; i++) emit('page_view', { i });
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sent(fetch.mock.calls[0])).toHaveLength(3);
    expect(pendingCount()).toBe(0);
  });

  it('the 20th queued event sends the batch at once, without waiting for the timer', async () => {
    for (let i = 0; i < 19; i++) emit('page_view', { i });
    expect(fetch).not.toHaveBeenCalled();
    emit('page_view', { i: 19 });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/study/event');
    expect(init.headers['x-study-code']).toBe('test-access-code');
    expect(sent(fetch.mock.calls[0]).map((e) => e.payload.i)).toEqual([...Array(20).keys()]);
    await vi.advanceTimersByTimeAsync(0); // let the offline rejection settle
    expect(pendingCount()).toBe(20); // kept for the retry
  });

  it('a flush while one is in flight sends nothing more', async () => {
    const reply = deferred();
    fetch.mockReturnValue(reply.promise);
    emit('turn', {});
    const first = flush();
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    reply.resolve(accepted(1));
    await first;
    expect(pendingCount()).toBe(0);
  });

  it('an event recorded while a batch is in flight survives that batch’s success', async () => {
    const reply = deferred();
    fetch.mockReturnValue(reply.promise);
    emit('turn', { n: 1 });
    const inFlight = flush();
    emit('turn', { n: 2 });
    reply.resolve(accepted(1));
    await inFlight;
    expect(pendingCount()).toBe(1); // removed by identity, not by count
  });

  it('a failed flush retries by itself 2 s later, and stops once the queue is empty', async () => {
    fetch.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(accepted(1));
    emit('turn', {});
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(pendingCount()).toBe(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('will retry'));

    await vi.advanceTimersByTimeAsync(2000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(pendingCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('reports a partial write, and clears what was sent either way', async () => {
    fetch.mockResolvedValue(accepted(1));
    emit('turn', {});
    emit('turn', {});
    await flush();
    expect(console.warn).toHaveBeenCalledWith('[study] 1 of 2 events were duplicates or rejected');
    expect(pendingCount()).toBe(0);
  });

  it('an accepted reply without a JSON body still counts as sent', async () => {
    fetch.mockResolvedValue({ ok: true, status: 202, json: async () => { throw new SyntaxError('no body'); } });
    emit('turn', {});
    await flush();
    expect(console.warn).not.toHaveBeenCalled();
    expect(pendingCount()).toBe(0);
  });

  it('makes no request without a live session or with nothing queued', async () => {
    await flush(); // session, empty queue
    localStorage.clear();
    localStorage.setItem(QUEUE_KEY, JSON.stringify([{ eventUuid: newUuid(), seq: 1, kind: 'turn' }]));
    await flush(); // queue, no session
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('flushOnUnload', () => {
  it('beacons the queue as text/plain and keeps it until a normal flush confirms it', () => {
    saveStudy(SESSION);
    emit('turn', { arm: 'A' });
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { sendBeacon });

    flushOnUnload();

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, blob] = sendBeacon.mock.calls[0];
    expect(url).toBe('/api/study/event');
    expect(blob.type).toBe('text/plain;charset=utf-8');
    expect(pendingCount()).toBe(1);
  });

  it('without sendBeacon, does nothing and keeps the queue for the next flush', () => {
    saveStudy(SESSION);
    emit('turn', { arm: 'A' });
    vi.stubGlobal('navigator', { userAgent: 'an old browser' });

    expect(() => flushOnUnload()).not.toThrow();
    expect(pendingCount()).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends nothing outside a session or with an empty queue', () => {
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { sendBeacon });
    flushOnUnload(); // no session
    saveStudy(SESSION);
    flushOnUnload(); // session, empty queue
    expect(sendBeacon).not.toHaveBeenCalled();
  });
});

describe('installUnloadFlush', () => {
  // One test: the listeners it adds live on the shared jsdom window and
  // document, so a second install in another test would add a second set.
  it('beacons on pagehide and on hiding the tab, marks hidden/visible time, and installs once', () => {
    saveStudy(SESSION);
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { sendBeacon });
    let visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
    const kinds = () => JSON.parse(localStorage.getItem(QUEUE_KEY)).map((e) => e.kind);

    installUnloadFlush();
    installUnloadFlush();

    emit('turn', {});
    window.dispatchEvent(new Event('pagehide'));
    expect(sendBeacon).toHaveBeenCalledTimes(1);

    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(kinds()).toEqual(['turn', 'tab_hidden']);
    expect(sendBeacon).toHaveBeenCalledTimes(2);

    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(kinds()).toEqual(['turn', 'tab_hidden', 'tab_visible']);
    expect(sendBeacon).toHaveBeenCalledTimes(2);
  });
});
