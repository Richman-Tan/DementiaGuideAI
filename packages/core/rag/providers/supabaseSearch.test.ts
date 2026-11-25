import { createSupabaseSearch } from './supabaseSearch.ts';
import type { Fetch } from './http.ts';

describe('createSupabaseSearch', () => {
  it('calls the search function over REST and returns its rows', async () => {
    const rows = [{ id: 'kb-1', title: 't', content: 'c', similarity: 0.7 }];
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(rows), { status: 200 });
    }) as unknown as Fetch;
    const search = createSupabaseSearch({
      url: 'https://abc.supabase.co',
      key: 'anon-key',
      functionName: 'match_chunks_v2',
      fetch: fetchFn,
    });
    const signal = new AbortController().signal;

    const out = await search({
      embedding: [0.1, 0.2],
      queryText: 'sundowning',
      matchCount: 50,
      minSimilarity: 0.25,
      signal,
    });

    expect(out).toEqual(rows);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://abc.supabase.co/rest/v1/rpc/match_chunks_v2');
    expect(calls[0]?.init.headers).toEqual({
      'Content-Type': 'application/json',
      apikey: 'anon-key',
      Authorization: 'Bearer anon-key',
    });
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({
      query_embedding: [0.1, 0.2],
      query_text: 'sundowning',
      match_count: 50,
      min_similarity: 0.25,
    });
    expect(calls[0]?.init.signal).toBe(signal);
  });

  it('passes the vector/keyword mix when one is configured', async () => {
    let body: Record<string, unknown> = {};
    const fetchFn = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return new Response('[]', { status: 200 });
    }) as unknown as Fetch;
    const search = createSupabaseSearch({
      url: 'https://abc.supabase.co',
      key: 'k',
      functionName: 'match_chunks_v2',
      vectorWeight: 0.6,
      fetch: fetchFn,
    });
    await search({ embedding: [1], queryText: 'q', matchCount: 5, minSimilarity: 0.3 });
    expect(body).toEqual({
      query_embedding: [1],
      query_text: 'q',
      match_count: 5,
      min_similarity: 0.3,
      vector_weight: 0.6,
    });
  });

  it('reports the database error, naming the function', async () => {
    const fetchFn = (async () =>
      new Response('{"code":"PGRST203","message":"Could not choose the best candidate function"}', {
        status: 300,
      })) as unknown as Fetch;
    const search = createSupabaseSearch({
      url: 'https://abc.supabase.co',
      key: 'k',
      functionName: 'match_chunks',
      fetch: fetchFn,
    });
    await expect(
      search({ embedding: [1], queryText: 'q', matchCount: 5, minSimilarity: 0.25 })
    ).rejects.toThrow(
      'Knowledge-base search (match_chunks) failed (HTTP 300): PGRST203: Could not choose the best candidate function'
    );
  });
});
