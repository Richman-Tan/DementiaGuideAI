import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdmission, dailyLimit, globalKey } from '../src/admission.ts';

const GLOBAL_KEY = globalKey('turn');

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

describe('createAdmission: scopes', () => {
  it('counts speech under its own names, so it does not use up the turns', async () => {
    const { bump, calls, counts } = counter();
    const turns = createAdmission({ bump, visitorDailyLimit: 1, globalDailyLimit: 10 });
    const speech = createAdmission({
      bump,
      scope: 'speak',
      visitorDailyLimit: 2,
      globalDailyLimit: 10,
    });
    expect(await turns('user-1')).toEqual({ ok: true });
    expect(await speech('user-1')).toEqual({ ok: true });
    expect(await speech('user-1')).toEqual({ ok: true });
    expect(await speech('user-1')).toMatchObject({ ok: false, code: 'visitor_limit' });
    expect(calls.slice(2, 4)).toEqual([
      ['speak:user-1', 2],
      ['speak:all', 10],
    ]);
    expect(counts.get('turn:all')).toBe(1);
    expect(counts.get(globalKey('speak'))).toBe(2);
  });

  it('names the scope when the counter cannot be reached', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const speech = createAdmission({
      bump: () => Promise.reject(new Error('down')),
      scope: 'speak',
      visitorDailyLimit: 1,
      globalDailyLimit: 1,
    });
    expect(await speech('user-1')).toMatchObject({ ok: false, status: 503 });
    expect(log).toHaveBeenCalledWith('[speak] usage counter unavailable: down');
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
