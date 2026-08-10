// Resolves the calling user from the request's Authorization header.
//
// `verify_jwt = true` in ../../config.toml already makes the platform reject
// requests with a missing/malformed/expired JWT before this code runs — this
// helper's job is just to hand back *which* user it was, using an
// anon-key client scoped to their token (the documented way to re-derive the
// user from a forwarded JWT; see Supabase Edge Functions auth guide).
import { createClient } from 'jsr:@supabase/supabase-js@2';

export async function getUser(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { user: null, error: 'Missing Authorization header' };

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { user: null, error: error?.message ?? 'Invalid session' };
  return { user: data.user, error: null };
}

// Service-role client for writes RLS wouldn't otherwise allow (usage_events
// inserts). Never expose SUPABASE_SERVICE_ROLE_KEY to the app bundle — this
// only runs server-side, inside the Edge Function.
export function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}
