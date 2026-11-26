// The Usage page's data and how its numbers are written. Plain functions, so
// they are tested without a browser (tests/usage.test.js); Usage.jsx only lays
// them out.

/** The report from apps/api's GET /api/admin-usage. */
export async function fetchUsage({ apiBaseUrl, accessToken, days }) {
  const resp = await fetch(`${apiBaseUrl || ''}/api/admin-usage?days=${days}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Request failed (${resp.status})`);
  return data;
}

/** Dollars: cents for amounts of a dollar or more, a tenth of a cent below that. */
export function usd(amount) {
  if (amount === null || amount === undefined) return '—';
  return `$${amount.toFixed(amount >= 1 || amount === 0 ? 2 : 3)}`;
}

/** A wait, in seconds to one decimal place. */
export function seconds(ms) {
  if (ms === null || ms === undefined) return '—';
  return `${(ms / 1000).toFixed(1)} s`;
}

/** A share of the turns, as a whole percentage; nothing when there were no turns. */
export function share(part, turns) {
  return turns > 0 ? `${Math.round((part / turns) * 100)}%` : '—';
}

/** "27 Nov" from "2026-11-27", read as the UTC day it is. */
export function shortDay(day) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/**
 * Today against the budget, in a sentence. Null when the budget could not be
 * read at all.
 */
export function budgetLine(today) {
  if (!today) return null;
  const held =
    today.reservedUsd > 0
      ? `, and ${usd(today.reservedUsd)} is set aside for answers in progress`
      : '';
  return today.limitUsd === null
    ? `${usd(today.spentUsd)} spent today${held}. No daily budget is set.`
    : `${usd(today.spentUsd)} of today's ${usd(today.limitUsd)} budget is spent${held}.`;
}
