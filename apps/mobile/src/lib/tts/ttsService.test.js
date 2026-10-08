// The voice cascade in ttsService.ts (Azure → ElevenLabs → OpenAI TTS), driven
// by a bad ElevenLabs key. This is the logic half of the FR-36 "invalid
// ElevenLabs key" drill: on the iOS Simulator the cascade can't be reached
// (it only runs on text the language model produced, which needs a real
// OpenAI key, and playing the result would be audible), so
// apps/mobile/.maestro/12-drill-invalid-voice-key.yaml checks the screens and
// this file checks the fallback. Nothing is played: tts() only returns data.
// The keys are fake, and every request is answered by a stub.
import * as SecureStore from 'expo-secure-store';
import { tts } from './ttsService';
import { elevenLabsService } from './elevenLabsService';
import { azureTtsService } from './azureTtsService';
import { openaiService, OpenAIAuthError } from '../openaiService';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock('../supabaseService', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('../ragTelemetry', () => ({ recordRetrieval: jest.fn() }));

const FAKE_ELEVEN_KEY = 'invalid-test-key-not-real-0000';
const FAKE_OPENAI_KEY = 'sk-e2e-placeholder-not-a-real-key-0000';

function storeKeys(keys) {
  SecureStore.getItemAsync.mockImplementation(async (name) => keys[name] ?? null);
}

function respond({ elevenStatus, openaiStatus }) {
  global.fetch = jest.fn(async (url) => {
    if (url.startsWith('https://api.elevenlabs.io/')) {
      return { status: elevenStatus, ok: elevenStatus < 400, text: async () => 'unauthorized' };
    }
    if (url === 'https://api.openai.com/v1/audio/speech') {
      return {
        status: openaiStatus,
        ok: openaiStatus < 400,
        text: async () => 'unauthorized',
        arrayBuffer: async () => new Uint8Array([0x49, 0x44, 0x33]).buffer, // "ID3"
      };
    }
    throw new Error(`unexpected request: ${url}`);
  });
}

let warn;
beforeEach(() => {
  jest.clearAllMocks();
  // The providers are module-level singletons that cache keys.
  elevenLabsService._cachedKey = null;
  azureTtsService._cachedKey = null;
  azureTtsService._cachedRegion = null;
  openaiService._cachedKey = null;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

test('an invalid ElevenLabs key falls back to the OpenAI voice', async () => {
  storeKeys({ elevenlabs_api_key: FAKE_ELEVEN_KEY, openai_api_key: FAKE_OPENAI_KEY });
  respond({ elevenStatus: 401, openaiStatus: 200 });

  const result = await tts('Hello there.', { voice: 'en-US-EricNeural', openaiVoice: 'onyx' });

  // ElevenLabs was tried first, with the key from Settings, and refused it…
  expect(global.fetch).toHaveBeenCalledTimes(2);
  const [elevenUrl, elevenInit] = global.fetch.mock.calls[0];
  expect(elevenUrl).toMatch(/^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\/.+\/with-timestamps$/);
  expect(elevenInit.headers['xi-api-key']).toBe(FAKE_ELEVEN_KEY);
  expect(warn).toHaveBeenCalledWith(
    expect.stringMatching(/provider=elevenlabs failed .*Invalid ElevenLabs API key — falling back to OpenAI TTS/)
  );

  // …then the OpenAI voice answered, with the profile's OpenAI voice.
  const [openaiUrl, openaiInit] = global.fetch.mock.calls[1];
  expect(openaiUrl).toBe('https://api.openai.com/v1/audio/speech');
  expect(JSON.parse(openaiInit.body)).toMatchObject({ model: 'tts-1', voice: 'onyx' });
  expect(result).toEqual({ audio: 'data:audio/mpeg;base64,SUQz', visemeTimeline: null });
});

test('when the OpenAI voice fails too, the error reaches the caller', async () => {
  storeKeys({ elevenlabs_api_key: FAKE_ELEVEN_KEY, openai_api_key: FAKE_OPENAI_KEY });
  respond({ elevenStatus: 401, openaiStatus: 401 });

  await expect(tts('Hello there.')).rejects.toBeInstanceOf(OpenAIAuthError);
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test('with no voice keys at all, only the OpenAI voice is tried', async () => {
  storeKeys({ openai_api_key: FAKE_OPENAI_KEY });
  respond({ elevenStatus: 401, openaiStatus: 200 });

  await tts('Hello there.');

  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/audio/speech');
});
