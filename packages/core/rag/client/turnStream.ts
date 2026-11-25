// The client side of the turn endpoint: what an app sends to POST /api/turn and
// how it reads the stream of events that comes back.
//
// It lives in the shared core so the web app, the mobile app and the server
// agree on the request's limits and the stream's format from one definition.
// Nothing here is specific to a browser except `streamTurn`, which needs a
// fetch whose response body can be read as it arrives.
import type { HistoryMessage, Modality, TurnEvent } from '../pipeline/types.ts';

/** The size limits of a turn request. The server enforces them; `fitHistory` keeps a client within them. */
export const TURN_LIMITS = {
  messageChars: 2000,
  historyMessages: 12,
  historyMessageChars: 6000,
  historyChars: 24000,
};

/**
 * What the stream carries: the pipeline's events, plus one of the server's own
 * for a failure the pipeline did not report itself.
 */
export type ServerEvent =
  TurnEvent | { type: 'error'; code: 'internal'; message: string; retryable: boolean };

/** The body of a turn request. Only `message` is required. */
export interface TurnRequestBody {
  message: string;
  history?: HistoryMessage[];
  modality?: Modality;
  /** Which avatar is answering; the assistant takes its name from it. */
  avatar?: string;
  settings?: {
    responseStyle?: string;
    jargonMode?: string;
    personality?: string;
    conciseMode?: boolean;
    isCaregiverSetup?: boolean;
  };
}

/** A turn that could not be started or did not finish. */
export class TurnRequestError extends Error {
  /** The HTTP status, or 0 when there was no response to speak of. */
  readonly status: number;
  /** The server's reason code (`visitor_limit`, `demo_limit`, `unavailable`…), when it gave one. */
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = 'TurnRequestError';
    this.status = status;
    this.code = code;
  }
}

/**
 * The most recent history that fits the request's limits: the newest messages
 * are kept, an over-long one is cut short, and older ones are dropped until the
 * total fits.
 */
export function fitHistory(history: HistoryMessage[], limits = TURN_LIMITS): HistoryMessage[] {
  const kept: HistoryMessage[] = [];
  let total = 0;
  for (let i = history.length - 1; i >= 0 && kept.length < limits.historyMessages; i -= 1) {
    const message = history[i] as HistoryMessage;
    const content = message.content.slice(0, limits.historyMessageChars);
    if (total + content.length > limits.historyChars) break;
    total += content.length;
    kept.unshift({ role: message.role, content });
  }
  return kept;
}

/**
 * Reads server-sent events out of text as it arrives. Feed it each piece of the
 * response; it returns the events that piece completed. A frame split across
 * pieces is held until its blank line arrives, and comment lines (the server's
 * keep-alives) are skipped.
 */
export function createEventStreamParser() {
  let buffer = '';
  return {
    push(text: string): ServerEvent[] {
      buffer += text.replace(/\r\n/g, '\n');
      const events: ServerEvent[] = [];
      let end = buffer.indexOf('\n\n');
      while (end !== -1) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).replace(/^ /, ''))
          .join('\n');
        if (data) events.push(JSON.parse(data) as ServerEvent);
        end = buffer.indexOf('\n\n');
      }
      return events;
    },
  };
}

export interface StreamTurnOptions {
  /** The endpoint's full URL. */
  url: string;
  /** The caller's session token. */
  token: string;
  body: TurnRequestBody;
  signal?: AbortSignal;
  fetch?: typeof globalThis.fetch;
}

/**
 * Sends one turn and yields the server's events as they arrive.
 *
 * Throws `TurnRequestError` when the server refuses the request (with its status
 * and reason code) and when the stream stops before the server said the turn
 * was over, which is a dropped connection. An `error` event is yielded, not
 * thrown: it is part of the stream, and events before it may still matter.
 */
export async function* streamTurn({
  url,
  token,
  body,
  signal,
  fetch: fetchFn = globalThis.fetch,
}: StreamTurnOptions): AsyncGenerator<ServerEvent, void, void> {
  const response = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    const refusal = (await response.json().catch(() => null)) as {
      error?: unknown;
      code?: unknown;
    } | null;
    throw new TurnRequestError(
      typeof refusal?.error === 'string' ? refusal.error : `the server answered ${response.status}`,
      response.status,
      typeof refusal?.code === 'string' ? refusal.code : null
    );
  }
  if (!response.body)
    throw new TurnRequestError('the response has no body to read', response.status);

  const parser = createEventStreamParser();
  const decoder = new TextDecoder();
  // A reader, not `for await`: not every browser can iterate a response body.
  const reader = response.body.getReader();
  let finished = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const event of parser.push(decoder.decode(value, { stream: true }))) {
        if (event.type === 'done' || event.type === 'error') finished = true;
        yield event;
      }
    }
  } finally {
    // Leaving early (the consumer stopped, or the request was aborted) must not
    // leave the connection open.
    await reader.cancel().catch(() => {});
  }
  if (!finished)
    throw new TurnRequestError(
      'the connection closed before the answer finished',
      0,
      'connection_lost'
    );
}
