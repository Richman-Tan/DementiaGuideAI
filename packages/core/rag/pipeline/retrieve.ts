// The retrieval stage: embed the query, run the hybrid search over more
// candidates than are needed, stop one bulk source from filling the list, then
// (optionally) rerank and keep the top few.
//
// The same function serves a normal turn and a prefetch made while the person
// is still speaking, so the two cannot retrieve differently.
import { capBySourceFamily } from '../retrieval.js';
import type { Chunk, Providers, RetrievalConfig } from './types.ts';

export async function retrieve(
  query: string,
  providers: Pick<Providers, 'embed' | 'search' | 'rerank'>,
  config: RetrievalConfig,
  signal?: AbortSignal
): Promise<Chunk[]> {
  const embedding = await providers.embed(query, { inputType: 'query', signal });
  const candidates = await providers.search({
    embedding,
    queryText: query,
    matchCount: config.topK * config.oversample,
    minSimilarity: config.minSimilarity,
    signal,
  });

  if (!providers.rerank) {
    return capBySourceFamily(candidates, config.topK, config.maxPerSourceFamily) as Chunk[];
  }
  // Rerank a capped pool wider than topK, so the reranker has something to choose
  // between, then keep its best topK.
  const pool = capBySourceFamily(candidates, config.topK * 2, config.maxPerSourceFamily) as Chunk[];
  const ranked = await providers.rerank(query, pool, { signal });
  return ranked.slice(0, config.topK);
}
