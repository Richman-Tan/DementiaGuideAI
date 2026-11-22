// Usage metering: one row per proxied call, fire-and-forget, never throws.
// A metering failure must not cost a participant their answer, and a schema
// mismatch on the newer `model` column must not lose the reading.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { load } from './helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function postgrestError(status) {
  const e = new Error(`PostgREST ${status}`);
  e.status = status;
  return e;
}

/**
 * Load usage.js with an insert stub that records a COPY of each batch: the
 * module deletes `model` from the same row object on retry, so the mock's own
 * call log would show the second shape for both calls.
 */
async function loadUsage({ adminConfigured = true, insert = async (t, rows) => rows.length } = {}) {
  const seen = [];
  const insertIgnoringConflicts = vi.fn(async (table, rows, onConflict) => {
    seen.push({ table, rows: structuredClone(rows), onConflict });
    return insert(table, rows, onConflict);
  });
  const { mod } = await load('../api/_lib/usage.js', {
    admin: { adminConfigured, insertIgnoringConflicts },
  });
  return { recordUsage: mod.recordUsage, insertIgnoringConflicts, seen };
}

describe('recordUsage', () => {
  it('writes one usage row labelled with the user, kind, units and model', async () => {
    const { recordUsage, seen } = await loadUsage();
    recordUsage({ userId: 'user-1', kind: 'chat', units: 2600, model: 'gpt-4o' });
    expect(seen).toEqual([
      {
        table: 'usage_events',
        rows: [{ user_id: 'user-1', kind: 'chat', units: 2600, model: 'gpt-4o' }],
        onConflict: 'id',
      },
    ]);
  });

  it('omits the model when none is given, and caps a long one at 60 characters', async () => {
    const { recordUsage, seen } = await loadUsage();
    recordUsage({ userId: 'u', kind: 'whisper', units: 10 });
    recordUsage({ userId: 'u', kind: 'chat', units: 1, model: 'm'.repeat(80) });
    expect(seen[0].rows[0]).toEqual({ user_id: 'u', kind: 'whisper', units: 10 });
    expect(seen[1].rows[0].model).toHaveLength(60);
  });

  it('records zero units (an empty answer is still a call)', async () => {
    const { recordUsage, seen } = await loadUsage();
    recordUsage({ userId: 'u', kind: 'chat', units: 0, model: 'gpt-4o' });
    expect(seen[0].rows[0].units).toBe(0);
  });

  it('records nothing without a configured backend or a user to attribute it to', async () => {
    const off = await loadUsage({ adminConfigured: false });
    off.recordUsage({ userId: 'u', kind: 'chat', units: 1 });
    expect(off.insertIgnoringConflicts).not.toHaveBeenCalled();

    const anon = await loadUsage();
    anon.recordUsage({ userId: null, kind: 'chat', units: 1 });
    expect(anon.insertIgnoringConflicts).not.toHaveBeenCalled();
  });

  it('records nothing for a reading that is not a finite, non-negative number', async () => {
    const { recordUsage, insertIgnoringConflicts } = await loadUsage();
    for (const units of [NaN, Infinity, -1, '7', undefined, null]) {
      recordUsage({ userId: 'u', kind: 'embedding', units });
    }
    expect(insertIgnoringConflicts).not.toHaveBeenCalled();
  });

  it('retries without `model` on a 400 (live table predates the column) and keeps the reading', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let calls = 0;
    const { recordUsage, seen } = await loadUsage({
      insert: async () => {
        calls += 1;
        if (calls === 1) throw postgrestError(400);
        return 1;
      },
    });
    recordUsage({ userId: 'u', kind: 'tts', units: 42, model: 'tts-1' });
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(seen.map((s) => s.rows[0])).toEqual([
      { user_id: 'u', kind: 'tts', units: 42, model: 'tts-1' },
      { user_id: 'u', kind: 'tts', units: 42 },
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/recorded without `model`/);
  });

  it('warns, and does not throw, when the retry fails as well', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { recordUsage, seen } = await loadUsage({
      insert: async () => {
        throw postgrestError(400);
      },
    });
    expect(() =>
      recordUsage({ userId: 'u', kind: 'tts', units: 42, model: 'tts-1' })
    ).not.toThrow();
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(seen).toHaveLength(2);
    expect(warn.mock.calls.map((c) => c[0])).toEqual([
      '[usage] could not record tts: PostgREST 400',
    ]);
  });

  it('does not retry other failures, or a 400 on a row with no model to drop', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = await loadUsage({
      insert: async () => {
        throw postgrestError(503);
      },
    });
    a.recordUsage({ userId: 'u', kind: 'chat', units: 1, model: 'gpt-4o' });
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(a.seen).toHaveLength(1);
    expect(warn.mock.calls[0][0]).toBe('[usage] could not record chat: PostgREST 503');

    const b = await loadUsage({
      insert: async () => {
        throw postgrestError(400);
      },
    });
    b.recordUsage({ userId: 'u', kind: 'whisper', units: 1 });
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(2));
    expect(b.seen).toHaveLength(1);
  });

  it('describes a non-Error rejection too', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { recordUsage } = await loadUsage({
      insert: async () => {
        throw 'socket hang up';
      },
    });
    recordUsage({ userId: 'u', kind: 'chat', units: 1 });
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(warn.mock.calls[0][0]).toBe('[usage] could not record chat: socket hang up');
  });
});
