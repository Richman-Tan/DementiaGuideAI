// The spending cap on the endpoints that cost money: a turn of the assistant,
// and a piece of its reply turned into speech.
//
// Every visitor is anonymous, so each request is counted against two daily
// limits before any provider is called: one for that visitor, one for
// everybody together. The second is the cap on what a day can cost. The
// counters are rows in Postgres, bumped atomically, because functions keep no
// state between calls. Each endpoint counts under its own name (its `scope`),
// so speech does not use up the turns.
//
// It counts requests, not dollars: a day costs at most the global limit times
// the most one request can cost. The provider account's own hard limit sits
// behind it.
//
// If the counter cannot be reached the turn is refused. A cap that lets
// requests through when it cannot count is not a cap.

export type Admission =
  | { ok: true }
  | {
      ok: false;
      status: number;
      /** For the app: `demo_limit` is when it switches to recorded answers. */
      code: 'visitor_limit' | 'demo_limit' | 'unavailable';
      error: string;
    };

export interface AdmissionOptions {
  /** Adds one to today's count for `key`, and says whether that is still within `limit`. */
  bump(key: string, limit: number): Promise<boolean>;
  /** What is being counted; the counters are named after it. */
  scope?: 'turn' | 'speak';
  visitorDailyLimit: number;
  globalDailyLimit: number;
}

/** The name of the counter everybody shares, for a scope. */
export const globalKey = (scope: string) => `${scope}:all`;

/** A limit from the environment: a whole number, zero or more. Anything else falls back. */
export function dailyLimit(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

export function createAdmission({
  bump,
  scope = 'turn',
  visitorDailyLimit,
  globalDailyLimit,
}: AdmissionOptions) {
  return async function admit(userId: string): Promise<Admission> {
    try {
      // The visitor first, so someone over their own limit does not use up the shared one.
      if (!(await bump(`${scope}:${userId}`, visitorDailyLimit))) {
        return {
          ok: false,
          status: 429,
          code: 'visitor_limit',
          error: "You have reached today's limit for the live demo.",
        };
      }
      if (!(await bump(globalKey(scope), globalDailyLimit))) {
        return {
          ok: false,
          status: 429,
          code: 'demo_limit',
          error: "The live demo has reached today's limit.",
        };
      }
      return { ok: true };
    } catch (err) {
      console.error(
        `[${scope}] usage counter unavailable: ${err instanceof Error ? err.message : String(err)}`
      );
      return {
        ok: false,
        status: 503,
        code: 'unavailable',
        error: 'The assistant is temporarily unavailable.',
      };
    }
  };
}
