// Auth for this app is a real Supabase Auth session, not a pasted secret —
// signInWithOtp() sends a magic-link email; Supabase's client auto-detects
// the resulting token in the redirect URL (detectSessionInUrl defaults to
// true) and onAuthStateChange picks it up here. shouldCreateUser: false
// means only emails a developer already created in the Supabase dashboard
// can request a link — typing an arbitrary email can't self-register.
// Mirrors apps/web/src/state/AuthContext.jsx's getSession-then-subscribe
// shape, swapping signInAnonymously() for signInWithOtp().
import { useCallback, useEffect, useState } from 'react';
import { supabase, supabaseConfigured } from './supabase.js';

export function useAuth() {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState(supabaseConfigured ? 'loading' : 'unavailable');

  useEffect(() => {
    if (!supabaseConfigured) return undefined;
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setStatus('ready');
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setStatus('ready');
    });

    return () => { cancelled = true; sub?.subscription?.unsubscribe(); };
  }, []);

  const sendMagicLink = useCallback(async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
    });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
  }, []);

  return {
    status, // 'loading' | 'ready' | 'unavailable'
    accessToken: session?.access_token ?? null,
    email: session?.user?.email ?? null,
    sendMagicLink,
    signOut,
  };
}
