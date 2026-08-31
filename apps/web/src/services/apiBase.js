// Where the backend lives.
//
// apps/api deploys as its own Vercel project, so in production it is a
// different origin from the app and every call needs an absolute URL. In
// development the Vite middleware serves /api/* from apps/api directly, so the
// base is empty and the paths stay relative — the call sites are identical
// either way, which is what keeps dev from diverging from what participants get.
//
// Set VITE_API_BASE_URL to the API deployment's origin (no trailing slash), and
// add that same origin to `connect-src` in apps/web/vercel.json — the CSP will
// block it otherwise, and it will look like the backend is down.
const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

/** Absolute URL for a backend route, e.g. apiUrl('/api/chat'). */
export function apiUrl(path) {
  return `${BASE}${path}`;
}

/** True when the API is on another origin, so callers can reason about CORS. */
export const apiIsCrossOrigin = BASE !== '';
