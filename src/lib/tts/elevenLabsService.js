import * as SecureStore from 'expo-secure-store';
import { createVisemeTimeline } from '../lipsync/createVisemeTimeline';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';
const SECURE_KEY_NAME = 'elevenlabs_api_key';

// eleven_turbo_v2_5 is the low-latency model — best choice for real-time conversation.
// Swap to 'eleven_multilingual_v2' for higher quality at the cost of ~300 ms extra latency.
const DEFAULT_MODEL_ID = 'eleven_turbo_v2_5';

// Default voice: Bella (warm, clear female voice). Override via ttsWithAlignment voiceId param.
const DEFAULT_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL';

// ─── Custom error types (mirror openaiService pattern) ───────────────────────

export class ElevenLabsAuthError extends Error {
  constructor(msg) { super(msg); this.name = 'ElevenLabsAuthError'; }
}

export class ElevenLabsRateLimitError extends Error {
  constructor(msg) { super(msg); this.name = 'ElevenLabsRateLimitError'; }
}

// ─── Service ─────────────────────────────────────────────────────────────────

class ElevenLabsService {
  constructor() {
    this._cachedKey = null;
  }

  async saveApiKey(key) {
    this._cachedKey = key;
    await SecureStore.setItemAsync(SECURE_KEY_NAME, key);
  }

  async getApiKey() {
    if (this._cachedKey) return this._cachedKey;
    const key = await SecureStore.getItemAsync(SECURE_KEY_NAME);
    this._cachedKey = key;
    return key;
  }

  async hasApiKey() {
    const key = await this.getApiKey();
    return !!(key && key.trim().length > 0);
  }

  async clearApiKey() {
    this._cachedKey = null;
    await SecureStore.deleteItemAsync(SECURE_KEY_NAME);
  }

  /**
   * Generate speech with character-level alignment using ElevenLabs.
   *
   * Returns:
   *   { audioBase64: string, visemeTimeline: { frames, totalDuration } }
   *
   * audioBase64 is the raw base64 string (no data-URI prefix) — prefix it yourself:
   *   `data:audio/mpeg;base64,${audioBase64}`
   *
   * The visemeTimeline is ready to inject into the WebView LipSyncController.
   *
   * To swap the voice provider later: replace this class with one that implements
   * the same ttsWithAlignment(text, voiceId) signature and update ttsService.js.
   */
  async ttsWithAlignment(text, voiceId = DEFAULT_VOICE_ID) {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new ElevenLabsAuthError('No ElevenLabs API key configured');

    const resp = await fetch(
      `${ELEVENLABS_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: DEFAULT_MODEL_ID,
          output_format: 'mp3_22050_32',
          voice_settings: {
            stability: 0.40,
            similarity_boost: 0.75,
            style: 0.20,
            speed: 1,
          },
        }),
      }
    );

    if (resp.status === 401) throw new ElevenLabsAuthError('Invalid ElevenLabs API key');
    if (resp.status === 429) throw new ElevenLabsRateLimitError('ElevenLabs rate limit reached');
    if (!resp.ok) {
      const errText = await resp.text().catch(() => `HTTP ${resp.status}`);
      throw new Error(`ElevenLabs TTS error: ${errText}`);
    }

    const data = await resp.json();

    if (!data.audio_base64) {
      throw new Error('ElevenLabs response missing audio_base64');
    }

    const visemeTimeline = data.alignment
      ? createVisemeTimeline(data.alignment)
      : null;

    return {
      audioBase64: data.audio_base64,
      visemeTimeline,
    };
  }
}

export const elevenLabsService = new ElevenLabsService();
