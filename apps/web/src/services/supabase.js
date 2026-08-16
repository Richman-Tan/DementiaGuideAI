// Guarded Supabase client. The mobile supabaseService.ts throws at import time
// when env is missing — on web that would hard-crash the lazy chat/voice
// chunks. Here a missing env yields a client pointing at an unreachable host:
// retrieval fails fast, openaiClient's zero-chunk degrade answers anyway, and
// mock mode keeps working.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
if (!supabaseConfigured) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL/_ANON_KEY not set — retrieval disabled, answers will cite nothing'
  );
}

export const supabase = createClient(
  SUPABASE_URL || 'https://unconfigured.invalid',
  SUPABASE_ANON_KEY || 'unconfigured'
);
