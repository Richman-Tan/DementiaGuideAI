// Closing a session must survive a failed flush.
//
// The two steps used to share a try/catch, so a participant on bad wifi could
// finish the whole study and still be recorded as a drop-out: the flush threw,
// the complete call never ran, completed_at stayed NULL, and the queued events
// arrived on the next page load anyway. These tests pin the ordering.
import { describe, it, expect, vi } from 'vitest';
import { closeSession } from '../src/study/closeSession.js';

const noDelay = () => Promise.resolve();

describe('closeSession', () => {
  it('completes the session after a successful flush', async () => {
    const order = [];
    const flush = vi.fn(async () => { order.push('flush'); });
    const complete = vi.fn(async () => { order.push('complete'); });

    await closeSession({ flush, complete, delay: noDelay, warn: () => {} });

    expect(order).toEqual(['flush', 'complete']);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('still completes the session when the flush throws', async () => {
    const flush = vi.fn(async () => { throw new Error('offline'); });
    const complete = vi.fn(async () => {});
    const warn = vi.fn();

    await closeSession({ flush, complete, delay: noDelay, warn });

    expect(complete).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('final flush failed'));
  });

  it('retries the complete call once before giving up', async () => {
    const complete = vi.fn()
      .mockRejectedValueOnce(new Error('HTTP 502'))
      .mockResolvedValueOnce({});

    await closeSession({ flush: async () => {}, complete, delay: noDelay, warn: () => {} });

    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('gives up quietly after the retry also fails', async () => {
    const complete = vi.fn(async () => { throw new Error('HTTP 502'); });
    const warn = vi.fn();

    await expect(
      closeSession({ flush: async () => {}, complete, delay: noDelay, warn })
    ).resolves.toBeUndefined();

    expect(complete).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not close session'));
  });

  it('flushes even when there is no session row to close', async () => {
    const flush = vi.fn(async () => {});

    await closeSession({ flush, complete: null, delay: noDelay, warn: () => {} });

    expect(flush).toHaveBeenCalledTimes(1);
  });
});
