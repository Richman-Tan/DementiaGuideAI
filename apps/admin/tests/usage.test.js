// The Usage page's request and how its numbers are written (src/lib/usage.js).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { budgetLine, fetchUsage, seconds, share, shortDay, usd } from '../src/lib/usage.js';

afterEach(() => vi.unstubAllGlobals());

describe('fetchUsage', () => {
  it('asks the API for the days wanted, as the signed-in admin', async () => {
    const report = { totals: { turns: 3 }, lines: [], today: null };
    const fetch = vi.fn(async () => new Response(JSON.stringify(report), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    expect(
      await fetchUsage({ apiBaseUrl: 'https://api.example', accessToken: 'token-1', days: 30 })
    ).toEqual(report);
    expect(fetch).toHaveBeenCalledWith('https://api.example/api/admin-usage?days=30', {
      headers: { Authorization: 'Bearer token-1' },
    });
  });

  it('uses the same origin when no API address is configured', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await fetchUsage({ apiBaseUrl: '', accessToken: 't', days: 7 });
    expect(fetch.mock.calls[0][0]).toBe('/api/admin-usage?days=7');
  });

  it('fails with what the API said, so the page can say what to run', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'The turn traces could not be read.' }), {
            status: 503,
          })
      )
    );
    await expect(fetchUsage({ apiBaseUrl: '', accessToken: 't', days: 7 })).rejects.toThrow(
      'The turn traces could not be read.'
    );
  });

  it('fails with the status when the reply is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>bad gateway</html>', { status: 502 }))
    );
    await expect(fetchUsage({ apiBaseUrl: '', accessToken: 't', days: 7 })).rejects.toThrow(
      'Request failed (502)'
    );
  });
});

describe('how the numbers are written', () => {
  it('writes dollars to the cent, and to a tenth of a cent under a dollar', () => {
    expect(usd(12.3456)).toBe('$12.35');
    expect(usd(1)).toBe('$1.00');
    expect(usd(0.0645)).toBe('$0.065');
    expect(usd(0)).toBe('$0.00');
    expect(usd(null)).toBe('—');
    expect(usd(undefined)).toBe('—');
  });

  it('writes a wait in seconds', () => {
    expect(seconds(1500)).toBe('1.5 s');
    expect(seconds(4249)).toBe('4.2 s');
    expect(seconds(0)).toBe('0.0 s');
    expect(seconds(null)).toBe('—');
    expect(seconds(undefined)).toBe('—');
  });

  it('writes a share of the turns, and nothing when there were none', () => {
    expect(share(1, 10)).toBe('10%');
    expect(share(1, 3)).toBe('33%');
    expect(share(0, 10)).toBe('0%');
    expect(share(0, 0)).toBe('—');
  });

  it('writes a day without its year, as the UTC day it is', () => {
    expect(shortDay('2026-11-27')).toBe('27 Nov');
    expect(shortDay('2026-01-01')).toBe('1 Jan');
  });
});

describe('today against the budget', () => {
  it('says how much of the budget is spent', () => {
    expect(budgetLine({ day: '2026-11-27', limitUsd: 5, spentUsd: 1.4123, reservedUsd: 0 })).toBe(
      "$1.41 of today's $5.00 budget is spent."
    );
  });

  it('mentions money set aside for answers still being written', () => {
    expect(
      budgetLine({ day: '2026-11-27', limitUsd: 5, spentUsd: 1.4123, reservedUsd: 0.725 })
    ).toBe(
      "$1.41 of today's $5.00 budget is spent, and $0.725 is set aside for answers in progress."
    );
  });

  it('says so when no budget is set', () => {
    expect(budgetLine({ day: '2026-11-27', limitUsd: null, spentUsd: 0.2, reservedUsd: 0 })).toBe(
      '$0.200 spent today. No daily budget is set.'
    );
  });

  it('is nothing when the budget could not be read', () => {
    expect(budgetLine(null)).toBeNull();
  });
});
