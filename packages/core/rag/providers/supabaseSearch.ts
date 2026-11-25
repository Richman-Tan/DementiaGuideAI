// The hybrid search over the knowledge base: a Postgres function that mixes
// vector similarity with keyword rank, called through Supabase's REST interface.
//
// Plain fetch on purpose, not the Supabase client: this runs in a server
// function and in Node scripts, and needs exactly one call.
import type { Chunk, Providers } from '../pipeline/types.ts';
import { postJson } from './http.ts';
import type { Fetch } from './http.ts';

export interface SupabaseSearchOptions {
  /** The project URL, e.g. https://abc.supabase.co */
  url: string;
  /** The anon key (row-level security applies) or the service-role key on a server. */
  key: string;
  /**
   * The search function. The embedding passed in must come from the model that
   * filled the column this function reads.
   */
  functionName: string;
  /**
   * The share of the score that comes from vector similarity (the rest is
   * keyword rank). Only match_chunks_v2 takes it; leave it unset for the
   * function's own default.
   */
  vectorWeight?: number;
  fetch?: Fetch;
}

export function createSupabaseSearch({
  url,
  key,
  functionName,
  vectorWeight,
  fetch: fetchFn = globalThis.fetch,
}: SupabaseSearchOptions): Providers['search'] {
  return ({ embedding, queryText, matchCount, minSimilarity, signal }) =>
    postJson<Chunk[]>(
      fetchFn,
      `Knowledge-base search (${functionName})`,
      `${url}/rest/v1/rpc/${functionName}`,
      { apikey: key, Authorization: `Bearer ${key}` },
      {
        query_embedding: embedding,
        query_text: queryText,
        match_count: matchCount,
        min_similarity: minSimilarity,
        ...(vectorWeight === undefined ? {} : { vector_weight: vectorWeight }),
      },
      signal
    );
}
