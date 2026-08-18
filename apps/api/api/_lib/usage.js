// Usage metering.
//
// One row per proxied provider call. `units` means different things per kind
// (tokens for chat and embeddings, characters for speech, seconds for whisper)
// — a raw meter reading, not a cost. Cost is computed when displayed, so a
// price change never requires a backfill.
//
// Fire-and-forget and never throws: a metering failure must not cost a user
// their answer. The hard spend cap on the provider account is the backstop that
// does not depend on this working.
import { insertIgnoringConflicts, adminConfigured } from './supabaseAdmin.js';

export function recordUsage({ userId, kind, units, model }) {
  if (!adminConfigured || !userId) return;
  if (!Number.isFinite(units) || units < 0) return;

  const row = { user_id: userId, kind, units };
  if (model) row.model = String(model).slice(0, 60);

  insertIgnoringConflicts('usage_events', [row], 'id').catch(async (err) => {
    // A schema mismatch on the metering column must not lose the reading. The
    // live table predates the `model` column (see the 2026-08-18 migration), so
    // retry without it rather than dropping the row.
    if (err?.status === 400 && row.model) {
      delete row.model;
      try {
        await insertIgnoringConflicts('usage_events', [row], 'id');
        console.warn('[usage] recorded without `model` — run the backend_v1 migration');
        return;
      } catch { /* fall through to the warning below */ }
    }
    console.warn(`[usage] could not record ${kind}: ${err?.message ?? err}`);
  });
}
