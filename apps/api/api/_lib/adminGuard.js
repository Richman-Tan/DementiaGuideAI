// Request guard for the knowledge-base admin intake endpoint.
//
// Auth is a real Supabase Auth session, not a shared secret: apps/admin's
// login screen calls supabase.auth.signInWithOtp() (a magic-link email) and
// sends the resulting access token as a normal Authorization: Bearer
// header. This guard verifies that token against Supabase's own Auth API
// (GET /auth/v1/user) rather than implementing JWT verification here, then
// checks the token's email against an explicit allowlist — being an
// authenticated Supabase user is not by itself enough to write into the
// knowledge base. Same "explicit allowlist, not an open door" shape as
// guard.js's STUDY_ACCESS_CODES, just keyed on a verified email instead of
// a shared secret.
import { applyCors } from './guard.js';
import { adminConfigured } from './supabaseAdmin.js';

function allowedEmails() {
  return (process.env.ADMIN_ALLOWED_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function verifiedUser(req) {
  const raw = req.headers.authorization || '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7) : '';
  if (!token) return null;
  try {
    const resp = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_SERVICE_ROLE_KEY },
    });
    if (!resp.ok) return null;
    return resp.json();
  } catch (err) {
    console.error(`[admin] auth verification request failed: ${err?.message ?? err}`);
    return null;
  }
}

/** Returns the verified user on success, or null after sending the response. */
export async function adminGuard(req, res, { methods = ['POST'] } = {}) {
  if (applyCors(req, res)) return null;

  if (!methods.includes(req.method)) {
    res.setHeader('Allow', methods.join(', '));
    res.status(405).json({ error: 'method not allowed' });
    return null;
  }

  if (!adminConfigured) {
    console.error('[admin] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured');
    res.status(503).json({ error: 'admin intake backend not configured' });
    return null;
  }

  const user = await verifiedUser(req);
  const email = user?.email?.toLowerCase();
  if (!email || !allowedEmails().includes(email)) {
    // Deliberately vague: a caller with a valid Supabase login that isn't
    // allowlisted should not learn that their login worked but their email
    // wasn't on the list.
    res.status(401).json({ error: 'not authorised for the admin intake tool' });
    return null;
  }

  return user;
}
