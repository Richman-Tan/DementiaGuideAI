import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdmission, dailyLimit, GLOBAL_KEY } from '../src/admission.ts';

/** A counter like the database one: adds one, then says whether the count is within the limit. */
function counter() {
  const counts = new Map<string, number>();
  const calls: [string, number][] = [];
  const bump = async (key: string, limit: number) => {
    calls.push([key, limit]);
    const next = (counts.get(key) ?? 0) + 1;
    counts.set(key, next);
    return next <= limit;
  };
  return { bump, calls, counts };
}

afterEach(() => vi.restoreAllMocks());

describe('createAdmission', () => {
  it('counts a turn against the visitor, then against everyone, and admits it', async () => {
    const { bump, calls } = counter();
    const admit = createAdmission({ bump, visitorDailyLimit: 20, globalDailyLimit: 200 });
    expect(await admit('user-1')).toEqual({ ok: true });
    expect(calls).toEqual([
      ['turn:user-1', 20],
      [GLOBAL_KEY, 200],
    ]);
  });

  it('refuses a visitor who is over their own limit, without using up the shared one', async () => {
    const { bump, counts } = counter();
    const admit = createAdmission({ bump, visitorDailyLimit: 2, globalDailyLimit: 200 });
    await admit('user-1');
    await admit('user-1');
    expect(await admit('user-1')).toEqual({
      ok: false,
      status: 429,
      code: 'visitor_limit',
      error: "You have reached today's limit for the live demo.",
    });
    expect(counts.get(GLOBAL_KEY)).toBe(2);
    // Another visitor is unaffected.
    expect(await admit('user-2')).toEqual({ ok: true });
  });

  it('refuses everyone once the shared limit for the day is used', async () => {
    const { bump } = counter();
    const admit = createAdmission({ bump, visitorDailyLimit: 20, globalDailyLimit: 2 });
    await admit('user-1');
    await admit('user-2');
    expect(await admit('user-3')).toEqual({
      ok: false,
      status: 429,
      code: 'demo_limit',
      error: "The live demo has reached today's limit.",
    });
  });

  it('admits nobody when a limit is zero', async () => {
    const { bump } = counter();
    const admit = createAdmission({ bump, visitorDailyLimit: 20, globalDailyLimit: 0 });
    expect(await admit('user-1')).toMatchObject({ ok: false, code: 'demo_limit' });
  });

  it.each([
    ['an Error', new Error('PostgREST 503'), 'PostgREST 503'],
    ['something else', 'socket closed', 'socket closed'],
  ])('refuses the turn when the counter cannot be reached (%s)', async (_name, failure, logged) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const admit = createAdmission({
      bump: () => Promise.reject(failure),
      visitorDailyLimit: 20,
      globalDailyLimit: 200,
    });
    expect(await admit('user-1')).toEqual({
      ok: false,
      status: 503,
      code: 'unavailable',
      error: 'The assistant is temporarily unavailable.',
    });
    expect(log).toHaveBeenCalledWith(`[turn] usage counter unavailable: ${logged}`);
  });
});

describe('dailyLimit', () => {
  it.each([
    ['50', 50],
    ['0', 0],
    [' 12 ', 12],
  ])('reads %j as %i', (value, expected) => {
    expect(dailyLimit(value, 20)).toBe(expected);
  });

  it.each([[undefined], [''], ['  '], ['abc'], ['-5'], ['2.5'], ['Infinity']])(
    'falls back to the default for %j',
    (value) => {
      expect(dailyLimit(value, 20)).toBe(20);
    }
  );
});
