// What is kept about a turn once it is over: what the pipeline did, never what
// was said.
//
// A trace has no question, no answer and no account id. Where there was text
// it has a length; for retrieval it has the ids of the passages found and
// cited. That is enough to say how long people waited, how often the search
// came back empty, and which passages earn their place, and it is nothing
// anyone would mind being read. The table and the reasoning for its columns
// are in scripts/migrations/2026-11-27_turn_traces.sql; the two must agree.
import type { TurnSummary } from './turn.ts';

/** One row of `turn_traces`. */
export interface TraceRow {
  pipeline_version: string;
  prompt_version: string | null;
  model: string | null;
  modality: 'text' | 'voice';
  stop_reason: string;
  error_code: string | null;
  history_turns: number;
  question_chars: number;
  answer_chars: number | null;
  retrieval_mode: string | null;
  retrieved: { id: string; similarity: number | null }[];
  cited: string[];
  safety_level: string | null;
  safety_source: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  retrieval_ms: number | null;
  first_token_ms: number | null;
  stream_end_ms: number | null;
  total_ms: number | null;
}

/** Whole milliseconds, or null for a stage the turn never reached. */
const ms = (value: number | undefined): number | null =>
  value === undefined ? null : Math.max(0, Math.round(value));

/** A similarity as stored: three decimal places are all a score is good for. */
const score = (value: number | null): number | null =>
  value === null ? null : Math.round(value * 1000) / 1000;

export function toTraceRow(summary: TurnSummary): TraceRow {
  const { request, usage, timings, retrieval, safety } = summary;
  return {
    pipeline_version: summary.pipelineVersion,
    prompt_version: summary.promptVersion,
    // The model that answered if it got that far, else the one that was asked.
    model: usage?.model ?? summary.model,
    modality: request.modality,
    stop_reason: summary.stopReason,
    error_code: summary.errorCode,
    history_turns: request.history.length,
    question_chars: request.message.length,
    answer_chars: summary.answerChars,
    retrieval_mode: retrieval?.mode ?? null,
    retrieved: (retrieval?.chunks ?? []).map(({ id, similarity }) => ({
      id,
      similarity: score(similarity),
    })),
    cited: summary.cited,
    safety_level: safety?.level ?? null,
    safety_source: safety?.source ?? null,
    input_tokens: usage?.inputTokens ?? null,
    output_tokens: usage?.outputTokens ?? null,
    cache_read_tokens: usage?.cacheReadTokens ?? null,
    cache_write_tokens: usage?.cacheWriteTokens ?? null,
    retrieval_ms: ms(retrieval?.ms),
    first_token_ms: ms(timings?.firstToken),
    stream_end_ms: ms(timings?.streamEnd),
    total_ms: ms(timings?.total),
  };
}

/**
 * Writes traces through `insert`, and never throws or rejects: a trace that
 * cannot be written must not cost anyone their answer. The first failure is
 * logged with what to do about it; the rest are counted, not repeated.
 */
export function createTraceStore(insert: (row: TraceRow) => Promise<unknown>) {
  let failures = 0;
  const failed = (err: unknown) => {
    failures += 1;
    if (failures > 1) return;
    console.warn(
      `[trace] could not record a turn: ${err instanceof Error ? err.message : String(err)}. ` +
        'If the table is missing, run scripts/migrations/2026-11-27_turn_traces.sql. ' +
        'Further failures are not logged.'
    );
  };
  return function recordTrace(row: TraceRow): void {
    try {
      insert(row).catch(failed);
    } catch (err) {
      failed(err);
    }
  };
}
