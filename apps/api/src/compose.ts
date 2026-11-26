// Puts the turn endpoint together from the server's environment: whether it is
// on, who may call it, what a day may cost, and what gets recorded.
// (composeSpeak.ts does the same for speech, in its own file so that the speech
// function's bundle does not carry the model SDK.)
//
// It answers 503 unless TURN_ENDPOINT is "on" and every key it needs is set.
// An endpoint that spends money on each call stays shut until it is switched
// on deliberately.
import { pipelineConfig } from '../../../packages/core/rag/pipelineConfig.ts';
import { createAdmission, dailyLimit } from './admission.ts';
import type { Handler } from './http.ts';
import { createProviders, missingEnv } from './providers.ts';
import type { Env } from './providers.ts';
import { createSessionVerifier } from './session.ts';
import { toTraceRow } from './trace.ts';
import type { TraceRow } from './trace.ts';
import { createTurnHandler } from './turn.ts';

/** Used when the environment sets no limit. Chosen to be cautious; see the README for what they cost. */
export const DEFAULT_LIMITS = { visitorDaily: 20, globalDaily: 100 };

export interface Backend {
  /** Calls a Postgres function with the service role. */
  rpc(fn: string, args: Record<string, unknown>): Promise<unknown>;
  /** Records a meter reading. Never throws. */
  recordUsage(reading: { userId: string; kind: string; units: number; model: string }): void;
}

/** What the turn endpoint needs beyond that. */
export interface TurnBackend extends Backend {
  /** Records what a turn did (see trace.ts). Never throws. */
  recordTrace(row: TraceRow): void;
}

export function composeTurnHandler(env: Env, backend: TurnBackend): Handler {
  const wanted = env.TURN_ENDPOINT === 'on';
  const missing = missingEnv(env);
  if (wanted && missing.length) {
    console.error(`[turn] TURN_ENDPOINT is on but ${missing.join(', ')} is not set; staying off`);
  }
  const enabled = wanted && missing.length === 0;

  return createTurnHandler({
    providers: enabled ? createProviders(env) : null,
    verifySession: createSessionVerifier({
      supabaseUrl: env.SUPABASE_URL ?? '',
      serviceKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    }),
    config: pipelineConfig(env.PIPELINE_MODEL ? { model: env.PIPELINE_MODEL } : {}),
    admit: createAdmission({
      // The counter is the one the access codes used; its name is historical.
      bump: async (key, limit) =>
        (await backend.rpc('bump_study_usage', { p_code: key, p_limit: limit })) === true,
      visitorDailyLimit: dailyLimit(env.TURN_VISITOR_DAILY_LIMIT, DEFAULT_LIMITS.visitorDaily),
      globalDailyLimit: dailyLimit(env.TURN_GLOBAL_DAILY_LIMIT, DEFAULT_LIMITS.globalDaily),
    }),
    onFinished(summary) {
      const { userId, usage } = summary;
      // A turn that failed or was interrupted is worth a trace too: those are
      // the ones most worth knowing about. TURN_TRACES=off keeps none.
      if (env.TURN_TRACES !== 'off') backend.recordTrace(toTraceRow(summary));
      if (!usage) return;
      backend.recordUsage({
        userId,
        kind: 'chat',
        units:
          usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens,
        model: usage.model,
      });
    },
  });
}
