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
  RetrievalMode,
  SafetyLevel,
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

/**
 * What a finished turn amounted to, for metering and traces. It holds what
 * happened, not the answer: a trace is built from this, and must not be able
 * to carry what was said.
 */
export interface TurnSummary {
  userId: string;
  request: TurnRequest;
  /** `error` unless the pipeline said how it ended. */
  stopReason: string;
  /** Which failure, when it ended in one. */
  errorCode: string | null;
  usage: Usage | null;
  timings: Timings | null;
  pipelineVersion: string;
  /** The prompt and model the pipeline said it was using; null if it never started. */
  promptVersion: string | null;
  model: string | null;
  /** What the search found, best first, and how long the search took. */
  retrieval: {
    mode: RetrievalMode;
    chunks: { id: string; similarity: number | null }[];
    ms: number;
  } | null;
  safety: { level: SafetyLevel; source: 'triage' | 'keywords' } | null;
  /** The ids of the passages the answer cited, in order of first use. */
  cited: string[];
  /** The length of the answer as shown; null when there was none. */
  answerChars: number | null;
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
  /**
   * The dollar budget, when one is set (budget.ts). Sets aside the most this
   * turn can cost and resolves to how to settle it afterwards, or to null if
   * today has no room for it. If it rejects, the turn is refused: a cap that
   * lets requests through when it cannot count is not a cap.
   */
  reserve?(request: TurnRequest): Promise<((summary: TurnSummary) => void) | null>;
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

    let settle: ((summary: TurnSummary) => void) | null = null;
    if (deps.reserve) {
      try {
        settle = await deps.reserve(request);
      } catch (err) {
        console.error(
          `[turn] budget unavailable: ${err instanceof Error ? err.message : String(err)}`
        );
        res
          .status(503)
          .json({ error: 'The assistant is temporarily unavailable.', code: 'unavailable' });
        return;
      }
      if (!settle) {
        res
          .status(429)
          .json({ error: "The live demo has reached today's limit.", code: 'demo_limit' });
        return;
      }
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
      errorCode: null,
      usage: null,
      timings: null,
      pipelineVersion: deps.config.pipelineVersion,
      promptVersion: null,
      model: null,
      retrieval: null,
      safety: null,
      cited: [],
      answerChars: null,
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
      summary.errorCode = 'internal';
      stream.send({
        type: 'error',
        code: 'internal',
        message: 'Something went wrong.',
        retryable: true,
      });
    } finally {
      res.off('close', onClose);
      stream.close();
      settle?.(summary);
      deps.onFinished?.(summary);
    }
  };
}

function record(summary: TurnSummary, event: TurnEvent): void {
  switch (event.type) {
    case 'meta':
      summary.promptVersion = event.promptVersion;
      summary.model = event.model;
      break;
    case 'retrieval':
      summary.retrieval = {
        mode: event.mode,
        chunks: event.chunks.map(({ id, similarity }) => ({ id, similarity })),
        ms: event.ms,
      };
      break;
    case 'safety':
      summary.safety = { level: event.level, source: event.source };
      break;
    case 'final':
      // The length and the ids, not the words.
      summary.answerChars = event.text.length;
      summary.cited = event.sources.map((source) => source.id);
      break;
    case 'usage': {
      const { type: _type, ...usage } = event;
      summary.usage = usage;
      break;
    }
    case 'timings': {
      const { type: _type, ...timings } = event;
      summary.timings = timings;
      break;
    }
    case 'done':
      summary.stopReason = event.stopReason;
      break;
    case 'error':
      summary.errorCode = event.code;
      break;
    // The words of the answer pass through here on their way to the caller
    // and are deliberately not kept.
    case 'token':
      break;
  }
}
