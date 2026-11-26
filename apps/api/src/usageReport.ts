// What the admin tool's Usage page is shown: the daily trace summary, with a
// cost worked out for each line, and how much of today's budget is used.
//
// A cost here is tokens times the list prices in packages/core/rag/prices.ts.
// It is an estimate of a bill, not the bill, and the page says so.
import { LIST_PRICES, PRICES_CACHED_ON, costUsd } from '../../../packages/core/rag/prices.ts';

/** A row of the `turn_traces_daily` view, as the database returns it. */
export interface DailyTraceRow {
  day: string;
  modality: string;
  model: string | null;
  pipeline_version: string;
  turns: number;
  failed: number;
  interrupted: number;
  without_passages: number;
  emergencies: number;
  first_token_p50_ms: number | null;
  first_token_p95_ms: number | null;
  total_p50_ms: number | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

/** A row of `daily_spend`. */
export interface SpendRow {
  day: string;
  reserved_micros: number;
  spent_micros: number;
}

export interface UsageLine {
  day: string;
  modality: string;
  model: string | null;
  pipelineVersion: string;
  turns: number;
  failed: number;
  interrupted: number;
  withoutPassages: number;
  emergencies: number;
  firstWordP50Ms: number | null;
  firstWordP95Ms: number | null;
  totalP50Ms: number | null;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  /** At list prices; null for a model with no price here. */
  estimatedCostUsd: number | null;
}

export interface UsageReport {
  /** The date the list prices were last checked. */
  pricesAsOf: string;
  /** The first and last day covered, inclusive. */
  from: string;
  to: string;
  totals: {
    turns: number;
    failed: number;
    interrupted: number;
    withoutPassages: number;
    emergencies: number;
    /** Null if any line could not be priced: a total that leaves some out would mislead. */
    estimatedCostUsd: number | null;
  };
  /** One line for each day, kind of turn, model and pipeline version; newest day first. */
  lines: UsageLine[];
  /**
   * Today against the dollar budget. `limitUsd` is null when no budget is set;
   * the whole thing is null when the budget's table could not be read.
   */
  today: { day: string; limitUsd: number | null; spentUsd: number; reservedUsd: number } | null;
}

// Counts and sums arrive as numbers, or as text when Postgres thinks they
// might not fit in one.
const n = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};
const optional = (value: unknown): number | null =>
  value === null || value === undefined ? null : n(value);

function toLine(row: DailyTraceRow): UsageLine {
  const tokens = {
    input: n(row.input_tokens),
    output: n(row.output_tokens),
    cacheRead: n(row.cache_read_tokens),
    cacheWrite: n(row.cache_write_tokens),
  };
  const price = row.model ? LIST_PRICES[row.model] : undefined;
  return {
    day: row.day,
    modality: row.modality,
    model: row.model,
    pipelineVersion: row.pipeline_version,
    turns: n(row.turns),
    failed: n(row.failed),
    interrupted: n(row.interrupted),
    withoutPassages: n(row.without_passages),
    emergencies: n(row.emergencies),
    firstWordP50Ms: optional(row.first_token_p50_ms),
    firstWordP95Ms: optional(row.first_token_p95_ms),
    totalP50Ms: optional(row.total_p50_ms),
    tokens,
    estimatedCostUsd: price
      ? costUsd(
          {
            inputTokens: tokens.input,
            outputTokens: tokens.output,
            cacheReadTokens: tokens.cacheRead,
            cacheWriteTokens: tokens.cacheWrite,
          },
          price
        )
      : null,
  };
}

const byNewest = (a: UsageLine, b: UsageLine) =>
  b.day.localeCompare(a.day) ||
  a.modality.localeCompare(b.modality) ||
  String(a.model).localeCompare(String(b.model)) ||
  a.pipelineVersion.localeCompare(b.pipelineVersion);

export function buildUsageReport({
  traces,
  spend,
  from,
  to,
  dailyLimitUsd,
}: {
  traces: DailyTraceRow[];
  /** Null when the budget's table could not be read. */
  spend: SpendRow[] | null;
  from: string;
  to: string;
  dailyLimitUsd: number | null;
}): UsageReport {
  const lines = traces.map(toLine).sort(byNewest);
  const sum = (pick: (line: UsageLine) => number) => lines.reduce((t, line) => t + pick(line), 0);
  const today = spend?.find((row) => row.day === to);
  return {
    pricesAsOf: PRICES_CACHED_ON,
    from,
    to,
    totals: {
      turns: sum((l) => l.turns),
      failed: sum((l) => l.failed),
      interrupted: sum((l) => l.interrupted),
      withoutPassages: sum((l) => l.withoutPassages),
      emergencies: sum((l) => l.emergencies),
      estimatedCostUsd: lines.some((l) => l.estimatedCostUsd === null)
        ? null
        : sum((l) => l.estimatedCostUsd as number),
    },
    lines,
    today: spend
      ? {
          day: to,
          limitUsd: dailyLimitUsd,
          spentUsd: n(today?.spent_micros) / 1_000_000,
          reservedUsd: n(today?.reserved_micros) / 1_000_000,
        }
      : null,
  };
}
