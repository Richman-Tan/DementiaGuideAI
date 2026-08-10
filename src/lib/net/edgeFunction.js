import { supabase } from '@/lib/supabaseService';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Resolves the URL + auth headers for a Supabase Edge Function call — the
// centralized-key path every provider service falls back to when the caller
// has no personal API key saved (see openaiService.js, elevenLabsService.js).
// Functions have verify_jwt=true (supabase/config.toml), so the access
// token is what actually authorizes the call; apikey is required by
// Supabase's gateway in front of the function.
export async function edgeFunctionTarget(name) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sign in to use the built-in AI service, or add your own API key in Settings');
  return {
    url: `${SUPABASE_URL}/functions/v1/${name}`,
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
  };
}
