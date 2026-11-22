// Same pattern as apps/web/src/services/supabase.js: a guarded client rather
// than throwing at import time when env is missing, so a misconfigured
// deploy degrades to "sign-in unavailable" instead of a blank crashed page.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
if (!supabaseConfigured) {
  console.warn('[supabase] VITE_SUPABASE_URL/_ANON_KEY not set — sign-in is disabled');
}

export const supabase = createClient(
  SUPABASE_URL || 'https://unconfigured.invalid',
  SUPABASE_ANON_KEY || 'unconfigured'
);
