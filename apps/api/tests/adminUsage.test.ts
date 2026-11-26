// The admin tool's Usage page (src/usageReport.ts, src/adminUsage.ts): what is
// reported, who may ask, and what happens when the tables are not there.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdminUsageHandler, daysWanted, USAGE_DAYS } from '../src/adminUsage.ts';
import type { AdminUsageDeps } from '../src/adminUsage.ts';
import { buildUsageReport } from '../src/usageReport.ts';
import type { DailyTraceRow, SpendRow } from '../src/usageReport.ts';
import type { ApiRequest, ApiResponse } from '../src/http.ts';
import { PRICES_CACHED_ON } from '../../../packages/core/rag/prices.ts';
import { load as loadModule, makeReq, makeRes, ORIGIN } from './helpers.js';

// The shared helpers are plain JavaScript, so their options are typed here.
const load = loadModule as unknown as (
  path: string,
  options: { env?: Record<string, string | undefined>; admin?: Record<string, unknown> }
) => Promise<{ mod: { default: unknown } }>;
/** A GET as the platform delivers it, with its query string already parsed. */
const getWith = (query: Record<string, string> = {}) =>
  Object.assign(
    (makeReq as unknown as (options: Record<string, unknown>) => ApiRequest)({ method: 'GET' }),
    { query }
  );

const row = (overrides: Partial<DailyTraceRow> = {}): DailyTraceRow => ({
  day: '2026-11-27',
  modality: 'text',
  model: 'claude-opus-5-5',
  pipeline_version: 'v3@abc',
  turns: 10,
  failed: 1,
  interrupted: 2,
  without_passages: 1,
  emergencies: 0,
  first_token_p50_ms: 1500,
  first_token_p95_ms: 4200,
  total_p50_ms: 6100,
  input_tokens: 9000,
  output_tokens: 1200,
  cache_read_tokens: 10000,
  cache_write_tokens: 500,
  ...overrides,
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('the usage report', () => {
  const report = (
    traces: DailyTraceRow[],
    spend: SpendRow[] | null = [],
    limit: number | null = 5
  ) =>
    buildUsageReport({
      traces,
      spend,
      from: '2026-11-14',
      to: '2026-11-27',
      dailyLimitUsd: limit,
    });

  it('prices each line from its tokens at list prices', () => {
    const [line] = report([row()]).lines;
    // 9000 in at $4, 1200 out at $20, 10000 read at $0.20 and 500 written at $5, per million.
    expect(line?.estimatedCostUsd).toBeCloseTo(0.036 + 0.024 + 0.002 + 0.0025, 10);
    expect(line).toMatchObject({
      day: '2026-11-27',
      modality: 'text',
      model: 'claude-opus-5-5',
      pipelineVersion: 'v3@abc',
      turns: 10,
      failed: 1,
      interrupted: 2,
      withoutPassages: 1,
      emergencies: 0,
      firstWordP50Ms: 1500,
      firstWordP95Ms: 4200,
      totalP50Ms: 6100,
      tokens: { input: 9000, output: 1200, cacheRead: 10000, cacheWrite: 500 },
    });
  });

  it('says when the prices were last checked, and which days it covers', () => {
    expect(report([])).toMatchObject({
      pricesAsOf: PRICES_CACHED_ON,
      from: '2026-11-14',
      to: '2026-11-27',
      lines: [],
      totals: { turns: 0, failed: 0, estimatedCostUsd: 0 },
    });
  });

  it('puts the newest day first, and within a day orders by kind, model and version', () => {
    const lines = report([
      row({ day: '2026-11-26' }),
      row({ modality: 'voice' }),
      row({ model: 'claude-sonnet-5-5' }),
      row({ pipeline_version: 'v3@zzz' }),
      row(),
    ]).lines;
    expect(lines.map((l) => `${l.day} ${l.modality} ${l.model} ${l.pipelineVersion}`)).toEqual([
      '2026-11-27 text claude-opus-5-5 v3@abc',
      '2026-11-27 text claude-opus-5-5 v3@zzz',
      '2026-11-27 text claude-sonnet-5-5 v3@abc',
      '2026-11-27 voice claude-opus-5-5 v3@abc',
      '2026-11-26 text claude-opus-5-5 v3@abc',
    ]);
  });

  it('adds the lines up', () => {
    const totals = report([
      row(),
      row({ modality: 'voice', turns: 4, failed: 0, emergencies: 2 }),
    ]).totals;
    expect(totals).toMatchObject({
      turns: 14,
      failed: 1,
      interrupted: 4,
      withoutPassages: 2,
      emergencies: 2,
    });
    expect(totals.estimatedCostUsd).toBeCloseTo(2 * 0.0645, 10);
  });

  it('gives no cost for a model it has no price for, and then no total either', () => {
    const made = report([row(), row({ model: 'some-future-model' }), row({ model: null })]);
    expect(made.lines.map((l) => l.estimatedCostUsd === null)).toEqual([false, true, true]);
    // A total that silently left two lines out would read as the whole bill.
    expect(made.totals.estimatedCostUsd).toBeNull();
    expect(made.totals.turns).toBe(30);
  });

  it('reads counts that arrive as text, and waits that were never measured', () => {
    const [line] = report([
      row({
        turns: '12' as unknown as number,
        input_tokens: '9000' as unknown as number,
        first_token_p50_ms: null,
        first_token_p95_ms: null,
        total_p50_ms: null,
        failed: 'not a number' as unknown as number,
      }),
    ]).lines;
    expect(line).toMatchObject({
      turns: 12,
      failed: 0,
      firstWordP50Ms: null,
      firstWordP95Ms: null,
      totalP50Ms: null,
      tokens: { input: 9000 },
    });
  });

  it('shows today against the budget, in dollars', () => {
    const spend = [{ day: '2026-11-27', reserved_micros: 725_000, spent_micros: 1_412_300 }];
    expect(report([], spend, 5).today).toEqual({
      day: '2026-11-27',
      limitUsd: 5,
      spentUsd: 1.4123,
      reservedUsd: 0.725,
    });
  });

  it('shows nothing spent on a day with no row yet, and no limit when none is set', () => {
    expect(report([], [], null).today).toEqual({
      day: '2026-11-27',
      limitUsd: null,
      spentUsd: 0,
      reservedUsd: 0,
    });
    // Yesterday's row is not today's.
    const stale = [{ day: '2026-11-26', reserved_micros: 0, spent_micros: 900_000 }];
    expect(report([], stale).today).toMatchObject({ spentUsd: 0 });
  });

  it('has no budget section when the budget could not be read', () => {
    expect(report([row()], null).today).toBeNull();
  });
});

describe('how many days', () => {
  it('is what was asked for, within limits, and the default otherwise', () => {
    expect(daysWanted('7')).toBe(7);
    expect(daysWanted(['30', '5'])).toBe(30);
    expect(daysWanted(String(USAGE_DAYS.max))).toBe(USAGE_DAYS.max);
    for (const odd of [undefined, '', '0', '-3', '2.5', 'week', String(USAGE_DAYS.max + 1)]) {
      expect(daysWanted(odd), String(odd)).toBe(USAGE_DAYS.default);
    }
  });
});

describe('GET /api/admin-usage', () => {
  const fakeRequest = makeReq as unknown as (options: Record<string, unknown>) => ApiRequest;
  type FakeRes = ApiResponse & { body: unknown; statusCode: number };
  const response = () => makeRes() as unknown as FakeRes;
  const NOW = new Date('2026-11-27T22:15:00Z');

  function setup(overrides: Partial<AdminUsageDeps> = {}) {
    const select = vi.fn(async (table: string, _query: string) =>
      table === 'turn_traces_daily'
        ? [row()]
        : [{ day: '2026-11-27', reserved_micros: 0, spent_micros: 250_000 }]
    );
    const guard = vi.fn(async () => ({ email: 'admin@example.com' }));
    const handler = createAdminUsageHandler({
      guard,
      select,
      dailyLimitUsd: 5,
      now: () => NOW,
      ...overrides,
    });
    return { handler, select, guard };
  }

  it('answers nothing more when the guard has refused the caller', async () => {
    const { handler, select } = setup({ guard: async () => null });
    const res = response();
    await handler(fakeRequest({ method: 'GET' }), res);
    expect(select).not.toHaveBeenCalled();
    expect(res.body).toBeUndefined();
  });

  it('reports the last fourteen days by default, today included, by the UTC day', async () => {
    const { handler, select } = setup();
    const res = response();
    await handler(fakeRequest({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect(select.mock.calls).toEqual([
      ['turn_traces_daily', 'select=*&day=gte.2026-11-14&day=lte.2026-11-27&order=day.desc'],
      ['daily_spend', 'select=day,reserved_micros,spent_micros&day=eq.2026-11-27'],
    ]);
    expect(res.body).toMatchObject({
      from: '2026-11-14',
      to: '2026-11-27',
      totals: { turns: 10 },
      today: { limitUsd: 5, spentUsd: 0.25 },
    });
  });

  it('reports as many days as asked for', async () => {
    const { handler, select } = setup();
    await handler(getWith({ days: '1' }), response());
    expect(select.mock.calls[0]?.[1]).toContain('day=gte.2026-11-27&day=lte.2026-11-27');
  });

  it('uses the real clock when not given one', async () => {
    const { handler, select } = setup({ now: undefined });
    await handler(getWith({ days: '1' }), response());
    const today = new Date().toISOString().slice(0, 10);
    expect(select.mock.calls[0]?.[1]).toContain(`day=lte.${today}`);
  });

  it('says what to run when the traces have never been set up', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { handler } = setup({
      select: async () => {
        throw new Error('relation "public.turn_traces_daily" does not exist');
      },
    });
    const res = response();
    await handler(fakeRequest({ method: 'GET' }), res);
    expect(res.statusCode).toBe(503);
    expect((res.body as { error: string }).error).toContain(
      'scripts/migrations/2026-11-27_turn_traces.sql'
    );
    // The database's own words go to the log, not to the page.
    expect(JSON.stringify(res.body)).not.toContain('relation');
    expect(log).toHaveBeenCalledWith(
      '[admin] could not read the turn traces: relation "public.turn_traces_daily" does not exist'
    );
  });

  it('still reports the traces when only the budget cannot be read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { handler } = setup({
      select: async (table) => {
        if (table === 'daily_spend') throw 'no such table';
        return [row()];
      },
    });
    const res = response();
    await handler(fakeRequest({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ today: null, totals: { turns: 10 } });
    expect(warn).toHaveBeenCalledWith('[admin] could not read the budget: no such table');
  });

  it('logs a trace failure that is not an Error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { handler } = setup({
      select: async () => {
        throw 'timeout';
      },
    });
    await handler(fakeRequest({ method: 'GET' }), response());
    expect(log).toHaveBeenCalledWith('[admin] could not read the turn traces: timeout');
  });
});

describe('the deployed endpoint', () => {
  const fakeRequest = makeReq as unknown as (options: Record<string, unknown>) => ApiRequest;
  type FakeRes = ApiResponse & { body: unknown; statusCode: number };
  const response = () => makeRes() as unknown as FakeRes;
  const ENV = {
    SUPABASE_URL: 'https://db.example',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    ALLOWED_ORIGINS: ORIGIN,
    ADMIN_ALLOWED_EMAILS: 'admin@example.com',
    DAILY_BUDGET_USD: '5',
  };
  const signedInAs = (email: string | null) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        email
          ? new Response(JSON.stringify({ email }), { status: 200 })
          : new Response('{}', { status: 401 })
      )
    );
  const get = () =>
    fakeRequest({ method: 'GET', code: '', headers: { authorization: 'Bearer admin-session' } });

  afterEach(() => vi.unstubAllGlobals());

  it('turns away a signed-in user who is not on the admin list, before reading anything', async () => {
    const selectMany = vi.fn(async () => []);
    const { mod } = await load('../src/entry/admin-usage.ts', { env: ENV, admin: { selectMany } });
    signedInAs('visitor@example.com');
    const res = response();
    await (mod.default as (req: ApiRequest, res: ApiResponse) => Promise<void>)(get(), res);
    expect(res.statusCode).toBe(401);
    expect(selectMany).not.toHaveBeenCalled();
  });

  it('accepts only GET', async () => {
    const { mod } = await load('../src/entry/admin-usage.ts', { env: ENV });
    signedInAs('admin@example.com');
    const res = response();
    await (mod.default as (req: ApiRequest, res: ApiResponse) => Promise<void>)(
      fakeRequest({ method: 'POST', code: '', headers: { authorization: 'Bearer admin-session' } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('reports to an admin, with the budget from the environment', async () => {
    const selectMany = vi.fn(async (table: string) => (table === 'daily_spend' ? [] : [row()]));
    const { mod } = await load('../src/entry/admin-usage.ts', { env: ENV, admin: { selectMany } });
    signedInAs('admin@example.com');
    const res = response();
    await (mod.default as (req: ApiRequest, res: ApiResponse) => Promise<void>)(get(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ totals: { turns: 10 }, today: { limitUsd: 5, spentUsd: 0 } });
    expect(selectMany).toHaveBeenCalledTimes(2);
  });
});
