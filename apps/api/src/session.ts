// Who is calling: the user behind a Supabase session token.
//
// Every visitor has a session, because the web app signs in anonymously on
// first load. The token is verified by asking Supabase's Auth API, which works
// whichever way the project signs its tokens, and the answer is remembered for
// a few minutes so a conversation does not pay that round trip on every turn.
//
// A token is never trusted on its own contents. Its payload is read only to
// learn when it expires, to bound how long a verified answer is remembered.
import { createHash } from 'node:crypto';

export type SessionVerifier = (token: string) => Promise<string | null>;

export interface SessionOptions {
  supabaseUrl: string;
  serviceKey: string;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  /** How long a verified session is remembered. A deleted or banned user stops within this. */
  cacheMs?: number;
  maxEntries?: number;
}

function expiryOf(token: string): number | null {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')
    ) as {
      exp?: unknown;
    };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function createSessionVerifier({
  supabaseUrl,
  serviceKey,
  fetch: fetchFn = globalThis.fetch,
  now = Date.now,
  cacheMs = 5 * 60 * 1000,
  maxEntries = 5000,
}: SessionOptions): SessionVerifier {
  const verified = new Map<string, { userId: string; until: number }>();

  return async function verifySession(token) {
    if (!token) return null;
    const key = createHash('sha256').update(token).digest('hex');
    const hit = verified.get(key);
    if (hit && hit.until > now()) return hit.userId;
    verified.delete(key);

    let userId: string | null = null;
    try {
      const response = await fetchFn(`${supabaseUrl}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${token}`, apikey: serviceKey },
      });
      if (response.ok) {
        const user = (await response.json()) as { id?: unknown };
        if (typeof user.id === 'string' && user.id) userId = user.id;
      }
    } catch (err) {
      console.error(
        `[session] verification request failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    if (!userId) return null;

    // Forget the oldest entry when full; a Map keeps insertion order.
    if (verified.size >= maxEntries) verified.delete(verified.keys().next().value as string);
    const expires = expiryOf(token);
    verified.set(key, { userId, until: Math.min(now() + cacheMs, expires ?? now() + cacheMs) });
    return userId;
  };
}
