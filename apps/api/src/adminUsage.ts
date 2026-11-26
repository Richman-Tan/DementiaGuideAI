// GET /api/admin-usage — what the admin tool's Usage page shows.
//
// Admins only (the same sign-in and allowlist as the intake endpoint). It
// reads the daily summary of the turn traces and the budget's ledger; it holds
// nothing a trace does not, so no question, answer or account id passes
// through here either.
import { buildUsageReport } from './usageReport.ts';
import type { DailyTraceRow, SpendRow } from './usageReport.ts';
import type { Handler } from './http.ts';

export interface AdminUsageDeps {
  /** Answers the request itself and resolves to null unless the caller is an admin. */
  guard(req: Parameters<Handler>[0], res: Parameters<Handler>[1]): Promise<unknown | null>;
  /** Rows of a table or view, by a PostgREST query string. */
  select(table: string, query: string): Promise<unknown[]>;
  /** The daily budget in force, or null. */
  dailyLimitUsd: number | null;
  now?(): Date;
}

export const USAGE_DAYS = { default: 14, max: 90 };

/** How many days back to report: a whole number from 1 to the maximum, else the default. */
export function daysWanted(value: unknown): number {
  const days = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(days) && days >= 1 && days <= USAGE_DAYS.max ? days : USAGE_DAYS.default;
}

const utcDay = (date: Date) => date.toISOString().slice(0, 10);

export function createAdminUsageHandler(deps: AdminUsageDeps): Handler {
  return async function adminUsage(req, res) {
    if (!(await deps.guard(req, res))) return;

    const days = daysWanted((req as { query?: Record<string, unknown> }).query?.days);
    const end = (deps.now ?? (() => new Date()))();
    const to = utcDay(end);
    const from = utcDay(new Date(end.getTime() - (days - 1) * 86_400_000));
    const range = `day=gte.${from}&day=lte.${to}&order=day.desc`;

    let traces: DailyTraceRow[];
    try {
      traces = (await deps.select('turn_traces_daily', `select=*&${range}`)) as DailyTraceRow[];
    } catch (err) {
      console.error(
        `[admin] could not read the turn traces: ${err instanceof Error ? err.message : String(err)}`
      );
      res.status(503).json({
        error:
          'The turn traces could not be read. If they have never been set up, run scripts/migrations/2026-11-27_turn_traces.sql.',
      });
      return;
    }

    // The budget is optional, and so is its table.
    let spend: SpendRow[] | null = null;
    try {
      spend = (await deps.select(
        'daily_spend',
        `select=day,reserved_micros,spent_micros&day=eq.${to}`
      )) as SpendRow[];
    } catch (err) {
      console.warn(
        `[admin] could not read the budget: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    res
      .status(200)
      .json(buildUsageReport({ traces, spend, from, to, dailyLimitUsd: deps.dailyLimitUsd }));
  };
}
