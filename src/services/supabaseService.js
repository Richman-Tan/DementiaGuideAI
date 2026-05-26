import { createClient } from '@supabase/supabase-js';

// ─── Supabase Configuration ──────────────────────────────────────────────────
// Credentials are read from the .env file at the project root.
// .env is git-ignored — never commit it.
// See .env for the variable names; Expo exposes EXPO_PUBLIC_* vars at build time.

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
