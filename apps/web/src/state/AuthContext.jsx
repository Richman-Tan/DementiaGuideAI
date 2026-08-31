// Identity, anonymous by default.
//
// Supabase anonymous sign-in issues a durable auth.uid() with no sign-up, so a
// caregiver who just wants an answer never meets a registration wall. For this
// audience that wall is an accessibility barrier, not a conversion metric —
// people who are tired, stressed and often not confident with apps abandon at
// exactly that point.
//
// Linking an email later preserves the SAME user id, so the conversations
// already attached to it carry over with no migration and no merge conflict.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, supabaseConfigured } from '../services/supabase.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  // 'loading' until we know whether there is a session; screens that need a
  // user id wait rather than rendering against a null uid and writing nothing.
  const [status, setStatus] = useState(supabaseConfigured ? 'loading' : 'unavailable');

  useEffect(() => {
    if (!supabaseConfigured) return undefined;
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setSession(data.session);
        setStatus('ready');
        return;
      }
      // No session yet — create an anonymous one. A failure here is not fatal:
      // the app still works, it just cannot remember anything, so it degrades
      // to device-local history rather than blocking the user.
      const { data: signed, error } = await supabase.auth.signInAnonymously();
      if (cancelled) return;
      if (error) {
        console.warn(`[auth] anonymous sign-in failed (${error.message}) — conversations will not be saved`);
        setStatus('unavailable');
        return;
      }
      setSession(signed.session);
      setStatus('ready');
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) setStatus('ready');
    });

    return () => { cancelled = true; sub?.subscription?.unsubscribe(); };
  }, []);

  /**
   * Turn the anonymous account into a permanent one. The user id is unchanged,
   * so nothing needs moving — this is why anonymous-first costs nothing later.
   */
  const linkEmail = useCallback(async (email, password) => {
    const { error } = await supabase.auth.updateUser({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setStatus('loading');
  }, []);

  const value = useMemo(() => ({
    session,
    status,
    userId: session?.user?.id ?? null,
    // Supabase marks anonymous users in the JWT; the UI uses this to decide
    // whether to offer "save your conversations to another device".
    isAnonymous: session?.user?.is_anonymous ?? true,
    accessToken: session?.access_token ?? null,
    linkEmail,
    signOut,
  }), [session, status, linkEmail, signOut]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
