import { retrieve } from './retrieve.ts';
import type { Chunk, RetrievalConfig, SearchRequest } from './types.ts';

const CONFIG: RetrievalConfig = {
  topK: 3,
  oversample: 10,
  minSimilarity: 0.25,
  maxPerSourceFamily: 2,
};

const chunk = (id: string, document_id: string | null = null): Chunk => ({
  id,
  title: `Title ${id}`,
  content: `Content ${id}`,
  document_id,
});

function fakes(candidates: Chunk[]) {
  const calls: { embed: unknown[]; search: SearchRequest[] } = { embed: [], search: [] };
  return {
    calls,
    providers: {
      embed: async (
        text: string,
        opts: { inputType: 'query' | 'document'; signal?: AbortSignal }
      ) => {
        calls.embed.push({ text, ...opts });
        return [0.1, 0.2];
      },
      search: async (request: SearchRequest) => {
        calls.search.push(request);
        return candidates;
      },
    },
  };
}

describe('retrieve', () => {
  it('embeds the query as a query and searches for topK × oversample candidates', async () => {
    const { providers, calls } = fakes([chunk('a'), chunk('b')]);
    const signal = new AbortController().signal;
    await retrieve('how do I manage sundowning?', providers, CONFIG, signal);
    expect(calls.embed).toEqual([
      { text: 'how do I manage sundowning?', inputType: 'query', signal },
    ]);
    expect(calls.search).toEqual([
      {
        embedding: [0.1, 0.2],
        queryText: 'how do I manage sundowning?',
        matchCount: 30,
        minSimilarity: 0.25,
        signal,
      },
    ]);
  });

  it('keeps the top K in the order the search ranked them', async () => {
    const { providers } = fakes([chunk('a'), chunk('b'), chunk('c'), chunk('d')]);
    const out = await retrieve('q', providers, CONFIG);
    expect(out.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('lets at most two passages through from the bulk iSupport source', async () => {
    const { providers } = fakes([
      chunk('i1', 'isupport-who'),
      chunk('i2', 'isupport-nz'),
      chunk('i3', 'isupport-who'),
      chunk('n1', 'carers-nz'),
      chunk('n2', 'health-nz'),
    ]);
    const out = await retrieve('q', providers, CONFIG);
    expect(out.map((c) => c.id)).toEqual(['i1', 'i2', 'n1']);
  });

  it('returns nothing when the search finds nothing', async () => {
    const { providers } = fakes([]);
    expect(await retrieve('q', providers, CONFIG)).toEqual([]);
  });

  it('with a reranker, reranks a pool twice the size and keeps its best K', async () => {
    const candidates = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => chunk(id));
    const { providers } = fakes(candidates);
    const seen: { query: string; ids: string[] }[] = [];
    const out = await retrieve(
      'q',
      {
        ...providers,
        rerank: async (query, pool) => {
          seen.push({ query, ids: pool.map((c) => c.id) });
          return [...pool].reverse();
        },
      },
      CONFIG
    );
    expect(seen).toEqual([{ query: 'q', ids: ['a', 'b', 'c', 'd', 'e', 'f'] }]);
    expect(out.map((c) => c.id)).toEqual(['f', 'e', 'd']);
  });

  it('applies the source cap before reranking, so a reranker cannot undo it', async () => {
    const { providers } = fakes([
      chunk('i1', 'isupport-who'),
      chunk('i2', 'isupport-who'),
      chunk('i3', 'isupport-who'),
      chunk('n1', 'carers-nz'),
    ]);
    const pools: string[][] = [];
    await retrieve(
      'q',
      {
        ...providers,
        rerank: async (_query, pool) => {
          pools.push(pool.map((c) => c.id));
          return pool;
        },
      },
      CONFIG
    );
    expect(pools).toEqual([['i1', 'i2', 'n1']]);
  });

  it('lets a failing provider reject, for the caller to decide what that means', async () => {
    const { providers } = fakes([]);
    await expect(
      retrieve(
        'q',
        { ...providers, embed: async () => Promise.reject(new Error('embed down')) },
        CONFIG
      )
    ).rejects.toThrow('embed down');
  });
});
