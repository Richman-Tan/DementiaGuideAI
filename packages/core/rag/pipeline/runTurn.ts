// One turn of the assistant, start to finish, as a stream of events.
//
//   rewrite follow-up → retrieve → generate (streamed) → validate citations
//                      safety triage runs beside all of it
//
// This is the only implementation. The server streams its events to the apps,
// and the eval harness iterates the same generator in-process, so what is
// evaluated is what ships. It talks to the outside world only through the
// injected providers, which is also what makes it testable without a network.
import { createMarkerStripper, extractCitations } from '../citations.js';
import { retrieve } from './retrieve.ts';
import { safetyFloor } from './safetyFloor.ts';
import { createSectionSplitter, splitSections } from './sections.ts';
import type {
  Chunk,
  GenerateRequest,
  PipelineConfig,
  Providers,
  RetrievalMode,
  RetrievedSummary,
  Source,
  StopReason,
  Timings,
  TurnEvent,
  TurnInput,
  Usage,
} from './types.ts';

type SafetyEvent = Extract<TurnEvent, { type: 'safety' }>;

const summarise = (chunk: Chunk): RetrievedSummary => ({
  id: chunk.id,
  title: chunk.display_title ?? chunk.title,
  org: chunk.source_org ?? null,
  url: chunk.source_url ?? null,
  similarity: chunk.similarity ?? null,
});

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * The safety verdict for this message. With a triage provider, its answer; if
 * that fails (or there is none), the keyword floor. Never rejects.
 */
async function resolveSafety(
  input: TurnInput,
  providers: Providers,
  config: PipelineConfig
): Promise<SafetyEvent> {
  const floor = (): SafetyEvent => ({
    type: 'safety',
    ...safetyFloor(input.message),
    source: 'keywords',
  });
  if (!providers.triage) return floor();
  try {
    const verdict = await providers.triage(input.message, input.history, {
      signal: input.signal,
      timeoutMs: config.triageTimeoutMs,
    });
    return {
      type: 'safety',
      level: verdict.level,
      categories: verdict.categories,
      source: 'triage',
    };
  } catch {
    return floor();
  }
}

export async function* runTurn(
  input: TurnInput,
  providers: Providers,
  config: PipelineConfig
): AsyncGenerator<TurnEvent, void, void> {
  const startedAt = providers.now();
  const elapsed = () => providers.now() - startedAt;
  const timings: Timings = { total: 0 };
  const generation = config.generation[input.modality];
  const aborted = () => input.signal?.aborted === true;
  const finish = function* (stopReason: StopReason): Generator<TurnEvent> {
    yield { type: 'timings', ...timings, total: elapsed() };
    yield { type: 'done', stopReason };
  };

  yield {
    type: 'meta',
    pipelineVersion: config.pipelineVersion,
    promptVersion: config.prompt.version,
    model: generation.model,
    modality: input.modality,
  };

  // Triage starts now and runs beside retrieval and generation; its verdict is
  // sent as soon as it is known, wherever the answer has got to by then.
  let safety: SafetyEvent | null = null;
  let safetySent = false;
  const safetyPending = resolveSafety(input, providers, config).then((event) => {
    safety = event;
  });
  const takeSafety = (): SafetyEvent | null => {
    if (safetySent || !safety) return null;
    safetySent = true;
    return safety;
  };

  // ─── Retrieval ─────────────────────────────────────────────────────────────
  const retrievalStart = providers.now();
  let query = input.message;
  let chunks: Chunk[] = [];
  let mode: RetrievalMode;
  if (input.retrieved) {
    chunks = input.retrieved;
    mode = chunks.length > 0 ? 'prefetched' : 'none';
  } else {
    try {
      if (providers.rewrite && input.history.length > 0) {
        try {
          const rewritten = await providers.rewrite(input.message, input.history, {
            signal: input.signal,
          });
          if (rewritten.trim()) query = rewritten.trim();
        } catch {
          // A failed rewrite costs recall on a follow-up, nothing more: search the
          // message as it was written.
        }
      }
      chunks = await retrieve(query, providers, config.retrieval, input.signal);
      mode = chunks.length > 0 ? 'fresh' : 'none';
    } catch {
      // Retrieval failing must not fail the turn: the prompt tells the model to
      // answer from its own knowledge when no passage is supplied.
      chunks = [];
      mode = 'failed';
    }
  }
  if (aborted()) {
    yield* finish('aborted');
    return;
  }
  timings.retrievalDone = elapsed();
  yield {
    type: 'retrieval',
    mode,
    query,
    chunks: chunks.map(summarise),
    ms: providers.now() - retrievalStart,
  };
  const early = takeSafety();
  if (early) yield early;

  // ─── Generation ────────────────────────────────────────────────────────────
  const request: GenerateRequest = {
    model: generation.model,
    maxTokens: generation.maxTokens,
    ...(generation.effort ? { effort: generation.effort } : {}),
    system: config.prompt.system(input.settings, input.modality),
    history: input.history.slice(-config.maxHistory),
    question: input.message,
    userText: config.prompt.user(input.message, chunks),
    passages: chunks,
    ...(input.signal ? { signal: input.signal } : {}),
  };

  // The model cites passages as [S1]; those markers are stripped from the live
  // stream (they must never be spoken) and resolved once the answer is whole.
  const markers = createMarkerStripper();
  const sections = config.prompt.sections ? createSectionSplitter() : null;
  let raw = '';
  let lead = '';
  let usage: Usage | null = null;
  let stopReason: StopReason = 'end_turn';

  const tokens = function* (clean: string, end: boolean): Generator<TurnEvent> {
    const pieces = sections
      ? [...(clean ? sections.write(clean) : []), ...(end ? sections.flush() : [])]
      : clean
        ? [{ section: 'lead' as const, text: clean }]
        : [];
    for (const piece of pieces) {
      if (timings.firstToken === undefined) timings.firstToken = elapsed();
      if (piece.section === 'lead') lead += piece.text;
      yield { type: 'token', text: piece.text, section: piece.section };
    }
  };

  timings.llmSend = elapsed();
  try {
    for await (const event of providers.generate(request)) {
      if (event.type === 'text') {
        raw += event.text;
        yield* tokens(markers.write(event.text), false);
      } else if (event.type === 'usage') {
        usage = {
          model: event.model,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          cacheReadTokens: event.cacheReadTokens,
          cacheWriteTokens: event.cacheWriteTokens,
        };
      } else {
        stopReason = event.reason;
      }
      const verdict = takeSafety();
      if (verdict) yield verdict;
    }
  } catch (err) {
    if (aborted()) {
      yield* finish('aborted');
      return;
    }
    // The answer failed, but an emergency is still an emergency: send the
    // verdict before the error so the help card can show.
    await safetyPending;
    const verdict = takeSafety();
    if (verdict) yield verdict;
    yield { type: 'error', code: 'generation_failed', message: errorMessage(err), retryable: true };
    return;
  }
  if (aborted()) {
    yield* finish('aborted');
    return;
  }
  timings.streamEnd = elapsed();

  // A refusal carries no usable answer: no `final` is sent, a client should
  // discard the tokens it was shown, and the safety verdict below is what the
  // person is left with.
  if (stopReason !== 'refusal') {
    yield* tokens(markers.flush(), true);
    const parts = config.prompt.sections ? splitSections(raw) : { lead: raw, detail: '' };
    const whole = parts.detail ? `${parts.lead}\n\n${parts.detail}` : parts.lead;
    const cited = extractCitations(whole, chunks) as { text: string; sources: Source[] };
    yield {
      type: 'final',
      text: cited.text,
      marked: whole,
      lead: lead.trim(),
      sources: cited.sources,
    };
  }
  if (usage) yield { type: 'usage', ...usage };

  await safetyPending;
  const late = takeSafety();
  if (late) yield late;

  yield* finish(stopReason);
}
