// Where the server's real services are put together from its environment.
// Everything else in src/ receives them as arguments; this is the one place
// that knows which vendor does what and where the keys come from.
import Anthropic from '@anthropic-ai/sdk';
import type { Providers } from '../../../packages/core/rag/pipeline/types.ts';
import {
  createClaudeGenerate,
  createClaudeRewrite,
  createClaudeTriage,
} from '../../../packages/core/rag/providers/claude.ts';
import { createSupabaseSearch } from '../../../packages/core/rag/providers/supabaseSearch.ts';
import { createVoyage, VOYAGE_ATLAS_URL } from '../../../packages/core/rag/providers/voyage.ts';

export type Env = Record<string, string | undefined>;

/** What the turn endpoint cannot run without. */
const REQUIRED = [
  'ANTHROPIC_API_KEY',
  'VOYAGE_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

export const missingEnv = (env: Env): string[] => REQUIRED.filter((name) => !env[name]);

export function createProviders(env: Env): Providers {
  const missing = missingEnv(env);
  if (missing.length) throw new Error(`cannot build the providers: ${missing.join(', ')} not set`);

  const claude = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const voyage = createVoyage({
    apiKey: env.VOYAGE_API_KEY as string,
    baseUrl: env.VOYAGE_BASE_URL || VOYAGE_ATLAS_URL,
  });
  return {
    // Whole milliseconds: the timings go to clients and traces, and finer is noise.
    now: () => Math.round(performance.now()),
    embed: voyage.embed,
    search: createSupabaseSearch({
      url: env.SUPABASE_URL as string,
      key: env.SUPABASE_SERVICE_ROLE_KEY as string,
      // The function must read the column the embedding model above filled.
      functionName: env.KB_SEARCH_FUNCTION || 'match_chunks_v2',
    }),
    generate: createClaudeGenerate(claude),
    triage: createClaudeTriage(claude),
    rewrite: createClaudeRewrite(claude),
    // Off unless an evaluation shows it earns its latency.
    ...(env.KB_RERANK === 'on' ? { rerank: voyage.rerank } : {}),
  };
}
