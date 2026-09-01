// Closing a study session is two independent steps: flush the outbound event
// queue, then mark the session row complete.
//
// They used to share one try/catch, so a flush that threw on a bad connection
// skipped the complete call entirely — the session row kept completed_at NULL
// while the participant's events arrived on the next attempt anyway, and the
// export reads that combination as a drop-out. They are separated here, and the
// complete call (an idempotent UPDATE) is retried once.
//
// Extracted from StudyContext so the ordering guarantee can be tested without a
// DOM: see apps/web/tests/studyClose.test.js.

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function closeSession({
  flush,
  complete,
  retryDelayMs = 2000,
  delay = wait,
  warn = console.warn,
}) {
  try {
    await flush();
  } catch (err) {
    warn(`[study] final flush failed: ${err?.message ?? err}`);
  }

  if (!complete) return;

  try {
    await complete();
  } catch {
    await delay(retryDelayMs);
    try {
      await complete();
    } catch (err) {
      warn(`[study] could not close session: ${err?.message ?? err}`);
    }
  }
}
