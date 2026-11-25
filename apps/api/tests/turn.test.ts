import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTurnHandler } from '../src/turn.ts';
import type { TurnDeps, TurnSummary } from '../src/turn.ts';
import type { ApiRequest, ApiResponse } from '../src/http.ts';
import { pipelineConfig } from '../../../packages/core/rag/pipelineConfig.ts';
import type {
  GenerateEvent,
  GenerateRequest,
  Providers,
} from '../../../packages/core/rag/pipeline/types.ts';
import { makeReq, makeRes, ORIGIN } from './helpers.js';

const CHUNKS = [
  {
    id: 'kb-1',
    title: 'sundowning',
    content: 'Keep late afternoons calm.',
    source_org: 'Alzheimers NZ',
    similarity: 0.7,
  },
];

const USAGE: GenerateEvent = {
  type: 'usage',
  model: 'claude-opus-5-5',
  inputTokens: 900,
  outputTokens: 120,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

interface Setup {
  enabled?: boolean;
  userId?: string | null;
  stream?: GenerateEvent[];
  generate?: Providers['generate'];
  admit?: TurnDeps['admit'];
  now?: () => number;
}

function setup(options: Setup = {}) {
  const requests: GenerateRequest[] = [];
  const finished: TurnSummary[] = [];
  const verifySession = vi.fn(async () =>
    options.userId === undefined ? 'user-1' : options.userId
  );
  let clock = 0;
  const providers: Providers = {
    now: options.now ?? (() => (clock += 10)),
    embed: async () => [1, 0],
    search: async () => CHUNKS,
    generate:
      options.generate ??
      async function* (request) {
        requests.push(request);
        yield* options.stream ?? [
          { type: 'text', text: 'Keep afternoons calm [S1].\n---detail---\nClose the curtains.' },
          USAGE,
          { type: 'stop', reason: 'end_turn' },
        ];
      },
  };
  const config = pipelineConfig();
  const handler = createTurnHandler({
    providers: options.enabled === false ? null : providers,
    verifySession,
    config,
    admit: options.admit ?? (async () => ({ ok: true })),
    onFinished: (summary) => finished.push(summary),
  });
  return { handler, requests, finished, verifySession, config };
}

// The shared helper is plain JavaScript, so its options are typed here.
const fakeRequest = makeReq as unknown as (options: Record<string, unknown>) => ApiRequest;

const request = (overrides: Record<string, unknown> = {}) =>
  fakeRequest({
    code: '',
    headers: { authorization: 'Bearer session-token' },
    body: { message: 'How do I manage sundowning?' },
    ...overrides,
  });

type FakeRes = ApiResponse & {
  chunks: string[];
  headers: Record<string, string>;
  body: unknown;
  ended: boolean;
};

/** A fake response that, like a real one, can report its connection closing. */
function response(): FakeRes {
  const emitter = new EventEmitter();
  const res = makeRes() as unknown as FakeRes;
  res.on = ((event: string, listener: () => void) => {
    emitter.on(event, listener);
    return res;
  }) as FakeRes['on'];
  res.off = ((event: string, listener: () => void) => {
    emitter.off(event, listener);
    return res;
  }) as FakeRes['off'];
  res.emit = ((event: string) => emitter.emit(event)) as FakeRes['emit'];
  res.listenerCount = ((event: string) => emitter.listenerCount(event)) as FakeRes['listenerCount'];
  Object.defineProperty(res, 'writableEnded', { get: () => res.ended });
  return res;
}

/** The events of a streamed response, in order. */
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

beforeEach(() => vi.stubEnv('ALLOWED_ORIGINS', ORIGIN));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/turn: who may call', () => {
  it('answers a CORS preflight and stops', async () => {
    const { handler, verifySession } = setup();
    const res = response();
    await handler(request({ method: 'OPTIONS' }), res);
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(verifySession).not.toHaveBeenCalled();
  });

  it('refuses anything but POST', async () => {
    const { handler } = setup();
    const res = response();
    await handler(request({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe('POST');
  });

  it('does nothing while the endpoint is switched off, not even a session check', async () => {
    const { handler, verifySession, requests } = setup({ enabled: false });
    const res = response();
    await handler(request(), res);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'the assistant is not available yet' });
    expect(verifySession).not.toHaveBeenCalled();
    expect(requests).toEqual([]);
  });

  it('requires a verified session, and passes the bearer token to the verifier', async () => {
    const { handler, verifySession, requests } = setup({ userId: null });
    const res = response();
    await handler(request(), res);
    expect(verifySession).toHaveBeenCalledWith('session-token');
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'sign-in required' });
    expect(requests).toEqual([]);
  });

  it('treats a request with no Authorization header as not signed in', async () => {
    const { handler, verifySession } = setup({ userId: null });
    const res = response();
    await handler(request({ headers: {} }), res);
    expect(verifySession).toHaveBeenCalledWith('');
    expect(res.statusCode).toBe(401);
  });

  it('refuses an invalid body with the reason, before any model call', async () => {
    const { handler, requests } = setup();
    const res = response();
    await handler(request({ body: { message: '' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'message is required' });
    expect(requests).toEqual([]);
  });

  it('refuses a body the platform could not parse, instead of failing', async () => {
    const { handler, requests } = setup();
    const req = request();
    Object.defineProperty(req, 'body', {
      get() {
        throw new Error('Invalid JSON');
      },
    });
    const res = response();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'the request body is not valid JSON' });
    expect(requests).toEqual([]);
  });

  it('does not ask the spending guard about a request it has already refused', async () => {
    const admit = vi.fn<TurnDeps['admit']>(async () => ({ ok: true }));
    const { handler } = setup({ admit, userId: null });
    await handler(request(), response());
    await setup({ admit }).handler(request({ body: { message: '' } }), response());
    expect(admit).not.toHaveBeenCalled();
  });

  it('asks the spending guard once the caller and request are known, and obeys a refusal', async () => {
    const admit = vi.fn<TurnDeps['admit']>(async () => ({
      ok: false,
      status: 429,
      code: 'demo_limit',
      error: 'daily limit reached',
    }));
    const { handler, requests } = setup({ admit });
    const res = response();
    await handler(request(), res);
    expect(admit).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ message: 'How do I manage sundowning?' })
    );
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: 'daily limit reached', code: 'demo_limit' });
    expect(requests).toEqual([]);
  });

  it('goes ahead when the spending guard allows it', async () => {
    const { handler, requests } = setup({ admit: async () => ({ ok: true }) });
    await handler(request(), response());
    expect(requests).toHaveLength(1);
  });
});

describe('POST /api/turn: the stream', () => {
  it('streams the pipeline events in order as an event stream', async () => {
    const { handler, config } = setup();
    const res = response();
    await handler(request(), res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream; charset=utf-8');
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
    const seen = events(res);
    expect(seen.map((e) => e.type)).toEqual([
      'meta',
      'retrieval',
      'safety',
      'token',
      'token',
      'final',
      'usage',
      'timings',
      'done',
    ]);
    expect(seen[0]).toMatchObject({
      pipelineVersion: config.pipelineVersion,
      model: 'claude-opus-5-5',
      modality: 'text',
    });
    expect(seen.filter((e) => e.type === 'token')).toEqual([
      { type: 'token', text: 'Keep afternoons calm.', section: 'lead' },
      { type: 'token', text: 'Close the curtains.', section: 'detail' },
    ]);
    expect(seen.find((e) => e.type === 'final')).toMatchObject({
      text: 'Keep afternoons calm [1].\n\nClose the curtains.',
      lead: 'Keep afternoons calm.',
    });
    expect(seen[seen.length - 1]).toEqual({ type: 'done', stopReason: 'end_turn' });
    expect(res.ended).toBe(true);
  });

  it('runs the turn the request describes: modality, avatar and settings reach the model', async () => {
    const { handler, requests } = setup();
    await handler(
      request({
        body: {
          message: 'What about at night?',
          modality: 'voice',
          avatar: 'ariana',
          settings: { personality: 'practical' },
          history: [{ role: 'user', content: 'Earlier question' }],
        },
      }),
      response()
    );
    expect(requests[0]?.system.stable).toMatch(/^You are Ariana, /);
    expect(requests[0]?.system.perTurn).toContain('direct and practical');
    expect(requests[0]?.system.perTurn).toContain('This answer will be heard');
    expect(requests[0]?.history).toEqual([{ role: 'user', content: 'Earlier question' }]);
    expect(requests[0]?.question).toBe('What about at night?');
  });

  it('reports the finished turn for metering, with who it was for and what it used', async () => {
    const { handler, finished, config } = setup();
    await handler(request(), response());
    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({
      userId: 'user-1',
      stopReason: 'end_turn',
      pipelineVersion: config.pipelineVersion,
      usage: { model: 'claude-opus-5-5', inputTokens: 900, outputTokens: 120 },
      timings: { total: expect.any(Number) },
      request: { message: 'How do I manage sundowning?', modality: 'text' },
    });
  });

  it('reports a model failure as an error event, keeps the provider wording in the log, and records the turn as failed', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { handler, finished } = setup({
      generate: async function* () {
        yield* [];
        throw new Error('529 overloaded (request req_123, organisation acme)');
      },
    });
    const res = response();
    await handler(request(), res);
    const seen = events(res);
    expect(seen[seen.length - 1]).toEqual({
      type: 'error',
      code: 'generation_failed',
      message: 'The assistant could not answer just now.',
      retryable: true,
    });
    expect(JSON.stringify(seen)).not.toContain('req_123');
    expect(log).toHaveBeenCalledWith(
      '[turn] generation_failed: 529 overloaded (request req_123, organisation acme)'
    );
    expect(res.ended).toBe(true);
    expect(finished[0]).toMatchObject({ stopReason: 'error', usage: null });
  });

  it('reports an unexpected failure in the stream without leaking its detail, and still closes it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    let calls = 0;
    const { handler, finished } = setup({
      now: () => {
        calls += 1;
        if (calls > 2) throw new Error('clock exploded at /var/secret/path');
        return calls;
      },
    });
    const res = response();
    await handler(request(), res);
    const seen = events(res);
    expect(seen[seen.length - 1]).toEqual({
      type: 'error',
      code: 'internal',
      message: 'Something went wrong.',
      retryable: true,
    });
    expect(JSON.stringify(seen)).not.toContain('secret');
    expect(log).toHaveBeenCalledWith(
      '[turn] unexpected failure: clock exploded at /var/secret/path'
    );
    expect(res.ended).toBe(true);
    expect(finished).toHaveLength(1);
  });

  it('logs an unexpected failure that is not an Error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    let calls = 0;
    const { handler } = setup({
      now: () => {
        calls += 1;
        if (calls > 2) throw 'not an error object';
        return calls;
      },
    });
    await handler(request(), response());
    expect(log).toHaveBeenCalledWith('[turn] unexpected failure: not an error object');
  });

  it('stops the model when the connection closes before the answer is finished', async () => {
    const res = response();
    let seenSignal: AbortSignal | undefined;
    const { handler, finished } = setup({
      generate: async function* (generateRequest) {
        seenSignal = generateRequest.signal;
        yield { type: 'text', text: 'First. ' };
        res.emit('close'); // the browser tab closed, or the person started speaking
        yield { type: 'text', text: 'Second.' };
        yield { type: 'stop', reason: 'end_turn' };
      },
    });
    await handler(request(), res);
    expect(seenSignal?.aborted).toBe(true);
    const seen = events(res);
    expect(seen[seen.length - 1]).toEqual({ type: 'done', stopReason: 'aborted' });
    expect(seen.some((e) => e.type === 'final')).toBe(false);
    expect(finished[0]?.stopReason).toBe('aborted');
  });

  it('does not treat the request body having been read as the caller leaving', async () => {
    // A request emits `close` once its body is consumed, while the connection is still open.
    const req = request();
    let seenSignal: AbortSignal | undefined;
    const { handler, finished } = setup({
      generate: async function* (generateRequest) {
        seenSignal = generateRequest.signal;
        req.emit('close');
        yield { type: 'text', text: 'An answer.' };
        yield { type: 'stop', reason: 'end_turn' };
      },
    });
    await handler(req, response());
    expect(seenSignal?.aborted).toBe(false);
    expect(finished[0]?.stopReason).toBe('end_turn');
  });

  it('stops watching the connection once the answer is finished', async () => {
    const res = response();
    let seenSignal: AbortSignal | undefined;
    const { handler } = setup({
      generate: async function* (generateRequest) {
        seenSignal = generateRequest.signal;
        yield { type: 'stop', reason: 'end_turn' };
      },
    });
    await handler(request(), res);
    expect(res.listenerCount('close')).toBe(0);
    res.emit('close'); // the connection closing normally after the response ended
    expect(seenSignal?.aborted).toBe(false);
  });

  it('works without a metering callback', async () => {
    const providers: Providers = {
      now: () => 1,
      embed: async () => [1],
      search: async () => [],
      generate: async function* () {
        yield { type: 'stop', reason: 'end_turn' };
      },
    };
    const handler = createTurnHandler({
      providers,
      verifySession: async () => 'u',
      config: pipelineConfig(),
      admit: async () => ({ ok: true }),
    });
    const res = response();
    await handler(request(), res);
    expect(events(res).at(-1)).toEqual({ type: 'done', stopReason: 'end_turn' });
  });
});
