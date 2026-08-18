// Append study events.
//
// Batched and idempotent: the client retries on network failure and flushes a
// final batch via sendBeacon on unload, so the same (session, seq) pair can
// legitimately arrive twice. The unique index makes the second one a no-op
// rather than a duplicate row.
import { guard, jsonBody } from '../_lib/guard.js';
import { insertIgnoringConflicts, adminConfigured } from '../_lib/supabaseAdmin.js';

const MAX_BATCH = 100;
const MAX_PAYLOAD_CHARS = 20000;

export default async function handler(req, res) {
  // Metered on a separate, generous counter. Telemetry must not eat a
  // participant's AI budget — but leaving it unmetered made this an unbounded
  // write endpoint (100 events × 20 kB per request, unlimited rate), and the
  // first casualty of a full database is the study's own data.
  if (!(await guard(req, res, { allowBodyCode: true, meterSuffix: ':events', meterLimit: 5000 }))) return;
  // adminConfigured covers both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, so
  // this is the single place the response is sent — requireEnv would have
  // already replied, and a second send is a write-after-end.
  if (!adminConfigured) {
    console.error('[study] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured');
    res.status(503).json({ error: 'study backend not configured' });
    return;
  }

  // jsonBody, not req.body: the unload beacon sends text/plain to dodge a
  // preflight it cannot finish, so the platform hands it over unparsed.
  const { sessionId, participantCode, events } = jsonBody(req);
  if (!sessionId || !participantCode || !Array.isArray(events) || events.length === 0) {
    res.status(400).json({ error: 'sessionId, participantCode and events required' });
    return;
  }
  if (events.length > MAX_BATCH) {
    res.status(400).json({ error: `at most ${MAX_BATCH} events per request` });
    return;
  }

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const rows = [];
  for (const e of events) {
    if (!e || typeof e.kind !== 'string' || !Number.isInteger(e.seq)) continue;
    if (!UUID.test(String(e.eventUuid || ''))) continue;
    let payload = e.payload ?? {};
    // Guard against an unbounded transcript turning into an unbounded row.
    const json = JSON.stringify(payload);
    if (json.length > MAX_PAYLOAD_CHARS) {
      payload = { truncated: true, preview: json.slice(0, MAX_PAYLOAD_CHARS) };
    }
    rows.push({
      event_uuid: e.eventUuid,
      session_id: sessionId,
      participant_code: participantCode,
      seq: e.seq,
      kind: e.kind.slice(0, 60),
      arm: e.arm === 'A' || e.arm === 'B' ? e.arm : null,
      task_id: e.taskId ? String(e.taskId).slice(0, 40) : null,
      payload,
      client_ts: e.clientTs || null,
    });
  }

  if (rows.length === 0) {
    res.status(400).json({ error: 'no valid events' });
    return;
  }

  let inserted;
  try {
    inserted = await insertIgnoringConflicts('study_events', rows, 'event_uuid');
  } catch (err) {
    console.error(`[study] event insert failed: ${err?.message ?? err}`);
    // A 4xx from PostgREST will never succeed on retry; the client keeps
    // retrying 5xx forever, so a permanently-bad batch must not look transient.
    const status = err?.status && err.status >= 400 && err.status < 500 ? 400 : 500;
    res.status(status).json({ error: 'could not record events' });
    return;
  }

  // Report what landed, not what was offered — a silent drop used to be
  // indistinguishable from success on both ends.
  res.status(202).json({ received: rows.length, inserted });
}
