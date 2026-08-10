// Shared CORS headers. The app calls these functions from Expo's dev server
// (web) and from native builds (no Origin header, so CORS is moot there) —
// wide open on Origin is fine since every route requires a valid user JWT.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
