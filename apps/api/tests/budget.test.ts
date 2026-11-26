// The cap on what a day can cost, in dollars (src/budget.ts): the ceiling set
// aside for a turn, what a finished turn is charged, and the calls that keep
// the day's total in the database.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  budgetLimit,
  createBudget,
  createTurnBudget,
  toMicros,
  turnCeiling,
  turnChargeUsd,
} from '../src/budget.ts';
import type { TurnCeiling } from '../src/budget.ts';
import type { TurnRequest } from '../src/turnRequest.ts';
import { pipelineConfig } from '../../../packages/core/rag/pipelineConfig.ts';
import { LIST_PRICES, costUsd } from '../../../packages/core/rag/prices.ts';
import { HELPER_MODEL } from '../../../packages/core/rag/providers/claude.ts';

const request = (overrides: Partial<TurnRequest> = {}): TurnRequest => ({
  message: 'How do I manage sundowning?',
  history: [],
  modality: 'text',
  settings: {
    assistantName: 'Aaron',
    responseStyle: 'balanced',
    jargonMode: 'explain',
    personality: 'warm',
    conciseMode: false,
    isCaregiverSetup: true,
  },
  ...overrides,
});

const USAGE = {
  model: 'claude-opus-5-5',
  inputTokens: 900,
  outputTokens: 120,
  cacheReadTokens: 1000,
  cacheWriteTokens: 50,
};

afterEach(() => vi.restoreAllMocks());

describe('amounts', () => {
  it('are whole millionths of a dollar, rounded up', () => {
    expect(toMicros(1)).toBe(1_000_000);
    expect(toMicros(0.3625)).toBe(362_500);
    expect(toMicros(0.0000001)).toBe(1);
    expect(toMicros(0)).toBe(0);
    // A figure that is exact in dollars is not pushed up by floating point.
    expect(toMicros(0.1 + 0.2)).toBe(300_000);
  });

  it('reads the daily limit from the environment, and takes anything else as no budget', () => {
    expect(budgetLimit('5')).toBe(5);
    expect(budgetLimit('2.50')).toBe(2.5);
    for (const none of [undefined, '', '  ', '0', '-3', 'ten', 'NaN', 'Infinity']) {
      expect(budgetLimit(none), String(none)).toBeNull();
    }
  });
});

describe('the most a turn could cost', () => {
  const config = pipelineConfig();

  it('is the full answer, everything sent priced as input, and both helper calls', () => {
    const ceiling = turnCeiling(request(), config)!;
    const price = LIST_PRICES['claude-opus-5-5']!;
    // The answer running to its limit is most of it.
    const answer = (config.generation.text.maxTokens * price.output) / 1_000_000;
    expect(ceiling.totalUsd).toBeGreaterThan(answer);
    expect(ceiling.totalUsd).toBeLessThan(answer * 1.25);
    expect(ceiling.helpersUsd).toBeGreaterThan(0);
    expect(ceiling.helpersUsd).toBeLessThan(0.01);
  });

  it('is above what any turn of the kind the tests use really costs', () => {
    const ceiling = turnCeiling(request(), config)!;
    expect(ceiling.totalUsd).toBeGreaterThan(costUsd(USAGE, LIST_PRICES['claude-opus-5-5']!) * 10);
  });

  it('grows with the conversation sent, and is lower for a spoken turn', () => {
    const short = turnCeiling(request(), config)!;
    const long = turnCeiling(
      request({ history: [{ role: 'user', content: 'x'.repeat(6000) }] }),
      config
    )!;
    expect(long.totalUsd).toBeGreaterThan(short.totalUsd);
    expect(long.helpersUsd).toBeGreaterThan(short.helpersUsd);
    const spoken = turnCeiling(request({ modality: 'voice' }), config)!;
    expect(spoken.totalUsd).toBeLessThan(short.totalUsd);
  });

  it('follows the model: a cheaper one has a lower ceiling', () => {
    const opus = turnCeiling(request(), pipelineConfig({ model: 'claude-opus-5-5' }))!;
    const haiku = turnCeiling(request(), pipelineConfig({ model: 'claude-haiku-5-5' }))!;
    expect(haiku.totalUsd).toBeLessThan(opus.totalUsd / 10);
  });

  it('prices input at the dearest rate it can be billed at', () => {
    // Writing the prompt to the cache costs more than sending it plain.
    for (const price of Object.values(LIST_PRICES)) {
      expect(price.cacheWrite).toBeGreaterThanOrEqual(price.input);
    }
  });

  it('is unknown for a model with no list price', () => {
    expect(turnCeiling(request(), pipelineConfig({ model: 'some-future-model' }))).toBeNull();
    expect(LIST_PRICES[HELPER_MODEL]).toBeDefined();
  });
});

describe('what a finished turn is charged', () => {
  const ceiling: TurnCeiling = { totalUsd: 0.36, helpersUsd: 0.001 };

  it('is what the tokens cost, plus the helper calls, when it answered', () => {
    const charge = turnChargeUsd({ usage: USAGE, stopReason: 'end_turn', timings: {} }, ceiling);
    expect(charge).toBeCloseTo(costUsd(USAGE, LIST_PRICES['claude-opus-5-5']!) + 0.001, 10);
    expect(charge).toBeLessThan(ceiling.totalUsd);
  });

  it('is the whole ceiling when a model with no list price answered', () => {
    const usage = { ...USAGE, model: 'some-fallback-model' };
    expect(turnChargeUsd({ usage, stopReason: 'end_turn', timings: {} }, ceiling)).toBe(0.36);
  });

  it('is the whole ceiling when it was interrupted while the model was writing', () => {
    expect(
      turnChargeUsd({ usage: null, stopReason: 'aborted', timings: { llmSend: 300 } }, ceiling)
    ).toBe(0.36);
  });

  it('is only the helper calls when it was interrupted before the model was asked', () => {
    expect(turnChargeUsd({ usage: null, stopReason: 'aborted', timings: {} }, ceiling)).toBe(0.001);
    expect(turnChargeUsd({ usage: null, stopReason: 'aborted', timings: null }, ceiling)).toBe(
      0.001
    );
  });

  it('is only the helper calls when the model call failed, so an outage cannot use up the day', () => {
    expect(
      turnChargeUsd({ usage: null, stopReason: 'error', timings: { llmSend: 300 } }, ceiling)
    ).toBe(0.001);
  });
});

describe('the day’s budget', () => {
  const rpcReturning = (...answers: unknown[]) =>
    vi.fn(async (_fn: string, _args: Record<string, unknown>) => answers.shift());

  it('sets an amount aside against the limit, both in millionths', async () => {
    const rpc = rpcReturning('2026-11-27');
    const budget = createBudget({ rpc, dailyLimitUsd: 5 });
    expect(await budget.reserve(0.3625)).toEqual({ day: '2026-11-27', micros: 362_500 });
    expect(rpc).toHaveBeenCalledWith('spend_reserve', {
      p_micros: 362_500,
      p_limit_micros: 5_000_000,
    });
  });

  it('says so when today has no room', async () => {
    const budget = createBudget({ rpc: rpcReturning(null), dailyLimitUsd: 5 });
    expect(await budget.reserve(0.3625)).toBeNull();
  });

  it('fails, rather than letting a turn through, when the answer is not a day', async () => {
    for (const odd of [true, 1, undefined, { day: '2026-11-27' }]) {
      const budget = createBudget({ rpc: rpcReturning(odd), dailyLimitUsd: 5 });
      await expect(budget.reserve(0.1)).rejects.toThrow(/spend_reserve answered/);
    }
  });

  it('fails when the database cannot be reached', async () => {
    const budget = createBudget({
      rpc: async () => {
        throw new Error('function public.spend_reserve does not exist');
      },
      dailyLimitUsd: 5,
    });
    await expect(budget.reserve(0.1)).rejects.toThrow('does not exist');
  });

  it('settles a reservation with what was spent, under the day it was made', () => {
    const rpc = rpcReturning(null);
    createBudget({ rpc, dailyLimitUsd: 5 }).settle({ day: '2026-11-27', micros: 362_500 }, 0.0412);
    expect(rpc).toHaveBeenCalledWith('spend_settle', {
      p_day: '2026-11-27',
      p_reserved_micros: 362_500,
      p_spent_micros: 41_200,
    });
  });

  it('never settles a negative amount', () => {
    const rpc = rpcReturning(null);
    createBudget({ rpc, dailyLimitUsd: 5 }).settle({ day: '2026-11-27', micros: 100 }, -1);
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_spent_micros: 0 });
  });

  it('does not throw or reject when settling fails; the reservation simply stays', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = createBudget({
      rpc: async () => {
        throw new Error('connection reset');
      },
      dailyLimitUsd: 5,
    });
    expect(() => failing.settle({ day: '2026-11-27', micros: 100 }, 0.01)).not.toThrow();
    await vi.waitFor(() => expect(log).toHaveBeenCalledTimes(1));
    expect(log.mock.calls[0]?.[0]).toBe('[budget] could not settle a turn: connection reset');

    const broken = createBudget({
      rpc: () => {
        throw 'not configured';
      },
      dailyLimitUsd: 5,
    });
    expect(() => broken.settle({ day: '2026-11-27', micros: 100 }, 0.01)).not.toThrow();
    expect(log.mock.calls[1]?.[0]).toBe('[budget] could not settle a turn: not configured');
  });
});

describe('the budget as a turn uses it', () => {
  const config = pipelineConfig();
  const fake = () => {
    const reserve = vi.fn(async (usd: number) => ({ day: '2026-11-27', micros: toMicros(usd) }));
    const settle = vi.fn();
    return { reserve, settle };
  };

  it('sets aside the turn’s ceiling, and settles with what the turn is charged', async () => {
    const budget = fake();
    const settle = await createTurnBudget(budget, config)(request());
    const ceiling = turnCeiling(request(), config)!;
    expect(budget.reserve).toHaveBeenCalledWith(ceiling.totalUsd);

    settle!({ usage: USAGE, stopReason: 'end_turn', timings: { llmSend: 300 } });
    expect(budget.settle).toHaveBeenCalledWith(
      { day: '2026-11-27', micros: toMicros(ceiling.totalUsd) },
      costUsd(USAGE, LIST_PRICES['claude-opus-5-5']!) + ceiling.helpersUsd
    );
  });

  it('gives nothing to settle when today has no room', async () => {
    const budget = { reserve: vi.fn(async () => null), settle: vi.fn() };
    expect(await createTurnBudget(budget, config)(request())).toBeNull();
    expect(budget.settle).not.toHaveBeenCalled();
  });

  it('fails for a model it cannot price, before setting anything aside', async () => {
    const budget = fake();
    const reserve = createTurnBudget(budget, pipelineConfig({ model: 'some-future-model' }));
    await expect(reserve(request())).rejects.toThrow(
      'no list price for some-future-model, so a turn cannot be budgeted for'
    );
    expect(budget.reserve).not.toHaveBeenCalled();
  });
});
