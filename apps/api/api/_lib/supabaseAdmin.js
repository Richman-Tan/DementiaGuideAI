// Service-role access to the study tables, over PostgREST directly.
//
// NOT supabase-js. It pulls in realtime-js, which throws on Node 20 for want of
// a native WebSocket — the same reason scripts/eval/lib.mjs talks to PostgREST
// over fetch. Using it here would make these routes depend on the platform's
// Node version, and would break `vite dev` outright. Direct fetch also keeps
// the serverless bundle small, which shortens cold starts.
//
// The anonymous key the web client ships cannot reach these tables at all: RLS
// is enabled with no policies and privileges are revoked
// (docs/study/ethics/data-management-plan.md §4, and the migration).

const URL_BASE = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const adminConfigured = Boolean(URL_BASE && SERVICE_KEY);

const headers = (extra = {}) => ({
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  ...extra,
});

async function request(path, init) {
  const resp = await fetch(`${URL_BASE}/rest/v1/${path}`, init);
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    // Detail goes to the log, not into the Error message: callers render error
    // messages, and an upstream body could carry row contents.
    console.error(`[study] PostgREST ${resp.status} on ${path}: ${detail.slice(0, 300)}`);
    const err = new Error(`PostgREST ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  if (resp.status === 204) return { rows: null, contentRange: resp.headers.get('content-range') };
  const text = await resp.text();
  return {
    rows: text ? JSON.parse(text) : null,
    contentRange: resp.headers.get('content-range'),
  };
}

/** Call a Postgres function. */
export async function rpc(fn, args) {
  const { rows } = await request(`rpc/${fn}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(args),
  });
  return rows;
}

/** First matching row, or null. `query` is a PostgREST query string. */
export async function selectOne(table, columns, query) {
  const { rows } = await request(`${table}?select=${encodeURIComponent(columns)}&${query}&limit=1`, {
    method: 'GET',
    headers: headers(),
  });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/** Insert one row and return the requested columns. */
export async function insertReturning(table, row, columns) {
  const { rows } = await request(`${table}?select=${encodeURIComponent(columns)}`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify([row]),
  });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/**
 * Insert many rows, skipping any that collide on `onConflict`.
 *
 * The event stream is retried and beacon-flushed, so the same (session, seq)
 * can arrive twice; ignore-duplicates makes the retry a no-op instead of a
 * second row.
 */
export async function insertIgnoringConflicts(table, rows, onConflict) {
  if (!rows.length) return 0;
  // `count=exact` so the caller can tell a clean insert from a batch that was
  // entirely swallowed as duplicates — the difference between working and
  // silently losing every event.
  const { contentRange } = await request(`${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=ignore-duplicates,return=minimal,count=exact' }),
    body: JSON.stringify(rows),
  });
  const n = Number(String(contentRange || '').split('/')[1]);
  return Number.isFinite(n) ? n : rows.length;
}

/** Patch rows matching a PostgREST query string. */
export async function updateWhere(table, patch, query) {
  return request(`${table}?${query}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(patch),
  });
}
