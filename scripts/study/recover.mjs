// The export's recovery logic, extracted so it can be tested directly against
// events in the shape the app actually emits.
//
// This exists because it was NOT tested before. The old fixture
// (`_dev-synth.mjs`) fabricated finished CSV rows, so the pipeline was validated
// against data it can never receive — which hid five separate defects at once
// (missing task ids, unemitted post-task answers, undercounted turns, dropped
// Likert answers, and no Arm B latency). Anything that reconstructs a measure
// from raw events belongs in here, with a test.

/** Merge every questionnaire snapshot, oldest first. NOT last-wins: each
 *  snapshot is the whole blob at that moment, so overwriting loses answers a
 *  participant gave after the previous snapshot but before stopping. */
export function mergeResponses(events) {
  const bySession = new Map();
  for (const e of events) {
    if (!e.payload?.responses) continue;
    bySession.set(e.session_id, { ...(bySession.get(e.session_id) || {}), ...e.payload.responses });
  }
  return bySession;
}

/** Turn count for a task window. Counts `turn_start`, which is emitted when the
 *  participant submits — the completing `turn` event fires after playback and
 *  can land after task_end. */
export function turnsInWindow(events, sessionId, fromSeq, toSeq) {
  return events.filter(
    (e) => e.kind === 'turn_start' && e.session_id === sessionId && e.seq > fromSeq && e.seq < toSeq
  ).length;
}

/** Milliseconds the tab was hidden inside a window, pairing each hide with the
 *  next show. Distinguishes a slow participant from one who walked away. */
export function hiddenInWindow(events, sessionId, fromSeq, toSeq) {
  let total = 0;
  const hides = events.filter((e) => e.kind === 'tab_hidden' && e.session_id === sessionId);
  const shows = events.filter((e) => e.kind === 'tab_visible' && e.session_id === sessionId);
  for (const h of hides) {
    if (h.seq <= fromSeq || h.seq >= toSeq) continue;
    const back = shows.find((v) => v.seq > h.seq);
    if (!back || !h.client_ts || !back.client_ts) continue;
    total += Math.max(0, new Date(back.client_ts) - new Date(h.client_ts));
  }
  return total || null;
}

/** Per-task self-report and effort. Prefers the dedicated event; falls back to
 *  the merged snapshot. */
export function postTaskFor(events, merged, sessionId, taskId) {
  const direct = events.find(
    (e) => e.kind === 'posttask_response' && e.session_id === sessionId && e.task_id === taskId
  );
  const r = merged.get(sessionId) || {};
  return {
    found: direct?.payload?.found ?? r[`${taskId}.found`] ?? null,
    effort: direct?.payload?.effort ?? r[`${taskId}.effort`] ?? null,
  };
}

/** SUS + Likert for one arm. Returns a row when EITHER instrument has an
 *  answer: every item is skippable, and gating Likert on SUS discarded one of
 *  the two pre-registered usability criteria — plus all PLWD data. */
export function instrumentRow(merged, sessionId, arm) {
  const r = merged.get(sessionId) || {};
  const items = {};
  for (let i = 1; i <= 10; i++) {
    const v = r[`sus.${arm}.q${i}`];
    if (v !== undefined) items[`q${i}`] = v;
  }
  const likert = {
    trust: r[`likert.${arm}.trust`] ?? null,
    engagement: r[`likert.${arm}.engagement`] ?? null,
    helpfulness: r[`likert.${arm}.helpfulness`] ?? null,
    clarity: r[`likert.${arm}.clarity`] ?? null,
  };
  const hasLikert = Object.values(likert).some((v) => v !== null);
  if (Object.keys(items).length === 0 && !hasLikert) return null;
  return { items, ...likert };
}
