import React from 'react';
import { Text, Button } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { AuthProvider, useAuth } from './AuthContext';

jest.mock('@/lib/supabaseService', () => {
  const listeners = [];
  return {
    supabase: {
      auth: {
        getSession: jest.fn(() => Promise.resolve({ data: { session: null } })),
        onAuthStateChange: jest.fn((cb) => {
          listeners.push(cb);
          return { data: { subscription: { unsubscribe: jest.fn() } } };
        }),
        signInWithPassword: jest.fn(() => Promise.resolve({ error: null })),
        signUp: jest.fn(() => Promise.resolve({ error: null })),
        signOut: jest.fn(() => Promise.resolve()),
      },
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(() =>
          Promise.resolve({ data: { id: 'user-1', email: 'a@b.com' }, error: null })
        ),
      })),
    },
    __emitAuthChange: (session) => listeners.forEach((l) => l('SIGNED_IN', session)),
  };
});

function Consumer() {
  const { session, user, isHydrated, signIn, signOut } = useAuth();
  return (
    <>
      <Text testID="hydrated">{isHydrated ? 'hydrated' : 'loading'}</Text>
      <Text testID="session">{session ? 'in' : 'out'}</Text>
      <Text testID="email">{user?.email ?? 'none'}</Text>
      <Button title="signin" onPress={() => signIn('a@b.com', 'password123')} />
      <Button title="signout" onPress={() => signOut()} />
    </>
  );
}

describe('AuthContext', () => {
  afterEach(() => jest.clearAllMocks());

  it('hydrates to signed-out when there is no persisted session', async () => {
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('hydrated'));
    expect(screen.getByTestId('session')).toHaveTextContent('out');
  });

  it('reflects a session pushed via onAuthStateChange (e.g. after sign-in)', async () => {
    const { __emitAuthChange } = require('@/lib/supabaseService');
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('hydrated'));

    act(() => {
      __emitAuthChange({ user: { id: 'user-1', email: 'a@b.com' } });
    });

    await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('in'));
    expect(screen.getByTestId('email')).toHaveTextContent('a@b.com');
  });

  it('signIn delegates to supabase.auth.signInWithPassword', async () => {
    const { supabase } = require('@/lib/supabaseService');
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('hydrated'));

    fireEvent.press(screen.getByText('signin'));

    await waitFor(() =>
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'a@b.com',
        password: 'password123',
      })
    );
  });

  it('signOut delegates to supabase.auth.signOut', async () => {
    const { supabase } = require('@/lib/supabaseService');
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('hydrated'));

    fireEvent.press(screen.getByText('signout'));

    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalled());
  });
});
