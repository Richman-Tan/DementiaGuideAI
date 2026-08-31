// Record how far a participant has got.
//
// Resume is otherwise only as good as the participant's localStorage — and the
// case that most needs resume (cleared storage, private window, a second device)
// is exactly the case where localStorage is gone. Without a server-side record
// the session restarts from the beginning or wedges.
//
// Fire-and-forget from the client, so this must be cheap and must never be the
// thing that blocks a participant moving to the next screen.
import { guard } from '../_lib/guard.js';
import { updateWhere, adminConfigured } from '../_lib/supabaseAdmin.js';

const STEPS = new Set([
  'intro', 'info', 'group', 'consent', 'setup', 'background',
  'armbrief', 'task', 'posttask', 'sus', 'likert',
  'recheck', 'debrief', 'done', 'stopped',
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (!(await guard(req, res, { meter: false }))) return;

  const { sessionId, step, stageIndex, taskIndex } = req.body || {};

  // Validate first: a malformed request is a 400 regardless of configuration,
  // and PostgREST answers a bad uuid with a 400 that the helper would otherwise
  // surface as a 500 — which the client's retry logic treats as transient.
  if (!UUID.test(String(sessionId || ''))) {
    res.status(400).json({ error: 'valid sessionId required' });
    return;
  }
  if (!STEPS.has(step)) {
    res.status(400).json({ error: 'unknown step' });
    return;
  }

  if (!adminConfigured) {
    console.error('[study] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured');
    res.status(503).json({ error: 'study backend not configured' });
    return;
  }

  try {
    await updateWhere(
      'study_sessions',
      {
        step,
        stage_index: Number.isInteger(stageIndex) ? stageIndex : 0,
        task_index: Number.isInteger(taskIndex) ? taskIndex : 0,
      },
      `id=eq.${encodeURIComponent(sessionId)}`
    );
  } catch (err) {
    console.error(`[study] progress update failed: ${err?.message ?? err}`);
    res.status(500).json({ error: 'could not record progress' });
    return;
  }

  res.status(204).end();
}
