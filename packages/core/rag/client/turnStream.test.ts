import {
  createEventStreamParser,
  fitHistory,
  streamTurn,
  TURN_LIMITS,
  TurnRequestError,
} from './turnStream.ts';
import type { ServerEvent } from './turnStream.ts';
import type { HistoryMessage } from '../pipeline/types.ts';

const frame = (event: { type: string }) =>
  `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

const TOKEN: ServerEvent = { type: 'token', text: 'Kia ora', section: 'lead' };
const DONE: ServerEvent = { type: 'done', stopReason: 'end_turn' };

describe('fitHistory', () => {
  const turn = (i: number, length = 10): HistoryMessage => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `${i}`.padEnd(length, 'x'),
  });

  it('keeps a short history as it is', () => {
    const history = [turn(0), turn(1)];
    expect(fitHistory(history)).toEqual(history);
    expect(fitHistory([])).toEqual([]);
  });

  it('keeps the newest messages when there are more than the limit allows', () => {
    const history = Array.from({ length: 15 }, (_, i) => turn(i));
    const kept = fitHistory(history);
    expect(kept).toHaveLength(TURN_LIMITS.historyMessages);
    expect(kept[0]).toEqual(history[3]);
    expect(kept[kept.length - 1]).toEqual(history[14]);
  });

  it('cuts an over-long message to the per-message limit', () => {
    const [kept] = fitHistory([turn(0, 9000)]);
    expect(kept?.content).toHaveLength(TURN_LIMITS.historyMessageChars);
  });

  it('drops older messages until the total fits', () => {
    // Five messages of 6,000 characters: only the newest four fit in 24,000.
    const history = Array.from({ length: 5 }, (_, i) => turn(i, 6000));
    const kept = fitHistory(history);
    expect(kept.map((m) => m.content[0])).toEqual(['1', '2', '3', '4']);
    expect(kept.reduce((n, m) => n + m.content.length, 0)).toBe(TURN_LIMITS.historyChars);
  });

  it('never skips over a message to reach an older one', () => {
    // The middle message does not fit, so nothing before it is sent either:
    // a history with a hole in it would misrepresent the conversation.
    const kept = fitHistory([turn(0, 10), turn(1, 90), turn(2, 10)], {
      ...TURN_LIMITS,
      historyChars: 50,
    });
    expect(kept.map((m) => m.content[0])).toEqual(['2']);
  });

  it('sends only the role and the text', () => {
    const message = { role: 'user', content: 'hello', time: '9:00 am', streaming: false };
    expect(fitHistory([message as HistoryMessage])).toEqual([{ role: 'user', content: 'hello' }]);
  });
});

describe('createEventStreamParser', () => {
  it('returns the events of each complete frame', () => {
    const parser = createEventStreamParser();
    expect(parser.push(frame(TOKEN) + frame(DONE))).toEqual([TOKEN, DONE]);
  });

  it('holds a frame that arrives in pieces until it is complete', () => {
    const parser = createEventStreamParser();
    const text = frame(TOKEN);
    expect(parser.push(text.slice(0, 12))).toEqual([]);
    expect(parser.push(text.slice(12, text.length - 1))).toEqual([]); // one newline short
    expect(parser.push(text.slice(text.length - 1))).toEqual([TOKEN]);
  });

  it('skips keep-alive comments and frames with no data', () => {
    const parser = createEventStreamParser();
    expect(parser.push(`: keep-alive\n\n${frame(TOKEN)}event: ping\n\n`)).toEqual([TOKEN]);
  });

  it('accepts CRLF line endings, data without a space, and data over several lines', () => {
    const parser = createEventStreamParser();
    expect(
      parser.push('event: done\r\ndata:{"type":"done","stopReason":"end_turn"}\r\n\r\n')
    ).toEqual([DONE]);
    expect(parser.push('data: {"type":"token",\ndata: "text":"a","section":"lead"}\n\n')).toEqual([
      { type: 'token', text: 'a', section: 'lead' },
    ]);
  });

  it('keeps a newline that is part of the text', () => {
    const event: ServerEvent = { type: 'token', text: 'One.\n\nTwo.', section: 'detail' };
    expect(createEventStreamParser().push(frame(event))).toEqual([event]);
  });
});

describe('streamTurn', () => {
  const encoder = new TextEncoder();

  /** A response whose body arrives in the given pieces. */
  function streamed(pieces: (string | Uint8Array)[], onCancel?: () => void): Response {
    let i = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const piece = pieces[i++];
        if (piece === undefined) controller.close();
        else controller.enqueue(typeof piece === 'string' ? encoder.encode(piece) : piece);
      },
      cancel() {
        onCancel?.();
      },
    });
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }

  function fakeFetch(response: Response | (() => Promise<Response>)) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return typeof response === 'function' ? response() : response;
    }) as unknown as typeof fetch;
    return { fetchFn, calls };
  }

  const collect = async (stream: AsyncIterable<ServerEvent>) => {
    const events: ServerEvent[] = [];
    for await (const event of stream) events.push(event);
    return events;
  };

  const options = (fetchFn: typeof fetch) => ({
    url: 'https://api.example/api/turn',
    token: 'session-token',
    body: { message: 'How do I manage sundowning?' },
    fetch: fetchFn,
  });

  it('posts the turn as JSON with the session token', async () => {
    const { fetchFn, calls } = fakeFetch(streamed([frame(DONE)]));
    const signal = new AbortController().signal;
    await collect(streamTurn({ ...options(fetchFn), signal }));
    expect(calls).toEqual([
      {
        url: 'https://api.example/api/turn',
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer session-token' },
          body: '{"message":"How do I manage sundowning?"}',
          signal,
        },
      },
    ]);
  });

  it('sends no signal when none is given', async () => {
    const { fetchFn, calls } = fakeFetch(streamed([frame(DONE)]));
    await collect(streamTurn(options(fetchFn)));
    expect(calls[0]?.init).not.toHaveProperty('signal');
  });

  it('yields each event as its frame arrives, however the bytes are split', async () => {
    const text = frame(TOKEN) + ': keep-alive\n\n' + frame(DONE);
    const { fetchFn } = fakeFetch(
      streamed([text.slice(0, 20), text.slice(20, 61), text.slice(61)])
    );
    expect(await collect(streamTurn(options(fetchFn)))).toEqual([TOKEN, DONE]);
  });

  it('decodes a character whose bytes arrive in two pieces', async () => {
    const event: ServerEvent = { type: 'token', text: 'Kia ora, whānau', section: 'lead' };
    const bytes = encoder.encode(frame(event) + frame(DONE));
    const split = bytes.indexOf(0xc4) + 1; // between the two bytes of "ā"
    const { fetchFn } = fakeFetch(streamed([bytes.slice(0, split), bytes.slice(split)]));
    expect(await collect(streamTurn(options(fetchFn)))).toEqual([event, DONE]);
  });

  it('yields an error event and treats the stream as finished', async () => {
    const failed: ServerEvent = {
      type: 'error',
      code: 'generation_failed',
      message: 'The assistant could not answer just now.',
      retryable: true,
    };
    const { fetchFn } = fakeFetch(streamed([frame(TOKEN), frame(failed)]));
    expect(await collect(streamTurn(options(fetchFn)))).toEqual([TOKEN, failed]);
  });

  it('throws the server refusal with its status and reason code', async () => {
    const { fetchFn } = fakeFetch(
      new Response(
        JSON.stringify({ error: "The live demo has reached today's limit.", code: 'demo_limit' }),
        {
          status: 429,
        }
      )
    );
    const error = await collect(streamTurn(options(fetchFn))).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TurnRequestError);
    expect(error).toMatchObject({
      name: 'TurnRequestError',
      message: "The live demo has reached today's limit.",
      status: 429,
      code: 'demo_limit',
    });
  });

  it.each([
    ['is not JSON', new Response('<html>Bad gateway</html>', { status: 502 })],
    ['has no message', new Response('{}', { status: 502 })],
    [
      'has a message and code of the wrong type',
      new Response('{"error":5,"code":7}', { status: 502 }),
    ],
  ])('describes a refusal whose body %s by its status', async (_name, response) => {
    const { fetchFn } = fakeFetch(response);
    await expect(collect(streamTurn(options(fetchFn)))).rejects.toMatchObject({
      message: 'the server answered 502',
      status: 502,
      code: null,
    });
  });

  it('throws when the response has no body', async () => {
    const { fetchFn } = fakeFetch(new Response(null, { status: 200 }));
    await expect(collect(streamTurn(options(fetchFn)))).rejects.toMatchObject({
      message: 'the response has no body to read',
      status: 200,
    });
  });

  it('throws when the stream stops before the server said the turn was over', async () => {
    const { fetchFn } = fakeFetch(streamed([frame(TOKEN), 'event: token\ndata: {"type":"tok']));
    const seen: ServerEvent[] = [];
    const error = await (async () => {
      for await (const event of streamTurn(options(fetchFn))) seen.push(event);
    })().catch((e: unknown) => e);
    expect(seen).toEqual([TOKEN]);
    expect(error).toMatchObject({
      message: 'the connection closed before the answer finished',
      status: 0,
      code: 'connection_lost',
    });
  });

  it('closes the connection when the consumer stops reading early', async () => {
    let cancelled = false;
    const { fetchFn } = fakeFetch(
      streamed([frame(TOKEN), frame(TOKEN), frame(DONE)], () => {
        cancelled = true;
      })
    );
    for await (const event of streamTurn(options(fetchFn))) {
      expect(event).toEqual(TOKEN);
      break;
    }
    expect(cancelled).toBe(true);
  });

  it('passes a failed request through unchanged', async () => {
    const { fetchFn } = fakeFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(collect(streamTurn(options(fetchFn)))).rejects.toThrow('Failed to fetch');
  });

  it('uses the global fetch unless another is supplied', async () => {
    const original = globalThis.fetch;
    const { fetchFn, calls } = fakeFetch(streamed([frame(DONE)]));
    globalThis.fetch = fetchFn;
    try {
      const { fetch: _unused, ...rest } = options(fetchFn);
      expect(await collect(streamTurn(rest))).toEqual([DONE]);
      expect(calls).toHaveLength(1);
    } finally {
      globalThis.fetch = original;
    }
  });
});
