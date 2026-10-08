import { timeoutSignal, isAbortError } from './withTimeout';

describe('timeoutSignal', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('aborts the signal once the time is up, and not before', () => {
    const t = timeoutSignal(5000);
    jest.advanceTimersByTime(4999);
    expect(t.signal.aborted).toBe(false);
    jest.advanceTimersByTime(1);
    expect(t.signal.aborted).toBe(true);
  });

  it('cancel() clears the timer so a settled request is never aborted later', () => {
    const t = timeoutSignal(100);
    t.cancel();
    jest.advanceTimersByTime(1000);
    expect(t.signal.aborted).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('abort() aborts at once and clears the pending timer', () => {
    const t = timeoutSignal(100);
    t.abort();
    expect(t.signal.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('isAbortError', () => {
  it('recognises an AbortError by name', () => {
    const err = new Error('The operation was aborted.');
    err.name = 'AbortError';
    expect(isAbortError(err)).toBe(true);
  });

  it('recognises an abort from its message when the error has no AbortError name', () => {
    expect(isAbortError(new Error('Aborted'))).toBe(true);
    expect(isAbortError({ message: 'request was ABORTED by the user' })).toBe(true);
  });

  it('is false for other errors and for nothing at all', () => {
    expect(isAbortError(new Error('Network request failed'))).toBe(false);
    expect(isAbortError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
    expect(isAbortError({})).toBe(false);
  });

  it('is true for the error a real aborted signal carries', () => {
    const t = timeoutSignal(1000);
    t.abort();
    expect(isAbortError(t.signal.reason)).toBe(true);
  });
});
