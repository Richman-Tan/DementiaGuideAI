import { costUsd, LIST_PRICES, listCostUsd, PRICES_CACHED_ON } from './prices.ts';

const usage = (model: string) => ({
  model,
  inputTokens: 900,
  outputTokens: 120,
  cacheReadTokens: 1000,
  cacheWriteTokens: 50,
});

describe('prices', () => {
  it('prices each kind of token at its own rate, per million', () => {
    const price = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };
    // 900 x 4 + 120 x 20 + 1000 x 0.2 + 50 x 5 = 6,450 millionths of a dollar.
    expect(costUsd(usage('any'), price)).toBeCloseTo(0.00645, 8);
    expect(
      costUsd(
        { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        price
      )
    ).toBe(4);
  });

  it('prices the three Claude models the pipeline can run', () => {
    expect(Object.keys(LIST_PRICES)).toEqual([
      'claude-opus-5-5',
      'claude-sonnet-5-5',
      'claude-haiku-5-5',
    ]);
    expect(listCostUsd(usage('claude-opus-5-5'))).toBeCloseTo(0.00645, 8);
    expect(listCostUsd(usage('claude-haiku-5-5'))).toBeLessThan(
      listCostUsd(usage('claude-sonnet-5-5')) as number
    );
  });

  it('gives no figure for a model it has no price for, rather than a wrong one', () => {
    expect(listCostUsd(usage('some-other-model'))).toBeNull();
  });

  it('says when the prices were cached', () => {
    expect(PRICES_CACHED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
