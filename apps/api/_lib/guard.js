// Shared request guard for the study API.
//
// Why this exists: both clients hold their own OpenAI/ElevenLabs keys today
// (docs/architecture/backend-plan.md, issue #48), so nobody can use the app
// without a paid key of their own. The usability study is unmoderated and
// remote, so participants cannot be handed one. These endpoints hold the
// credentials server-side and admit callers by study access code instead.
//
// This is a study-scoped slice of the planned backend, not the backend itself:
// no accounts, no sessions, one shared credential, a fixed list of codes.
import { createHash, timingSafeEqual } from 'node:crypto';
import { rpc, adminConfigured } from './supabaseAdmin.js';

const DAILY_LIMIT = Number(process.env.STUDY_DAILY_REQUEST_LIMIT || 400);

const MIN_CODE_LENGTH = 16;

function validCodes() {
  const codes = (process.env.STUDY_ACCESS_CODES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // These are the only thing between a stranger and a billed API, and nothing
  // rate-limits a guessing run at this layer. A short code is a configuration
  // error, so refuse it rather than serving with it.
  const weak = codes.filter((c) => c.length < MIN_CODE_LENGTH);
  if (weak.length) {
    console.error(`[study] ${weak.length} access code(s) shorter than ${MIN_CODE_LENGTH} characters — refusing to accept them`);
  }
  return codes.filter((c) => c.length >= MIN_CODE_LENGTH);
}

export function readCode(req, { allowBody = false } = {}) {
  const raw = req.headers['x-study-code'];
  const header = (Array.isArray(raw) ? raw[0] : raw || '').trim();
  if (header) return header;
  // navigator.sendBeacon cannot set headers, so the unload flush carries the
  // code in the body instead. Same secret, different envelope.
  if (allowBody && typeof req.body?.accessCode === 'string') return req.body.accessCode.trim();
  return '';
}

// Compare digests so neither the length nor a shared prefix is observable in
// timing. (The previous version claimed to be constant-time while short-circuiting
// on length — worse than not claiming it.)
function isAllowed(code) {
  const codes = validCodes();
  if (!code || codes.length === 0) return false;
  const target = createHash('sha256').update(code).digest();
  let hit = false;
  for (const c of codes) {
    const candidate = createHash('sha256').update(c).digest();
    if (timingSafeEqual(target, candidate)) hit = true;
  }
  return hit;
}

// Per-code daily cap, counted in Postgres because functions are stateless.
// Fails OPEN on a database error: losing a participant's session to a transient
// outage costs more than the handful of requests the cap would have blocked.
// The OpenAI account spend cap is the real backstop.
async function underLimit(code, limit = DAILY_LIMIT) {
  // Fail CLOSED when the backend is not configured. This is not a transient
  // condition that will resolve itself: it means the meter can never run, so
  // "allow anyway" would silently uncap spending for the whole study.
  if (!adminConfigured) {
    console.error('[study] usage meter unavailable — SUPABASE_SERVICE_ROLE_KEY not configured');
    return false;
  }
  try {
    const under = await rpc('bump_study_usage', { p_code: code, p_limit: limit });
    return under !== false;
  } catch (err) {
    // Fail open only here: a transient database error should not cost a
    // participant their session. The hard spend cap on the provider account is
    // the backstop for this window.
    console.warn(`[study] usage check failed (${err?.message ?? err}) — allowing this request`);
    return true;
  }
}

// Returns the access code on success, or null after having sent the response.
export async function guard(req, res, {
  methods = ['POST'], meter = true, allowBodyCode = false,
  meterSuffix = '', meterLimit = null,
} = {}) {
  if (!methods.includes(req.method)) {
    res.setHeader('Allow', methods.join(', '));
    res.status(405).json({ error: 'method not allowed' });
    return null;
  }

  const code = readCode(req, { allowBody: allowBodyCode });
  if (!isAllowed(code)) {
    // Deliberately vague: a caller who guesses a code should not learn whether
    // it was the code or the configuration that was wrong.
    res.status(401).json({ error: 'invalid or missing study access code' });
    return null;
  }

  if (meter && !(await underLimit(code + meterSuffix, meterLimit ?? DAILY_LIMIT))) {
    res.status(429).json({ error: 'study request limit reached for today' });
    return null;
  }

  return code;
}

// Takes the value, not the variable name: a dynamic process.env read hides
// which variable a route actually needs, and lint forbids it.
export function requireEnv(res, value, name = 'a required setting') {
  if (!value) {
    console.error(`[study] ${name} is not configured`);
    res.status(503).json({ error: 'study backend not configured' });
    return null;
  }
  return value;
}

// Read a request body that the platform did not parse (bodyParser disabled).
export function readRaw(req, limitBytes = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        // Pause rather than destroy: destroying tears down the socket, so the
        // 413 the caller is about to send never reaches the client and the
        // participant sees a bare network error instead of a reason.
        req.pause();
        reject(new Error('payload too large'));
        return;
      }
      parts.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}
