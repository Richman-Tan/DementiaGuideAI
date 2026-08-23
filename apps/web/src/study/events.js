// Study event capture.
//
// Unmoderated sessions have no observer, so anything not recorded here is lost:
// time on task, turn counts, which fallbacks fired, and the transcripts that
// task success is scored from. Events are batched, sequence-numbered, persisted
// across reloads, and retried — a participant on hotel wifi should still yield
// a complete record.
//
// Nothing is emitted outside a live study session, so the normal app is
// unaffected. See docs/study/ethics/data-management-plan.md for what is and is
// not collected.
import { loadStudy, saveStudy, nextSeq } from './studyStore.js';
import { apiUrl } from '../services/apiBase.js';

const ENDPOINT = apiUrl('/api/study/event');
const QUEUE_KEY = 'dg_study_queue';
const FLUSH_AFTER_MS = 2000;
const FLUSH_AT_COUNT = 20;
const MAX_BATCH = 100;
const MAX_QUEUE = 500; // backstop against an offline session growing unbounded

let timer = null;
let sending = false;
// Shrinks when the server permanently rejects a batch, so one malformed event
// can be isolated instead of taking the batch down with it. Reset on success.
let batchLimit = MAX_BATCH;

// crypto.randomUUID is unavailable on insecure origins in some browsers; the
// fallback only has to be collision-free within one participant's session.
function newUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

function readQueue() {
  try {
    const v = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeQueue(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE))); } catch { /* blocked */ }
}

/**
 * Record an event. Safe to call from anywhere — outside a study session it is a
 * no-op, so instrumentation can sit directly in shared code paths.
 */
export function emit(kind, { arm = null, taskId = null, ...payload } = {}) {
  const s = loadStudy();
  if (!s.sessionId || !s.accessCode) return;

  const q = readQueue();
  q.push({
    // Stable identity for deduplication, independent of localStorage state.
    // `seq` is ordering only — it restarts if storage is cleared, which is
    // exactly why it must not be the dedup key.
    eventUuid: newUuid(),
    seq: nextSeq(),
    kind,
    arm,
    taskId,
    payload,
    clientTs: new Date().toISOString(),
  });
  writeQueue(q);

  if (q.length >= FLUSH_AT_COUNT) {
    flush();
  } else if (!timer) {
    timer = setTimeout(() => { timer = null; flush(); }, FLUSH_AFTER_MS);
  }
}

/**
 * Send what is queued. Events stay queued on failure and are retried on the
 * next flush; the server deduplicates on (session, seq), so a retry that
 * actually landed the first time is harmless.
 */
export async function flush() {
  if (sending) return;
  const s = loadStudy();
  if (!s.sessionId || !s.accessCode) return;

  const q = readQueue();
  if (q.length === 0) return;

  const batch = q.slice(0, Math.max(1, Math.min(MAX_BATCH, batchLimit)));
  sending = true;
  try {
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-study-code': s.accessCode },
      body: JSON.stringify({
        sessionId: s.sessionId,
        participantCode: s.participantCode,
        events: batch,
      }),
    });
    if (!resp.ok) {
      // 4xx other than 429 means these events will never be accepted, and
      // keeping them would block every later flush behind a permanent failure.
      // But the whole batch is rarely at fault: the endpoint inserts the rows in
      // one statement, so a single event Postgres refuses — a stray NUL in a
      // transcript, a malformed client_ts — used to take up to 99 good events
      // with it. Halve instead of dropping, until the offender is alone and
      // provably the problem.
      if (resp.status >= 400 && resp.status < 500 && resp.status !== 429) {
        if (batch.length === 1) {
          console.warn(`[study] dropping 1 permanently rejected event (HTTP ${resp.status})`);
          removeSent(batch);
          batchLimit = MAX_BATCH;
        } else {
          batchLimit = Math.ceil(batch.length / 2);
          console.warn(`[study] batch rejected (HTTP ${resp.status}) — retrying in halves of ${batchLimit} to isolate the bad event`);
        }
      }
      return;
    }
    // Surface a partial write rather than assuming success — a silent drop used
    // to be indistinguishable from a clean flush.
    const body = await resp.json().catch(() => null);
    if (body && typeof body.inserted === 'number' && body.inserted < batch.length) {
      console.warn(`[study] ${batch.length - body.inserted} of ${batch.length} events were duplicates or rejected`);
    }
    removeSent(batch);
    batchLimit = MAX_BATCH;
  } catch (err) {
    console.warn(`[study] event flush failed (${err?.message ?? err}) — will retry`);
  } finally {
    sending = false;
    if (readQueue().length > 0 && !timer) {
      timer = setTimeout(() => { timer = null; flush(); }, FLUSH_AFTER_MS);
    }
  }
}

/**
 * Last-chance flush when the page is going away. `fetch` is cancelled on unload,
 * so this uses sendBeacon, which the browser completes in the background.
 * Content-Type must be a Blob type — a plain string beacon arrives as text/plain
 * and the endpoint would not parse it.
 */
// Remove by identity. Slicing by count races the unload flush: if that empties
// the queue mid-request and a new event arrives, a count-based slice would drop
// the new event instead of the sent one.
function removeSent(batch) {
  const sent = new Set(batch.map((e) => e.eventUuid));
  writeQueue(readQueue().filter((e) => !sent.has(e.eventUuid)));
}

export function flushOnUnload() {
  const s = loadStudy();
  const q = readQueue();
  if (!s.sessionId || !s.accessCode || q.length === 0) return;
  if (typeof navigator === 'undefined' || !navigator.sendBeacon) return;

  // sendBeacon cannot set headers, so the access code travels in the body and
  // the endpoint accepts it there as well as in the header.
  const blob = new Blob(
    [JSON.stringify({
      sessionId: s.sessionId,
      participantCode: s.participantCode,
      accessCode: s.accessCode,
      events: q.slice(0, MAX_BATCH),
    })],
    // text/plain, not application/json. The API is a different origin, and
    // application/json is not CORS-safelisted — the browser would demand a
    // preflight it cannot complete while the page is unloading, losing the
    // final batch precisely when there is no second chance to send it. The
    // endpoint parses the body itself (see jsonBody in _lib/guard.js).
    { type: 'text/plain;charset=UTF-8' }
  );
  // Deliberately does NOT clear the queue. sendBeacon returning true means the
  // request was queued for transfer, not that it arrived — and this runs on
  // every tab switch. The server deduplicates on event_uuid, so leaving them
  // queued costs a duplicate POST and buys us not losing the batch outright.
  navigator.sendBeacon(ENDPOINT, blob);
}

let installed = false;
export function installUnloadFlush() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('pagehide', flushOnUnload);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // Time on task is a wall clock. Without these markers a participant who
      // makes a cup of tea adds five minutes to the study's headline number with
      // nothing in the data to identify or defensibly exclude it.
      emit('tab_hidden', {});
      flushOnUnload();
    } else {
      emit('tab_visible', {});
    }
  });
}

/**
 * How many events are still waiting to reach the server.
 *
 * Read before clearing a device. resetQueue() below discards the queue outright,
 * and for a session that ran offline that queue is the entire record.
 */
export function pendingCount() {
  return readQueue().length;
}

export function resetQueue() {
  try { localStorage.removeItem(QUEUE_KEY); } catch { /* blocked */ }
  saveStudy({ seq: 0 });
}
