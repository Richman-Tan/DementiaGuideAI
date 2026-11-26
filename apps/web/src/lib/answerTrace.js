// How one answer was produced, as the app keeps and shows it.
//
// The server's stream already says what it searched for, which passages came
// back and how well they matched, what the emergency check found, how long
// each stage took and how many tokens were used. buildTrace keeps those facts
// with the answer; the formatters put them in words for the panel under it
// (components/AnswerTrace.jsx).
//
// It holds nothing the visitor did not already have: their own question, and
// facts about the answer to it.
import { listCostUsd } from '@core/rag/prices.ts';

export function buildTrace({ meta, retrieval, safety, usage, timings, stopReason, sources }) {
  if (!meta) return null;
  // Which passages the answer cited, and under what number.
  const cited = new Map((sources || []).map((s) => [s.id, s.num]));
  return {
    model: meta.model,
    pipelineVersion: meta.pipelineVersion,
    promptVersion: meta.promptVersion,
    modality: meta.modality,
    search: retrieval
      ? {
          mode: retrieval.mode,
          query: retrieval.query,
          ms: retrieval.ms,
          passages: retrieval.chunks.map((c) => ({
            id: c.id,
            title: c.title,
            org: c.org,
            similarity: c.similarity,
            cited: cited.get(c.id) ?? null,
          })),
        }
      : null,
    safety: safety
      ? { level: safety.level, categories: safety.categories, source: safety.source }
      : null,
    usage: usage
      ? {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadTokens: usage.cacheReadTokens,
          cacheWriteTokens: usage.cacheWriteTokens,
          // At list prices, for the answering model alone; null when there is no price for it.
          costUsd: listCostUsd(usage),
        }
      : null,
    timings: timings
      ? {
          search: timings.retrievalDone ?? null,
          firstWords: timings.firstToken ?? null,
          total: timings.total,
        }
      : null,
    stopReason: stopReason ?? null,
  };
}

/**
 * A duration for reading: "40 ms", "1.2 s". The space is a non-breaking one, so
 * a narrow panel never leaves the unit alone on the next line.
 */
export function formatMs(ms) {
  if (ms == null) return null;
  return ms < 1000 ? `${Math.round(ms)}\u00a0ms` : `${(ms / 1000).toFixed(1)}\u00a0s`;
}

/** A small sum for reading. Answers cost fractions of a cent, so four decimals. */
export function formatUsd(amount) {
  if (amount == null) return null;
  return amount < 0.0001 ? 'under US$0.0001' : `US$${amount.toFixed(4)}`;
}

const count = (n) => n.toLocaleString('en-NZ');

/** "900 in, 240 out, 1,000 read from cache". */
export function formatTokens(usage) {
  const parts = [`${count(usage.inputTokens)} in`, `${count(usage.outputTokens)} out`];
  if (usage.cacheReadTokens) parts.push(`${count(usage.cacheReadTokens)} read from cache`);
  if (usage.cacheWriteTokens) parts.push(`${count(usage.cacheWriteTokens)} written to cache`);
  return parts.join(', ');
}

const SEARCH_OUTCOME = {
  none: 'Nothing in the library matched closely enough, so this answer cites no passage.',
  failed: 'The library search failed, so this answer was written without passages.',
};

/** What to say when no passages are listed, or null when there are some. */
export const searchOutcome = (search) =>
  search.passages.length ? null : (SEARCH_OUTCOME[search.mode] ?? SEARCH_OUTCOME.none);

/** "No emergency found, judged by a model". */
export function formatSafety(safety) {
  const by = safety.source === 'triage' ? 'judged by a model' : 'by a keyword check';
  if (safety.level === 'none') return `No emergency found, ${by}`;
  const what = safety.categories.length
    ? `: ${safety.categories.map((c) => c.replace(/_/g, ' ')).join(', ')}`
    : '';
  const level = safety.level === 'emergency' ? 'Possible emergency' : 'Take care';
  return `${level}${what}, ${by}`;
}
