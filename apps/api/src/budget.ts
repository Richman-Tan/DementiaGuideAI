// The cap on what a day can cost, in dollars.
//
// The request counters (admission.ts) bound a day at "the limit times the most
// one turn can cost", which is about ten times what a day of ordinary turns
// costs. This is the cap as a number of dollars: before a turn calls the
// model, the most it could cost is set aside from today's budget; if there is
// no room, the turn is refused before it has cost anything. When the turn
// ends, what it really cost takes the reservation's place.
//
// The arithmetic is done in Postgres, in one statement per step
// (scripts/migrations/2026-11-27_daily_spend.sql), because functions keep no
// state between calls and two turns can arrive together.
//
// It covers the model calls, which are billed by use with no ceiling of their
// own. Speech is billed against a plan's monthly allowance, which is a ceiling
// already; it stays on its request counters.
//
// Prices are the list prices in packages/core/rag/prices.ts. They are
// estimates of a bill, not the bill: set a hard limit on the provider account
// as well.
import { LIST_PRICES, costUsd } from '../../../packages/core/rag/prices.ts';
import type { Price } from '../../../packages/core/rag/prices.ts';
import { HELPER_MODEL } from '../../../packages/core/rag/providers/claude.ts';
import type { PipelineConfig, Usage } from '../../../packages/core/rag/pipeline/types.ts';
import type { TurnRequest } from './turnRequest.ts';

/** A dollar amount as whole millionths, rounded up: a cap should never round in the spender's favour. */
export const toMicros = (usd: number): number =>
  // The small allowance stops 0.1 + 0.2 becoming 300001; the floor stops zero becoming -0.
  Math.max(0, Math.ceil(usd * 1_000_000 - 1e-9));

/** A limit from the environment: dollars, more than zero. Anything else means no budget. */
export function budgetLimit(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const usd = Number(value);
  return Number.isFinite(usd) && usd > 0 ? usd : null;
}

// How many characters the text sent to the model can run to, and how few
// characters a token can be. Both err high, because this is a ceiling.
const CHARS_PER_TOKEN = 3;
/** A knowledge-base passage is a few paragraphs; this is well over the longest. */
const PASSAGE_CHARS = 4000;
/** The two helper calls (the safety check and the follow-up rewrite) each answer in a line. */
const HELPER_OUTPUT_TOKENS = 1024;

const tokens = (chars: number) => Math.ceil(chars / CHARS_PER_TOKEN);

/** The dearest rate input can be billed at: writing it to the cache costs more than reading it plain. */
const inputRate = (price: Price) => Math.max(price.input, price.cacheWrite);

/** The most a turn could cost, in dollars, and how much of that is the helper calls. */
export interface TurnCeiling {
  totalUsd: number;
  helpersUsd: number;
}

/**
 * The most this turn could cost: every character it can send priced as input
 * at the dearest rate, the answer running to its full length, and both helper
 * calls. Null when a model has no list price, in which case there is nothing
 * to budget with.
 */
export function turnCeiling(request: TurnRequest, config: PipelineConfig): TurnCeiling | null {
  const generation = config.generation[request.modality];
  const price = LIST_PRICES[generation.model];
  const helper = LIST_PRICES[HELPER_MODEL];
  if (!price || !helper) return null;

  const system = config.prompt.system(request.settings, request.modality);
  const conversation =
    request.message.length + request.history.reduce((sum, turn) => sum + turn.content.length, 0);
  const sent =
    system.stable.length +
    system.perTurn.length +
    conversation +
    config.retrieval.topK * PASSAGE_CHARS;

  const answerUsd =
    (tokens(sent) * inputRate(price) + generation.maxTokens * price.output) / 1_000_000;
  // Each helper reads the conversation and writes a line.
  const helpersUsd =
    (2 * (tokens(conversation) * inputRate(helper) + HELPER_OUTPUT_TOKENS * helper.output)) /
    1_000_000;
  return { totalUsd: answerUsd + helpersUsd, helpersUsd };
}

/** How a turn ended, as far as charging for it goes. */
export interface TurnOutcome {
  usage: Usage | null;
  stopReason: string;
  /** Present once the question had been sent to the model. */
  timings: { llmSend?: number } | null;
}

/**
 * What to charge for a finished turn, in dollars.
 *
 * - It answered: what the tokens cost, plus the helper calls at their ceiling
 *   (their own usage is not reported, and it is a fraction of a cent).
 * - It was interrupted after the question went to the model: the whole
 *   ceiling. The model was running and its usage never arrived, so nobody can
 *   show that less was spent.
 * - It ended before the model was asked, or the model call failed: the helper
 *   calls only. A provider does not bill for a request it failed, and charging
 *   the ceiling would let an outage use up the day.
 */
export function turnChargeUsd(outcome: TurnOutcome, ceiling: TurnCeiling): number {
  if (outcome.usage) {
    const price = LIST_PRICES[outcome.usage.model];
    // A model with no list price answered: the ceiling, since its cost is unknown.
    return price ? costUsd(outcome.usage, price) + ceiling.helpersUsd : ceiling.totalUsd;
  }
  const modelWasRunning =
    outcome.stopReason === 'aborted' && outcome.timings?.llmSend !== undefined;
  return modelWasRunning ? ceiling.totalUsd : ceiling.helpersUsd;
}

/** Money set aside for a turn in progress. */
export interface Reservation {
  /** The UTC day it was set aside under, as the database gave it. */
  day: string;
  micros: number;
}

export interface Budget {
  /**
   * Sets `usd` aside from today's budget. Null when today has no room for it.
   * Rejects if the budget cannot be reached: the caller must then refuse the
   * turn, because a cap that lets requests through when it cannot count is not
   * a cap.
   */
  reserve(usd: number): Promise<Reservation | null>;
  /** Replaces a reservation with what was spent. Never throws or rejects. */
  settle(reservation: Reservation, spentUsd: number): void;
}

export function createBudget({
  rpc,
  dailyLimitUsd,
}: {
  rpc(fn: string, args: Record<string, unknown>): Promise<unknown>;
  dailyLimitUsd: number;
}): Budget {
  const limit = toMicros(dailyLimitUsd);
  return {
    async reserve(usd) {
      const micros = toMicros(usd);
      const day = await rpc('spend_reserve', { p_micros: micros, p_limit_micros: limit });
      if (day === null) return null;
      if (typeof day !== 'string') {
        throw new Error(`spend_reserve answered ${JSON.stringify(day)}, not a day`);
      }
      return { day, micros };
    },
    settle(reservation, spentUsd) {
      const args = {
        p_day: reservation.day,
        p_reserved_micros: reservation.micros,
        p_spent_micros: toMicros(Math.max(0, spentUsd)),
      };
      const failed = (err: unknown) =>
        // The reservation stays, so the day stops early rather than late.
        console.error(
          `[budget] could not settle a turn: ${err instanceof Error ? err.message : String(err)}`
        );
      try {
        rpc('spend_settle', args).catch(failed);
      } catch (err) {
        failed(err);
      }
    },
  };
}

/**
 * The budget as the turn endpoint uses it: set aside this turn's ceiling, and
 * get back how to settle it once the turn has ended. Null when today has no
 * room. Rejects when the budget cannot be reached or the model cannot be
 * priced; either way the turn must be refused.
 */
export function createTurnBudget(budget: Budget, config: PipelineConfig) {
  return async function reserve(
    request: TurnRequest
  ): Promise<((outcome: TurnOutcome) => void) | null> {
    const ceiling = turnCeiling(request, config);
    if (!ceiling) {
      throw new Error(
        `no list price for ${config.generation[request.modality].model}, so a turn cannot be budgeted for`
      );
    }
    const reservation = await budget.reserve(ceiling.totalUsd);
    if (!reservation) return null;
    return (outcome) => budget.settle(reservation, turnChargeUsd(outcome, ceiling));
  };
}
