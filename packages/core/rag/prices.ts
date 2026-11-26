// What the answering model costs, for estimates.
//
// Used by the evaluation runner's spend guard and by the app's "how this
// answer was made" panel. These are Anthropic's list prices as cached on the
// date below, in US dollars per million tokens. Two figures are assumptions,
// not published numbers: `cacheWrite` is taken as 1.25 x input for every model,
// and `cacheRead` for claude-haiku-5-5 as 0.1 x input. Check the pricing page
// before relying on a total.
import type { Usage } from './pipeline/types.ts';

export interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const PRICES_CACHED_ON = '2026-11-03';

export const LIST_PRICES: Record<string, Price> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

/** What these tokens cost at this price, in US dollars. */
export function costUsd(usage: Omit<Usage, 'model'> & { model?: string }, price: Price): number {
  return (
    (usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      usage.cacheReadTokens * price.cacheRead +
      usage.cacheWriteTokens * price.cacheWrite) /
    1_000_000
  );
}

/** The cost of a model's usage at list prices, or null for a model with no price here. */
export function listCostUsd(usage: Usage): number | null {
  const price = LIST_PRICES[usage.model];
  return price ? costUsd(usage, price) : null;
}
