// Puts the speech endpoint together from the server's environment, as
// compose.ts does for turns. It answers 503 unless SPEAK_ENDPOINT is "on" and
// every key it needs is set.
import { createAdmission, dailyLimit } from './admission.ts';
import type { Backend } from './compose.ts';
import type { Handler } from './http.ts';
import type { Env } from './providers.ts';
import { createSessionVerifier } from './session.ts';
import { createSpeakHandler } from './speak.ts';

/**
 * Used when the environment sets no limit. A turn's spoken lead is a sentence or two, sent a
 * sentence at a time, so speech is allowed three requests for each turn.
 */
export const DEFAULT_SPEAK_LIMITS = { visitorDaily: 60, globalDaily: 300 };

const SPEAK_REQUIRED = ['ELEVENLABS_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

export function composeSpeakHandler(env: Env, backend: Backend): Handler {
  const wanted = env.SPEAK_ENDPOINT === 'on';
  const missing = SPEAK_REQUIRED.filter((name) => !env[name]);
  if (wanted && missing.length) {
    console.error(`[speak] SPEAK_ENDPOINT is on but ${missing.join(', ')} is not set; staying off`);
  }
  const enabled = wanted && missing.length === 0;

  return createSpeakHandler({
    apiKey: enabled ? (env.ELEVENLABS_API_KEY as string) : null,
    verifySession: createSessionVerifier({
      supabaseUrl: env.SUPABASE_URL ?? '',
      serviceKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    }),
    admit: createAdmission({
      scope: 'speak',
      bump: async (key, limit) =>
        (await backend.rpc('bump_study_usage', { p_code: key, p_limit: limit })) === true,
      visitorDailyLimit: dailyLimit(
        env.SPEAK_VISITOR_DAILY_LIMIT,
        DEFAULT_SPEAK_LIMITS.visitorDaily
      ),
      globalDailyLimit: dailyLimit(env.SPEAK_GLOBAL_DAILY_LIMIT, DEFAULT_SPEAK_LIMITS.globalDaily),
    }),
    onSpoken({ userId, chars, model }) {
      backend.recordUsage({ userId, kind: 'tts', units: chars, model });
    },
  });
}
