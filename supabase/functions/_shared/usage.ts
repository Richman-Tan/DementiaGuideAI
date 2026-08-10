// Logs one usage_events row. Track-and-display only for now (see
// scripts/migrations/2026-08-10_auth_and_usage.sql) — this never blocks a
// request, so a logging failure is swallowed rather than failing the whole
// proxied call. If enforcement is added later, that check happens *before*
// the provider call, separately from this best-effort log-after.
import { serviceClient } from './auth.ts';

export type UsageKind = 'chat' | 'embedding' | 'tts' | 'whisper';

export async function logUsage(userId: string, kind: UsageKind, units: number) {
  try {
    const supabase = serviceClient();
    const { error } = await supabase.from('usage_events').insert({ user_id: userId, kind, units });
    if (error) console.error(`[usage] insert failed (${kind}):`, error.message);
  } catch (err) {
    console.error(`[usage] logUsage threw (${kind}):`, err);
  }
}
