// Auth for this app is a real Supabase Auth session, not a pasted secret —
// signInWithPassword() against an account a developer already created in the
// Supabase dashboard (sign-ups are not exposed anywhere in this app, so
// there's no self-registration path to worry about). Switched from the
// original magic-link (signInWithOtp) design: that depends on Supabase's
// default email service actually delivering in a reasonable time, which has
// a low rate limit and nothing to fall back on when it's hit — a bad
// dependency for a tool meant to be quick for a non-technical client to use.
// Mirrors apps/web/src/state/AuthContext.jsx's getSession-then-subscribe
// shape, swapping signInAnonymously() for signInWithPassword().
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

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
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
    signIn,
    signOut,
  };
}
