// Focused on the BYOK-vs-centralized-proxy branch added to each network
// call: a personal key saved in SecureStore -> call OpenAI directly (as the
// app always has); no personal key -> call the matching Supabase Edge
// Function instead (supabase/functions/embed-proxy, chat-proxy).

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Pulled in transitively via ragTelemetry.js; not under test here.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('./supabaseService', () => ({
  supabase: { rpc: jest.fn() },
}));

jest.mock('./net/edgeFunction', () => ({
  edgeFunctionTarget: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabaseService';
import { edgeFunctionTarget } from './net/edgeFunction';
import { openaiService } from './openaiService';

const noChunksRpc = () => ({ abortSignal: () => Promise.resolve({ data: [], error: null }) });

describe('openaiService BYOK-vs-proxy branching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    openaiService._cachedKey = null;
    openaiService._embedCache.clear();
    openaiService._lastRequestAt = 0;
    global.fetch = jest.fn();
  });

  describe('embeddings (search -> _embedQuery)', () => {
    it('calls OpenAI directly when a personal key is saved', async () => {
      SecureStore.getItemAsync.mockResolvedValue('sk-personal-key-123456789');
      global.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: [{ embedding: [0.1] }] }) });
      supabase.rpc.mockReturnValue(noChunksRpc());

      await openaiService.search('hello');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('api.openai.com/v1/embeddings'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer sk-personal-key-123456789' }),
        })
      );
      expect(edgeFunctionTarget).not.toHaveBeenCalled();
    });

    it('calls embed-proxy when no personal key is saved', async () => {
      SecureStore.getItemAsync.mockResolvedValue(null);
      edgeFunctionTarget.mockResolvedValue({
        url: 'https://proj.supabase.co/functions/v1/embed-proxy',
        headers: { Authorization: 'Bearer jwt', apikey: 'anon' },
      });
      global.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: [{ embedding: [0.2] }] }) });
      supabase.rpc.mockReturnValue(noChunksRpc());

      await openaiService.search('hello again');

      expect(edgeFunctionTarget).toHaveBeenCalledWith('embed-proxy');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://proj.supabase.co/functions/v1/embed-proxy',
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer jwt' }) })
      );
    });
  });

  describe('chat() (non-streaming)', () => {
    const chatJson = { choices: [{ message: { content: 'An answer.' } }] };

    it('calls OpenAI directly when a personal key is saved', async () => {
      SecureStore.getItemAsync.mockResolvedValue('sk-personal-key-123456789');
      supabase.rpc.mockReturnValue(noChunksRpc());
      global.fetch.mockImplementation((url) =>
        Promise.resolve({
          ok: true,
          json: async () =>
            url.includes('/embeddings') ? { data: [{ embedding: [0.1] }] } : chatJson,
        })
      );

      await openaiService.chat('What is dementia?');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('api.openai.com/v1/chat/completions'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer sk-personal-key-123456789' }),
        })
      );
    });

    it('calls chat-proxy when no personal key is saved', async () => {
      SecureStore.getItemAsync.mockResolvedValue(null);
      supabase.rpc.mockReturnValue(noChunksRpc());
      edgeFunctionTarget.mockImplementation((name) =>
        Promise.resolve({
          url: `https://proj.supabase.co/functions/v1/${name}`,
          headers: { Authorization: 'Bearer jwt', apikey: 'anon' },
        })
      );
      global.fetch.mockImplementation((url) =>
        Promise.resolve({
          ok: true,
          json: async () => (url.includes('embed-proxy') ? { data: [{ embedding: [0.2] }] } : chatJson),
        })
      );

      await openaiService.chat('What is dementia?');

      expect(edgeFunctionTarget).toHaveBeenCalledWith('chat-proxy');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://proj.supabase.co/functions/v1/chat-proxy',
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer jwt' }) })
      );
    });
  });
});
