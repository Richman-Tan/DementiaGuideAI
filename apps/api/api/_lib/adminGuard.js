// Request guard for the knowledge-base admin intake endpoint.
//
// Deliberately NOT the study's STUDY_ACCESS_CODES/guard() — that pool is
// sized and rate-limited for an unmoderated public study with many
// participants sharing read-mostly proxy access. This endpoint writes
// directly into the production knowledge base, a different trust tier, so it
// gets its own dedicated secret and no daily meter (a handful of trusted
// team members submit resources, not a crowd).
import { createHash, timingSafeEqual } from 'node:crypto';
import { applyCors } from './guard.js';

const MIN_TOKEN_LENGTH = 16;

function validTokens() {
  const tokens = (process.env.ADMIN_INGEST_TOKENS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const weak = tokens.filter((t) => t.length < MIN_TOKEN_LENGTH);
  if (weak.length) {
    console.error(`[admin] ${weak.length} admin token(s) shorter than ${MIN_TOKEN_LENGTH} characters — refusing to accept them`);
  }
  return tokens.filter((t) => t.length >= MIN_TOKEN_LENGTH);
}

// Same digest-compare shape as guard.js's isAllowed: neither the length nor a
// shared prefix should be observable in timing.
function isAllowed(token) {
  const tokens = validTokens();
  if (!token || tokens.length === 0) return false;
  const target = createHash('sha256').update(token).digest();
  let hit = false;
  for (const t of tokens) {
    const candidate = createHash('sha256').update(t).digest();
    if (timingSafeEqual(target, candidate)) hit = true;
  }
  return hit;
}

function readToken(req) {
  const raw = req.headers['x-admin-token'];
  return (Array.isArray(raw) ? raw[0] : raw || '').trim();
}

/** Returns true (and sends the response) if the request should stop here. */
export function adminGuard(req, res, { methods = ['POST'] } = {}) {
  if (applyCors(req, res)) return true;

  if (!methods.includes(req.method)) {
    res.setHeader('Allow', methods.join(', '));
    res.status(405).json({ error: 'method not allowed' });
    return true;
  }

  if (!isAllowed(readToken(req))) {
    // Deliberately vague: a caller who guesses a token should not learn
    // whether it was the token or the configuration that was wrong.
    res.status(401).json({ error: 'invalid or missing admin token' });
    return true;
  }

  return false;
}
