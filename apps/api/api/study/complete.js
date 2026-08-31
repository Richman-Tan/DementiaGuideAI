// Mark a session finished — either completed normally or stopped early via the
// "I need to stop" control (docs/study/ethics/risk-and-distress-protocol.md §2).
import { guard } from '../_lib/guard.js';
import { updateWhere, adminConfigured } from '../_lib/supabaseAdmin.js';

export default async function handler(req, res) {
  if (!(await guard(req, res, { meter: false }))) return;
  // adminConfigured covers both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, so
  // this is the single place the response is sent — requireEnv would have
  // already replied, and a second send is a write-after-end.
  if (!adminConfigured) {
    console.error('[study] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured');
    res.status(503).json({ error: 'study backend not configured' });
    return;
  }

  const { sessionId, stoppedEarly = false } = req.body || {};
  if (!sessionId) {
    res.status(400).json({ error: 'sessionId required' });
    return;
  }

  try {
    await updateWhere(
      'study_sessions',
      { completed_at: new Date().toISOString(), stopped_early: Boolean(stoppedEarly) },
      `id=eq.${encodeURIComponent(sessionId)}`
    );
  } catch (err) {
    console.error(`[study] session complete failed: ${err?.message ?? err}`);
    res.status(500).json({ error: 'could not close session' });
    return;
  }

  res.status(200).json({ ok: true });
}
