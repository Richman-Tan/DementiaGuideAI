// EXPO_PUBLIC_SUPABASE_URL/ANON_KEY are inlined by babel-preset-expo at
// transform time from whatever's in the environment when this file is first
// required — not reliably overridable per-test, so assertions below check
// shape (the function-name path, the forwarded token) rather than the exact
// project URL, which is covered by the real .env in actual app builds.
jest.mock('@/lib/supabaseService', () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));

import { supabase } from '@/lib/supabaseService';
import { edgeFunctionTarget } from './edgeFunction';

describe('edgeFunctionTarget', () => {
  afterEach(() => jest.clearAllMocks());

  it('throws a sign-in prompt when there is no session', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    await expect(edgeFunctionTarget('chat-proxy')).rejects.toThrow(/sign in/i);
  });

  it('resolves the function URL and forwards the access token when signed in', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'jwt-123' } },
    });
    const { url, headers } = await edgeFunctionTarget('chat-proxy');
    expect(url).toMatch(/\/functions\/v1\/chat-proxy$/);
    expect(headers.Authorization).toBe('Bearer jwt-123');
    expect('apikey' in headers).toBe(true);
  });
});
