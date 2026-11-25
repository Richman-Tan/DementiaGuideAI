// The turn endpoint as it is deployed: put together from an environment, with
// the real Anthropic SDK client and the real provider adapters. Only the network
// is replaced, by a fetch that answers as each service would.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { composeTurnHandler, DEFAULT_LIMITS } from '../src/compose.ts';
import type { Backend } from '../src/compose.ts';
import { createProviders, missingEnv } from '../src/providers.ts';
import type { ApiRequest, ApiResponse } from '../src/http.ts';
import { load, makeReq, makeRes, ORIGIN } from './helpers.js';

const ENV = {
  TURN_ENDPOINT: 'on',
  ANTHROPIC_API_KEY: 'anthropic-key',
  VOYAGE_API_KEY: 'voyage-key',
  SUPABASE_URL: 'https://db.example',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
};

const CHUNK = {
  id: 'kb-1',
  title: 'sundowning',
  display_title: 'Evening restlessness',
  content: 'Keep late afternoons calm.',
  source_org: 'Alzheimers NZ',
  source_url: null,
  document_id: 'curated',
  similarity: 0.7,
};

const OTHER_CHUNK = {
  ...CHUNK,
  id: 'kb-2',
  title: 'carer-support',
  display_title: null,
  content: 'Carers NZ runs a support line.',
  source_org: 'Carers NZ',
  document_id: 'carers-nz',
  similarity: 0.5,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const message = (model: string, text: string) => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model,
  stop_reason: 'end_turn',
  stop_sequence: null,
  content: [{ type: 'text', text }],
  usage: { input_tokens: 300, output_tokens: 20 },
});

/** A streamed Messages API reply, as server-sent events. */
function streamed(model: string, text: string): Response {
  const events = [
    {
      type: 'message_start',
      message: {
        ...message(model, ''),
        content: [],
        stop_reason: null,
        usage: {
          input_tokens: 900,
          output_tokens: 1,
          cache_read_input_tokens: 1000,
          cache_creation_input_tokens: 50,
        },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 120 },
    },
    { type: 'message_stop' },
  ];
  return new Response(
    events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''),
    {
      headers: { 'content-type': 'text/event-stream' },
    }
  );
}

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** Replaces the network. Returns every request made, for the assertions. */
function fakeNetwork({
  user = { id: 'user-1' } as unknown,
  generation = null as Response | null,
} = {}) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input instanceof Request ? input.url : input);
      const headers = Object.fromEntries(new Headers(init.headers).entries());
      const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      calls.push({ url, headers, body });
      if (url.endsWith('/auth/v1/user'))
        return user ? json(user) : json({ msg: 'invalid JWT' }, 401);
      if (url.endsWith('/embeddings')) {
        // As wide as was asked for: the adapter rejects any other width.
        const embedding = Array.from({ length: Number(body.output_dimension) }, () => 0.01);
        return json({ data: [{ index: 0, embedding }] });
      }
      // The reranker prefers the second passage.
      if (url.endsWith('/rerank')) {
        return json({
          data: [
            { index: 1, relevance_score: 0.9 },
            { index: 0, relevance_score: 0.4 },
          ],
        });
      }
      if (url.includes('/rest/v1/rpc/')) return json([CHUNK, OTHER_CHUNK]);
      if (url.includes('/v1/messages')) {
        const model = String(body.model);
        if (body.stream)
          return (
            generation ??
            streamed(model, 'Keep afternoons calm [S1].\n---detail---\nClose the curtains.')
          );
        const format = (body.output_config as { format?: unknown } | undefined)?.format;
        return json(
          message(
            model,
            format ? '{"level":"none","categories":[]}' : 'How do I manage sundowning at night?'
          )
        );
      }
      return json({ error: `no route for ${url}` }, 404);
    })
  );
  return calls;
}

function backend(bump: (key: string, limit: number) => unknown = () => true) {
  const rpc = vi.fn(async (_fn: string, args: Record<string, unknown>) =>
    bump(String(args.p_code), Number(args.p_limit))
  );
  const recordUsage = vi.fn();
  return { rpc, recordUsage } satisfies Backend;
}

const fakeRequest = makeReq as unknown as (options: Record<string, unknown>) => ApiRequest;
const request = (body: unknown = { message: 'How do I manage sundowning?' }) =>
  fakeRequest({ code: '', headers: { authorization: 'Bearer session-token' }, body });

type FakeRes = ApiResponse & { chunks: string[]; body: unknown };
const response = () => makeRes() as unknown as FakeRes;

const events = (res: FakeRes) =>
  res.chunks
    .join('')
    .split('\n\n')
    .filter((frame) => frame.startsWith('event: '))
    .map(
      (frame) =>
        JSON.parse(frame.slice(frame.indexOf('data: ') + 6)) as {
          type: string;
          [k: string]: unknown;
        }
    );

const to = (calls: Call[], part: string) => calls.filter((c) => c.url.includes(part));

beforeEach(() => vi.stubEnv('ALLOWED_ORIGINS', ORIGIN));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('composeTurnHandler: switched off', () => {
  it('is off unless TURN_ENDPOINT is "on", and then calls nothing', async () => {
    const calls = fakeNetwork();
    const services = backend();
    const { TURN_ENDPOINT: _off, ...env } = ENV;
    const res = response();
    await composeTurnHandler(env, services)(request(), res);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'the assistant is not available yet' });
    expect(calls).toEqual([]);
    expect(services.rpc).not.toHaveBeenCalled();
  });

  it('stays off, and says which keys are missing, when switched on without them', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const calls = fakeNetwork();
    const res = response();
    await composeTurnHandler(
      { TURN_ENDPOINT: 'on', SUPABASE_URL: 'https://db.example' },
      backend()
    )(request(), res);
    expect(res.statusCode).toBe(503);
    expect(log).toHaveBeenCalledWith(
      '[turn] TURN_ENDPOINT is on but ANTHROPIC_API_KEY, VOYAGE_API_KEY, SUPABASE_SERVICE_ROLE_KEY is not set; staying off'
    );
    expect(calls).toEqual([]);
  });
});

describe('composeTurnHandler: switched on', () => {
  it('runs a whole turn: each service is reached with its own key, and nothing else is', async () => {
    const calls = fakeNetwork();
    const services = backend();
    const res = response();
    await composeTurnHandler(ENV, services)(request(), res);

    // The safety verdict arrives whenever triage answers, so its place in the stream is not fixed.
    const types = events(res).map((e) => e.type);
    expect(types.filter((t) => t !== 'safety')).toEqual([
      'meta',
      'retrieval',
      'token',
      'token',
      'final',
      'usage',
      'timings',
      'done',
    ]);
    expect(types.filter((t) => t === 'safety')).toHaveLength(1);
    expect(events(res).find((e) => e.type === 'final')).toMatchObject({
      text: 'Keep afternoons calm [1].\n\nClose the curtains.',
      sources: [{ num: 1, id: 'kb-1', title: 'Evening restlessness', org: 'Alzheimers NZ' }],
    });
    expect(events(res).find((e) => e.type === 'safety')).toMatchObject({
      level: 'none',
      source: 'triage',
    });

    // Who is calling: asked of Supabase, with the caller's token and the service key.
    expect(to(calls, '/auth/v1/user')).toEqual([
      {
        url: 'https://db.example/auth/v1/user',
        headers: { authorization: 'Bearer session-token', apikey: 'service-key' },
        body: {},
      },
    ]);
    // Search: embedded by Voyage as a query, matched by the function that reads the Voyage column.
    const [embedding] = to(calls, '/embeddings');
    expect(embedding?.url).toBe('https://ai.mongodb.com/v1/embeddings');
    expect(embedding?.headers.authorization).toBe('Bearer voyage-key');
    expect(embedding?.body).toMatchObject({
      input_type: 'query',
      model: 'voyage-4',
      output_dimension: 1024,
    });
    const [search] = to(calls, '/rest/v1/rpc/');
    expect(search?.url).toBe('https://db.example/rest/v1/rpc/match_chunks_v2');
    expect(search?.headers.apikey).toBe('service-key');
    expect(to(calls, '/rerank')).toEqual([]);
    // The model: Claude, with the Anthropic key. One streamed answer, one triage, no rewrite without history.
    const model = to(calls, '/v1/messages');
    expect(
      model.every(
        (c) =>
          c.url.startsWith('https://api.anthropic.com/') &&
          c.headers['x-api-key'] === 'anthropic-key'
      )
    ).toBe(true);
    expect(model.filter((c) => c.body.stream).map((c) => c.body.model)).toEqual([
      'claude-opus-5-5',
    ]);
    expect(model.filter((c) => !c.body.stream).map((c) => c.body.model)).toEqual([
      'claude-haiku-5-5',
    ]);
    expect(calls).toHaveLength(5);
  });

  it('counts the turn against the default daily limits before any model call', async () => {
    fakeNetwork();
    const services = backend();
    await composeTurnHandler(ENV, services)(request(), response());
    expect(services.rpc.mock.calls).toEqual([
      ['bump_study_usage', { p_code: 'turn:user-1', p_limit: DEFAULT_LIMITS.visitorDaily }],
      ['bump_study_usage', { p_code: 'turn:all', p_limit: DEFAULT_LIMITS.globalDaily }],
    ]);
  });

  it('records what the turn used: every token the request was billed for, and the model', async () => {
    fakeNetwork();
    const services = backend();
    await composeTurnHandler(ENV, services)(request(), response());
    expect(services.recordUsage.mock.calls).toEqual([
      [{ userId: 'user-1', kind: 'chat', units: 900 + 120 + 1000 + 50, model: 'claude-opus-5-5' }],
    ]);
  });

  it('refuses, with the reason code, once the shared daily limit is used, and calls no model', async () => {
    const calls = fakeNetwork();
    const services = backend((key) => key !== 'turn:all');
    const res = response();
    await composeTurnHandler(ENV, services)(request(), res);
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({
      error: "The live demo has reached today's limit.",
      code: 'demo_limit',
    });
    expect(to(calls, '/v1/messages')).toEqual([]);
    expect(to(calls, '/embeddings')).toEqual([]);
    expect(services.recordUsage).not.toHaveBeenCalled();
  });

  it('treats any counter reply other than true as over the limit', async () => {
    fakeNetwork();
    const res = response();
    await composeTurnHandler(
      ENV,
      backend(() => null)
    )(request(), res);
    expect(res.statusCode).toBe(429);
    expect(res.body).toMatchObject({ code: 'visitor_limit' });
  });

  it('refuses a caller Supabase does not recognise before counting or spending anything', async () => {
    const calls = fakeNetwork({ user: null });
    const services = backend();
    const res = response();
    await composeTurnHandler(ENV, services)(request(), res);
    expect(res.statusCode).toBe(401);
    expect(services.rpc).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });

  it('records nothing when the model call fails, and reports the failure in the stream', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fakeNetwork({
      generation: json(
        { type: 'error', error: { type: 'invalid_request_error', message: 'bad request' } },
        400
      ),
    });
    const services = backend();
    const res = response();
    await composeTurnHandler(ENV, services)(request(), res);
    expect(events(res).at(-1)).toMatchObject({ type: 'error', code: 'generation_failed' });
    expect(services.recordUsage).not.toHaveBeenCalled();
  });

  it('follows the environment: limits, model, search function, Voyage endpoint, reranking', async () => {
    const calls = fakeNetwork();
    const services = backend();
    const res = response();
    await composeTurnHandler(
      {
        ...ENV,
        TURN_VISITOR_DAILY_LIMIT: '5',
        TURN_GLOBAL_DAILY_LIMIT: '50',
        PIPELINE_MODEL: 'claude-sonnet-5-5',
        KB_SEARCH_FUNCTION: 'match_chunks_v3',
        VOYAGE_BASE_URL: 'https://api.voyageai.com/v1',
        KB_RERANK: 'on',
      },
      services
    )(
      request({
        message: 'What about at night?',
        history: [{ role: 'user', content: 'How do I manage sundowning?' }],
      }),
      res
    );

    expect(services.rpc.mock.calls.map(([, args]) => args.p_limit)).toEqual([5, 50]);
    expect(events(res)[0]).toMatchObject({ type: 'meta', model: 'claude-sonnet-5-5' });
    expect(
      to(calls, '/v1/messages')
        .filter((c) => c.body.stream)
        .map((c) => c.body.model)
    ).toEqual(['claude-sonnet-5-5']);
    expect(to(calls, '/rest/v1/rpc/')[0]?.url).toBe(
      'https://db.example/rest/v1/rpc/match_chunks_v3'
    );
    expect(to(calls, '/embeddings')[0]?.url).toBe('https://api.voyageai.com/v1/embeddings');
    // The reranker's order is the order the passages are used in.
    expect(to(calls, '/rerank')).toHaveLength(1);
    expect(
      (events(res).find((e) => e.type === 'retrieval')?.chunks as { id: string }[]).map((c) => c.id)
    ).toEqual(['kb-2', 'kb-1']);
    // With history, the follow-up is rewritten into a stand-alone question, and that is what is searched for.
    expect(events(res).find((e) => e.type === 'retrieval')).toMatchObject({
      query: 'How do I manage sundowning at night?',
    });
    expect(services.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-5-5' })
    );
  });
});

describe('createProviders', () => {
  it('names what is missing', () => {
    expect(missingEnv({})).toEqual([
      'ANTHROPIC_API_KEY',
      'VOYAGE_API_KEY',
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
    ]);
    expect(missingEnv(ENV)).toEqual([]);
    expect(() => createProviders({ ...ENV, VOYAGE_API_KEY: '' })).toThrow(
      'cannot build the providers: VOYAGE_API_KEY not set'
    );
  });

  it('has a clock', () => {
    fakeNetwork();
    expect(createProviders(ENV).now()).toBeGreaterThan(0);
  });
});

describe('the deployed entry', () => {
  it('exports the handler built from the process environment: off by default', async () => {
    const calls = fakeNetwork();
    const { mod } = await load('../src/entry/turn.ts', { env: { TURN_ENDPOINT: undefined } });
    const res = response();
    await (mod.default as (req: ApiRequest, res: ApiResponse) => Promise<void>)(request(), res);
    expect(res.statusCode).toBe(503);
    expect(calls).toEqual([]);
  });

  it('counts through the database helper and records through the usage meter when switched on', async () => {
    fakeNetwork();
    const { mod, admin } = await load('../src/entry/turn.ts', {
      env: { ...ENV, ALLOWED_ORIGINS: ORIGIN },
    });
    const res = response();
    await (mod.default as (req: ApiRequest, res: ApiResponse) => Promise<void>)(request(), res);
    expect(events(res).at(-1)).toEqual({ type: 'done', stopReason: 'end_turn' });
    expect(admin.rpc).toHaveBeenCalledWith('bump_study_usage', {
      p_code: 'turn:user-1',
      p_limit: DEFAULT_LIMITS.visitorDaily,
    });
    expect(admin.insertIgnoringConflicts).toHaveBeenCalledWith(
      'usage_events',
      [{ user_id: 'user-1', kind: 'chat', units: 2070, model: 'claude-opus-5-5' }],
      'id'
    );
  });
});
