// What is kept about a turn (src/trace.ts): the row built from a finished
// turn, and the store that writes it without ever costing anyone their answer.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTraceStore, toTraceRow } from '../src/trace.ts';
import type { TraceRow } from '../src/trace.ts';
import type { TurnSummary } from '../src/turn.ts';

const QUESTION = 'Mum hit me last night and I am frightened. What should I do?';

const summary = (overrides: Partial<TurnSummary> = {}): TurnSummary => ({
  userId: 'user-1',
  request: {
    message: QUESTION,
    history: [
      { role: 'user', content: 'She gets restless in the evening.' },
      { role: 'assistant', content: 'That is often called sundowning.' },
    ],
    modality: 'voice',
    settings: {
      assistantName: 'Aaron',
      responseStyle: 'balanced',
      jargonMode: 'explain',
      personality: 'warm',
      conciseMode: false,
      isCaregiverSetup: true,
    },
  },
  stopReason: 'end_turn',
  errorCode: null,
  usage: {
    model: 'claude-opus-5-5',
    inputTokens: 900,
    outputTokens: 120,
    cacheReadTokens: 1000,
    cacheWriteTokens: 50,
  },
  timings: { retrievalDone: 310.4, llmSend: 312, firstToken: 1480.6, streamEnd: 4200, total: 4215 },
  pipelineVersion: 'p-2026-11',
  promptVersion: 'v3-claude-nz',
  model: 'claude-opus-5-5',
  retrieval: {
    mode: 'fresh',
    chunks: [
      { id: 'kb-7', similarity: 0.71234 },
      { id: 'kb-2', similarity: null },
    ],
    ms: 298.7,
  },
  safety: { level: 'caution', source: 'triage' },
  cited: ['kb-7'],
  answerChars: 640,
  ...overrides,
});

afterEach(() => vi.restoreAllMocks());

describe('the trace of a finished turn', () => {
  it('says what the pipeline did', () => {
    expect(toTraceRow(summary())).toEqual({
      pipeline_version: 'p-2026-11',
      prompt_version: 'v3-claude-nz',
      model: 'claude-opus-5-5',
      modality: 'voice',
      stop_reason: 'end_turn',
      error_code: null,
      history_turns: 2,
      question_chars: QUESTION.length,
      answer_chars: 640,
      retrieval_mode: 'fresh',
      retrieved: [
        { id: 'kb-7', similarity: 0.712 },
        { id: 'kb-2', similarity: null },
      ],
      cited: ['kb-7'],
      safety_level: 'caution',
      safety_source: 'triage',
      input_tokens: 900,
      output_tokens: 120,
      cache_read_tokens: 1000,
      cache_write_tokens: 50,
      retrieval_ms: 299,
      first_token_ms: 1481,
      stream_end_ms: 4200,
      total_ms: 4215,
    } satisfies TraceRow);
  });

  it('holds nothing that was said, and nothing that says who said it', () => {
    const written = JSON.stringify(toTraceRow(summary()));
    for (const said of [
      'frightened',
      'restless',
      'sundowning',
      'Aaron', // the settings are not kept either
      'user-1',
    ]) {
      expect(written, said).not.toContain(said);
    }
    // Only lengths and ids are strings a person did not choose.
    const row = toTraceRow(summary());
    expect(
      Object.keys(row).filter((key) => /user|message|question$|answer$|text/.test(key))
    ).toEqual([]);
  });

  it('records a turn that failed before the model answered, with what is known', () => {
    const row = toTraceRow(
      summary({
        stopReason: 'error',
        errorCode: 'generation_failed',
        usage: null,
        timings: null,
        cited: [],
        answerChars: null,
      })
    );
    expect(row).toMatchObject({
      stop_reason: 'error',
      error_code: 'generation_failed',
      // The model that was asked, since none answered.
      model: 'claude-opus-5-5',
      answer_chars: null,
      input_tokens: null,
      output_tokens: null,
      cache_read_tokens: null,
      cache_write_tokens: null,
      first_token_ms: null,
      stream_end_ms: null,
      total_ms: null,
      // The search had still run.
      retrieval_mode: 'fresh',
      retrieval_ms: 299,
    });
  });

  it('records a turn that never reached the pipeline’s first event', () => {
    const row = toTraceRow(
      summary({
        stopReason: 'error',
        errorCode: 'internal',
        usage: null,
        timings: null,
        promptVersion: null,
        model: null,
        retrieval: null,
        safety: null,
        cited: [],
        answerChars: null,
      })
    );
    expect(row).toMatchObject({
      prompt_version: null,
      model: null,
      retrieval_mode: null,
      retrieved: [],
      retrieval_ms: null,
      safety_level: null,
      safety_source: null,
    });
  });

  it('names the model that answered when it differs from the one asked', () => {
    // A fallback model can answer in place of the configured one.
    const row = toTraceRow(
      summary({
        model: 'claude-opus-5-5',
        usage: { ...summary().usage!, model: 'claude-sonnet-5-5' },
      })
    );
    expect(row.model).toBe('claude-sonnet-5-5');
  });

  it('keeps an interrupted turn’s timings up to where it stopped', () => {
    const row = toTraceRow(
      summary({ stopReason: 'aborted', timings: { retrievalDone: 300, total: 950.2 }, usage: null })
    );
    expect(row).toMatchObject({
      stop_reason: 'aborted',
      first_token_ms: null,
      stream_end_ms: null,
      total_ms: 950,
    });
  });

  it('never stores a negative time, whatever the clock did', () => {
    const row = toTraceRow(summary({ timings: { firstToken: -3, total: -0.2 } }));
    expect(row.first_token_ms).toBe(0);
    expect(row.total_ms).toBe(0);
  });
});

describe('writing traces', () => {
  const row = toTraceRow(summary());

  it('hands the row to the database', async () => {
    const insert = vi.fn(async () => 1);
    createTraceStore(insert)(row);
    expect(insert).toHaveBeenCalledWith(row);
  });

  it('does not throw or reject when the write fails, and says what to do about it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const record = createTraceStore(async () => {
      throw new Error('relation "public.turn_traces" does not exist');
    });
    expect(() => record(row)).not.toThrow();
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(warn.mock.calls[0]?.[0]).toContain('relation "public.turn_traces" does not exist');
    expect(warn.mock.calls[0]?.[0]).toContain('scripts/migrations/2026-11-27_turn_traces.sql');
  });

  it('does not throw when the write cannot even start', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const record = createTraceStore(() => {
      throw 'not configured';
    });
    expect(() => record(row)).not.toThrow();
    expect(warn.mock.calls[0]?.[0]).toContain('not configured');
  });

  it('logs the first failure only, so a missing table does not fill the log', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const insert = vi.fn(async () => {
      throw new Error('down');
    });
    const record = createTraceStore(insert);
    record(row);
    record(row);
    record(row);
    await vi.waitFor(() => expect(insert).toHaveBeenCalledTimes(3));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('Further failures are not logged');
  });
});
