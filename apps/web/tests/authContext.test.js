// @vitest-environment jsdom
// Anonymous-first identity (state/AuthContext.jsx): reuse a stored session,
// otherwise sign in anonymously; degrade to "unavailable" (device-only
// history) when that fails or Supabase is not configured; follow auth state
// changes; link an email without changing the user id; sign out.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, flush, cleanup } from './helpers/render.js';

const fake = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(),
    signInAnonymously: vi.fn(),
    onAuthStateChange: vi.fn(),
    updateUser: vi.fn(),
    signOut: vi.fn(),
  },
}));
vi.mock('../src/services/supabase.js', () => ({
  supabase: { auth: fake.auth },
  supabaseConfigured: true,
}));

const { AuthProvider, useAuth } = await import('../src/state/AuthContext.jsx');

const ANON = { access_token: 'tok-anon', user: { id: 'user-1', is_anonymous: true } };
const LINKED = { access_token: 'tok-2', user: { id: 'user-1', is_anonymous: false } };

let authListener;
let unsubscribe;
beforeEach(() => {
  for (const fn of Object.values(fake.auth)) fn.mockReset();
  unsubscribe = vi.fn();
  fake.auth.onAuthStateChange.mockImplementation((cb) => {
    authListener = cb;
    return { data: { subscription: { unsubscribe } } };
  });
  fake.auth.getSession.mockResolvedValue({ data: { session: null } });
  fake.auth.signInAnonymously.mockResolvedValue({ data: { session: ANON }, error: null });
  fake.auth.updateUser.mockResolvedValue({ error: null });
  fake.auth.signOut.mockResolvedValue({});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
});

const mount = () => renderHook(() => useAuth(), { wrapper: AuthProvider });

describe('session bootstrap', () => {
  it('reuses an existing session without signing in again', async () => {
    fake.auth.getSession.mockResolvedValue({ data: { session: LINKED } });
    const { result } = await mount();
    expect(result.current).toMatchObject({
      status: 'ready',
      userId: 'user-1',
      isAnonymous: false,
      accessToken: 'tok-2',
      session: LINKED,
    });
    expect(fake.auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it('creates an anonymous session when there is none', async () => {
    const { result } = await mount();
    expect(fake.auth.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({
      status: 'ready',
      userId: 'user-1',
      isAnonymous: true,
      accessToken: 'tok-anon',
    });
  });

  it('a failed anonymous sign-in degrades to "unavailable" instead of blocking the app', async () => {
    fake.auth.signInAnonymously.mockResolvedValue({
      data: null,
      error: { message: 'anonymous sign-ins are disabled' },
    });
    const { result } = await mount();
    expect(result.current).toMatchObject({
      status: 'unavailable',
      session: null,
      userId: null,
      isAnonymous: true,
      accessToken: null,
    });
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/anonymous sign-in failed \(anonymous sign-ins are disabled\)/)
    );
  });

  it('nothing resolves into an unmounted provider', async () => {
    let resolveSession;
    fake.auth.getSession.mockReturnValue(
      new Promise((r) => {
        resolveSession = r;
      })
    );
    const { unmount } = await mount();
    await unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    await flush(() => resolveSession({ data: { session: null } }));
    expect(fake.auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it('a sign-in that lands after unmount is dropped, error and all', async () => {
    let resolveSignIn;
    fake.auth.signInAnonymously.mockReturnValue(
      new Promise((r) => {
        resolveSignIn = r;
      })
    );
    const { unmount } = await mount();
    await unmount();
    await flush(() => resolveSignIn({ data: null, error: { message: 'late' } }));
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe('auth state changes', () => {
  it('a new session from another tab or a refresh is adopted; a sign-out clears it', async () => {
    const { result } = await mount();
    await flush(() => authListener('TOKEN_REFRESHED', LINKED));
    expect(result.current).toMatchObject({
      status: 'ready',
      isAnonymous: false,
      accessToken: 'tok-2',
    });
    await flush(() => authListener('SIGNED_OUT', null));
    expect(result.current.session).toBeNull();
    expect(result.current.userId).toBeNull();
  });
});

describe('linkEmail / signOut', () => {
  it('linking an email upgrades the same user', async () => {
    const { result } = await mount();
    await flush(() => result.current.linkEmail('carer@example.org', 'pw-123456'));
    expect(fake.auth.updateUser).toHaveBeenCalledWith({
      email: 'carer@example.org',
      password: 'pw-123456',
    });
  });

  it('a link failure surfaces the provider message', async () => {
    fake.auth.updateUser.mockResolvedValue({ error: { message: 'Email already registered' } });
    const { result } = await mount();
    await expect(result.current.linkEmail('a@b.c', 'x')).rejects.toThrow(
      'Email already registered'
    );
  });

  it('signing out drops the session and waits for a new one', async () => {
    const { result } = await mount();
    await flush(() => result.current.signOut());
    expect(fake.auth.signOut).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ session: null, status: 'loading', userId: null });
  });
});

describe('without Supabase configured', () => {
  it('reports "unavailable" and never calls the auth API', async () => {
    vi.resetModules();
    vi.doMock('../src/services/supabase.js', () => ({
      supabase: { auth: fake.auth },
      supabaseConfigured: false,
    }));
    try {
      const mod = await import('../src/state/AuthContext.jsx');
      const { result } = await renderHook(() => mod.useAuth(), { wrapper: mod.AuthProvider });
      expect(result.current).toMatchObject({ status: 'unavailable', session: null, userId: null });
      expect(fake.auth.getSession).not.toHaveBeenCalled();
      expect(fake.auth.onAuthStateChange).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock('../src/services/supabase.js');
    }
  });
});
