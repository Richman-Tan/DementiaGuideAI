// Embeddings and reranking from Voyage AI.
//
// Anthropic has no embedding model of its own and points to Voyage. A key made
// in MongoDB Atlas (a "model API key") works against ai.mongodb.com; a key
// issued by Voyage directly works against api.voyageai.com. The two serve the
// same API, so the base URL is configuration.
//
// The query and the passages must be embedded with different `input_type`
// values: Voyage prepends a different instruction to each, and retrieval
// quality depends on it.
import type { Chunk, Providers } from '../pipeline/types.ts';
import { postJson } from './http.ts';
import type { Fetch } from './http.ts';

export const VOYAGE_ATLAS_URL = 'https://ai.mongodb.com/v1';

export interface VoyageOptions {
  apiKey: string;
  baseUrl?: string;
  embeddingModel?: string;
  /** Must match the width of the vector column the embeddings are stored in. */
  dimensions?: 256 | 512 | 1024 | 2048;
  rerankModel?: string;
  fetch?: Fetch;
}

interface EmbeddingsResponse {
  data: { embedding: number[]; index: number }[];
}

interface RerankResponse {
  /** Sorted by relevance, best first. `index` points into the documents sent. */
  data: { index: number; relevance_score: number }[];
}

export function createVoyage({
  apiKey,
  baseUrl = VOYAGE_ATLAS_URL,
  embeddingModel = 'voyage-4',
  dimensions = 1024,
  rerankModel = 'rerank-3',
  fetch: fetchFn = globalThis.fetch,
}: VoyageOptions): Required<Pick<Providers, 'embed' | 'rerank'>> & {
  embedMany(
    texts: string[],
    inputType: 'query' | 'document',
    signal?: AbortSignal
  ): Promise<number[][]>;
} {
  const headers = { Authorization: `Bearer ${apiKey}` };

  const embedMany = async (
    texts: string[],
    inputType: 'query' | 'document',
    signal?: AbortSignal
  ) => {
    const response = await postJson<EmbeddingsResponse>(
      fetchFn,
      'Voyage embeddings',
      `${baseUrl}/embeddings`,
      headers,
      { input: texts, model: embeddingModel, input_type: inputType, output_dimension: dimensions },
      signal
    );
    // The API does not promise to return them in the order sent.
    const ordered = [...response.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
    if (ordered.length !== texts.length || ordered.some((e) => e.length !== dimensions)) {
      throw new Error(
        `Voyage embeddings returned ${ordered.length} vector(s) of width ${ordered[0]?.length ?? 0}; expected ${texts.length} of width ${dimensions}`
      );
    }
    return ordered;
  };

  return {
    embedMany,

    async embed(text, { inputType, signal }) {
      const [embedding] = await embedMany([text], inputType, signal);
      return embedding as number[];
    },

    async rerank(query, chunks, { signal }) {
      if (chunks.length < 2) return chunks;
      const response = await postJson<RerankResponse>(
        fetchFn,
        'Voyage rerank',
        `${baseUrl}/rerank`,
        headers,
        {
          query,
          // The same text the passage was embedded from: its title, then its content.
          documents: chunks.map((c) => `${c.title}. ${c.content}`),
          model: rerankModel,
        },
        signal
      );
      const ranked = response.data
        .map((r) => chunks[r.index])
        .filter((c): c is Chunk => c !== undefined);
      if (ranked.length !== chunks.length) {
        throw new Error(`Voyage rerank returned ${ranked.length} of ${chunks.length} passages`);
      }
      return ranked;
    },
  };
}
