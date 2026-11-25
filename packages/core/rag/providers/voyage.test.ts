import { createVoyage, VOYAGE_ATLAS_URL } from './voyage.ts';
import type { Fetch } from './http.ts';
import type { Chunk } from '../pipeline/types.ts';

const vector = (width: number, fill = 0.5) => Array.from({ length: width }, () => fill);

function fakeFetch(reply: (url: string, body: Record<string, unknown>) => unknown, status = 200) {
  const calls: { url: string; headers: unknown; body: Record<string, unknown>; signal: unknown }[] =
    [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    calls.push({ url, headers: init.headers, body, signal: init.signal });
    return new Response(JSON.stringify(reply(url, body)), { status });
  }) as unknown as Fetch;
  return { fetchFn, calls };
}

const chunk = (id: string): Chunk => ({ id, title: `Title ${id}`, content: `Content ${id}` });

describe('createVoyage: embed', () => {
  it('embeds one text with the input type, model and width, against the Atlas endpoint', async () => {
    const { fetchFn, calls } = fakeFetch(() => ({ data: [{ embedding: vector(1024), index: 0 }] }));
    const voyage = createVoyage({ apiKey: 'key-1', fetch: fetchFn });
    const signal = new AbortController().signal;

    const out = await voyage.embed('how do I manage sundowning?', { inputType: 'query', signal });

    expect(out).toHaveLength(1024);
    expect(calls).toEqual([
      {
        url: `${VOYAGE_ATLAS_URL}/embeddings`,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer key-1' },
        body: {
          input: ['how do I manage sundowning?'],
          model: 'voyage-4',
          input_type: 'query',
          output_dimension: 1024,
        },
        signal,
      },
    ]);
  });

  it('uses the configured endpoint, model and width', async () => {
    const { fetchFn, calls } = fakeFetch(() => ({ data: [{ embedding: vector(512), index: 0 }] }));
    const voyage = createVoyage({
      apiKey: 'k',
      baseUrl: 'https://api.voyageai.com/v1',
      embeddingModel: 'voyage-4-large',
      dimensions: 512,
      fetch: fetchFn,
    });
    await voyage.embed('passage text', { inputType: 'document' });
    expect(calls[0]?.url).toBe('https://api.voyageai.com/v1/embeddings');
    expect(calls[0]?.body).toMatchObject({
      model: 'voyage-4-large',
      input_type: 'document',
      output_dimension: 512,
    });
  });

  it('returns a batch in the order the texts were sent, whatever order the reply uses', async () => {
    const { fetchFn } = fakeFetch(() => ({
      data: [
        { embedding: vector(256, 2), index: 1 },
        { embedding: vector(256, 1), index: 0 },
      ],
    }));
    const voyage = createVoyage({ apiKey: 'k', dimensions: 256, fetch: fetchFn });
    const out = await voyage.embedMany(['first', 'second'], 'document');
    expect(out.map((e) => e[0])).toEqual([1, 2]);
  });

  it.each([
    ['too few vectors', { data: [] }, 'returned 0 vector(s) of width 0; expected 1 of width 1024'],
    [
      'a vector of the wrong width',
      { data: [{ embedding: vector(1536), index: 0 }] },
      'returned 1 vector(s) of width 1536; expected 1 of width 1024',
    ],
  ])('refuses a reply with %s, which would corrupt the search', async (_n, reply, message) => {
    const { fetchFn } = fakeFetch(() => reply);
    const voyage = createVoyage({ apiKey: 'k', fetch: fetchFn });
    await expect(voyage.embed('q', { inputType: 'query' })).rejects.toThrow(message);
  });

  it('reports why the service refused', async () => {
    const { fetchFn } = fakeFetch(() => ({ detail: 'Provided API key is invalid.' }), 401);
    const voyage = createVoyage({ apiKey: 'bad', fetch: fetchFn });
    await expect(voyage.embed('q', { inputType: 'query' })).rejects.toThrow(
      'Voyage embeddings failed (HTTP 401): Provided API key is invalid.'
    );
  });
});

describe('createVoyage: rerank', () => {
  it('sends the query and each passage as title then content, and returns them best first', async () => {
    const { fetchFn, calls } = fakeFetch(() => ({
      data: [
        { index: 2, relevance_score: 0.9 },
        { index: 0, relevance_score: 0.4 },
        { index: 1, relevance_score: 0.1 },
      ],
    }));
    const voyage = createVoyage({ apiKey: 'key-1', fetch: fetchFn });
    const signal = new AbortController().signal;

    const out = await voyage.rerank('q', [chunk('a'), chunk('b'), chunk('c')], { signal });

    expect(out.map((c) => c.id)).toEqual(['c', 'a', 'b']);
    expect(calls).toEqual([
      {
        url: `${VOYAGE_ATLAS_URL}/rerank`,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer key-1' },
        body: {
          query: 'q',
          documents: ['Title a. Content a', 'Title b. Content b', 'Title c. Content c'],
          model: 'rerank-3',
        },
        signal,
      },
    ]);
  });

  it('uses the configured reranker', async () => {
    const { fetchFn, calls } = fakeFetch(() => ({
      data: [
        { index: 0, relevance_score: 0.9 },
        { index: 1, relevance_score: 0.1 },
      ],
    }));
    const voyage = createVoyage({ apiKey: 'k', rerankModel: 'rerank-3-lite', fetch: fetchFn });
    await voyage.rerank('q', [chunk('a'), chunk('b')], {});
    expect(calls[0]?.body.model).toBe('rerank-3-lite');
  });

  it.each([[[]], [[chunk('only')]]])(
    'does not call the service for fewer than two passages',
    async (chunks) => {
      const { fetchFn, calls } = fakeFetch(() => ({ data: [] }));
      const voyage = createVoyage({ apiKey: 'k', fetch: fetchFn });
      expect(await voyage.rerank('q', chunks, {})).toBe(chunks);
      expect(calls).toEqual([]);
    }
  );

  it('refuses a reply that drops a passage or names one that was not sent', async () => {
    const { fetchFn } = fakeFetch(() => ({
      data: [
        { index: 0, relevance_score: 0.9 },
        { index: 7, relevance_score: 0.5 },
      ],
    }));
    const voyage = createVoyage({ apiKey: 'k', fetch: fetchFn });
    await expect(voyage.rerank('q', [chunk('a'), chunk('b')], {})).rejects.toThrow(
      'Voyage rerank returned 1 of 2 passages'
    );
  });
});

describe('createVoyage', () => {
  it('uses the global fetch unless one is supplied', async () => {
    const original = globalThis.fetch;
    const seen: string[] = [];
    globalThis.fetch = (async (url: string) => {
      seen.push(url);
      return new Response(JSON.stringify({ data: [{ embedding: vector(1024), index: 0 }] }), {
        status: 200,
      });
    }) as unknown as Fetch;
    try {
      await createVoyage({ apiKey: 'k' }).embed('q', { inputType: 'query' });
    } finally {
      globalThis.fetch = original;
    }
    expect(seen).toEqual([`${VOYAGE_ATLAS_URL}/embeddings`]);
  });
});
