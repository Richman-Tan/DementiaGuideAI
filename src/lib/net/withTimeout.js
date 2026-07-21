// Shared AbortController timeout helper for hot-path network calls.
// Every stage of the voice pipeline must be able to fail fast: a stalled
// request with no timeout hangs the whole turn (there is no user-visible
// spinner-escape on the voice screen).

/**
 * Returns an AbortSignal that fires after `ms`, plus a cancel() to clear the
 * timer once the request settles (avoids stray timers keeping the JS thread
 * alive and aborting a controller that's already done).
 *
 *   const t = timeoutSignal(5000);
 *   try { await fetch(url, { signal: t.signal }); } finally { t.cancel(); }
 */
export function timeoutSignal(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
    abort: () => { clearTimeout(timer); controller.abort(); },
  };
}

/** True when an error came from an aborted fetch/rpc (timeout or manual). */
export function isAbortError(err) {
  return err?.name === 'AbortError' || /abort/i.test(err?.message ?? '');
}
