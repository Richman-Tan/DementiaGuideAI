// POST /api/turn — one turn of the assistant, streamed.
//
// The pipeline itself is packages/core/rag/pipeline/runTurn; this is only the
// HTTP around it: who may call, what they may send, and turning the pipeline's
// events into a stream. The apps hold no model keys and assemble no prompts.
//
// Everything outside this file comes in as a dependency, so the handler can be
// exercised end to end in a test with stand-in providers.
import { runTurn } from '../../../packages/core/rag/pipeline/runTurn.ts';
import type {
  PipelineConfig,
  Providers,
  Timings,
  TurnEvent,
  Usage,
} from '../../../packages/core/rag/pipeline/types.ts';
import type { ServerEvent } from '../../../packages/core/rag/client/turnStream.ts';
import { applyCors } from '../api/_lib/guard.js';
import type { Admission } from './admission.ts';
import { bearerToken } from './http.ts';
import type { Handler } from './http.ts';
import { openEventStream } from './sse.ts';
import type { SessionVerifier } from './session.ts';
import { parseTurnRequest } from './turnRequest.ts';
import type { TurnRequest } from './turnRequest.ts';

export interface TurnSummary {
  userId: string;
  request: TurnRequest;
  stopReason: string;
  usage: Usage | null;
  timings: Timings | null;
  pipelineVersion: string;
}

export interface TurnDeps {
  /**
   * The services a turn runs on, or null while the endpoint is switched off.
   * A switched-off endpoint answers 503 and spends nothing.
   */
  providers: Providers | null;
  verifySession: SessionVerifier;
  config: PipelineConfig;
  /**
   * The spending guard. Runs after the caller is known and the request is
   * valid. Required: an endpoint that pays for each call is never built
   * without one.
   */
  admit(userId: string, request: TurnRequest): Promise<Admission>;
  /** Called once the stream has ended, for metering and traces. Must not throw. */
  onFinished?(summary: TurnSummary): void;
}

export function createTurnHandler(deps: TurnDeps): Handler {
  return async function turn(req, res) {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ error: 'method not allowed' });
      return;
    }
    const providers = deps.providers;
    if (!providers) {
      res.status(503).json({ error: 'the assistant is not available yet' });
      return;
    }

    const userId = await deps.verifySession(bearerToken(req));
    if (!userId) {
      res.status(401).json({ error: 'sign-in required' });
      return;
    }

    // The platform parses the body when it is first read, and throws if it is
    // not the JSON its content type claims.
    let body: unknown;
    try {
      body = req.body;
    } catch {
      res.status(400).json({ error: 'the request body is not valid JSON' });
      return;
    }
    const parsed = parseTurnRequest(body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const request = parsed.value;

    const admission = await deps.admit(userId, request);
    if (!admission.ok) {
      res.status(admission.status).json({ error: admission.error, code: admission.code });
      return;
    }

    // A connection that closes before the answer is finished is the caller
    // leaving, or interrupting the avatar by speaking. Either way, stop the
    // model: nobody is listening, and every further token is billed.
    //
    // The response is watched, not the request: a request emits `close` as soon
    // as its body has been read, which says nothing about the connection.
    const abort = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) abort.abort();
    };
    res.on('close', onClose);

    const stream = openEventStream<ServerEvent>(res);
    const summary: TurnSummary = {
      userId,
      request,
      stopReason: 'error',
      usage: null,
      timings: null,
      pipelineVersion: deps.config.pipelineVersion,
    };
    try {
      for await (const event of runTurn(
        { ...request, signal: abort.signal },
        providers,
        deps.config
      )) {
        record(summary, event);
        if (event.type === 'error') {
          // A provider's own words can name accounts, limits and request ids.
          // They go to the log; the caller gets a plain sentence.
          console.error(`[turn] ${event.code}: ${event.message}`);
          stream.send({ ...event, message: 'The assistant could not answer just now.' });
        } else {
          stream.send(event);
        }
      }
    } catch (err) {
      // The pipeline reports its own failures as events. Reaching here means
      // something unexpected; say so in the stream, since the status line has
      // already gone out as 200.
      console.error(
        `[turn] unexpected failure: ${err instanceof Error ? err.message : String(err)}`
      );
      stream.send({
        type: 'error',
        code: 'internal',
        message: 'Something went wrong.',
        retryable: true,
      });
    } finally {
      res.off('close', onClose);
      stream.close();
      deps.onFinished?.(summary);
    }
  };
}

function record(summary: TurnSummary, event: TurnEvent): void {
  if (event.type === 'usage') {
    const { type: _type, ...usage } = event;
    summary.usage = usage;
  } else if (event.type === 'timings') {
    const { type: _type, ...timings } = event;
    summary.timings = timings;
  } else if (event.type === 'done') {
    summary.stopReason = event.stopReason;
  }
}
