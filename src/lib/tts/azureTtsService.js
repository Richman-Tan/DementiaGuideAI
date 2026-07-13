import * as SecureStore from 'expo-secure-store';
import { AZURE_VISEME_TO_KEY, AZURE_DEFAULT_WEIGHTS } from '@/lib/lipsync/azureVisemeMap';

const SECURE_KEY    = 'azure_speech_key';
const SECURE_REGION = 'azure_speech_region';
const DEFAULT_VOICE = 'en-US-JennyNeural';

export class AzureAuthError extends Error {
  constructor(msg) { super(msg); this.name = 'AzureAuthError'; }
}

class AzureTtsService {
  constructor() {
    this._cachedKey    = null;
    this._cachedRegion = null;
  }

  async saveCredentials(key, region) {
    const k = key.trim();
    const r = region.trim().toLowerCase();
    await SecureStore.setItemAsync(SECURE_KEY, k);
    await SecureStore.setItemAsync(SECURE_REGION, r);
    this._cachedKey    = k;
    this._cachedRegion = r;
  }

  async getCredentials() {
    if (!this._cachedKey)    this._cachedKey    = await SecureStore.getItemAsync(SECURE_KEY);
    if (!this._cachedRegion) this._cachedRegion = await SecureStore.getItemAsync(SECURE_REGION);
    return { key: this._cachedKey, region: this._cachedRegion };
  }

  async clearCredentials() {
    await SecureStore.deleteItemAsync(SECURE_KEY);
    await SecureStore.deleteItemAsync(SECURE_REGION);
    this._cachedKey    = null;
    this._cachedRegion = null;
  }

  async hasCredentials() {
    const { key, region } = await this.getCredentials();
    return !!(key && key.length > 10 && region && region.length > 2);
  }

  async ttsWithAlignment(text, speechRate = 1.0, visemeWeights = null, voice = null) {
    const { key, region } = await this.getCredentials();
    if (!key || !region) throw new AzureAuthError('No Azure credentials configured');

    const resolvedVoice = voice || DEFAULT_VOICE;

    // Lazy require so a missing package doesn't crash the app on startup.
    const sdk = require('microsoft-cognitiveservices-speech-sdk');

    const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
    speechConfig.speechSynthesisVoiceName = resolvedVoice;
    speechConfig.speechSynthesisOutputFormat =
      sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

    // null audio config → SDK returns audio as ArrayBuffer, no auto-playback.
    // Audio is played through the WebView AudioContext alongside the viseme timeline.
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);

    const visemeEvents = [];
    synthesizer.visemeReceived = (_s, e) => {
      console.log('[Azure] viseme id:', e.visemeId, 'at', (e.audioOffset / 10_000_000).toFixed(3) + 's');
      visemeEvents.push({
        offsetSeconds: e.audioOffset / 10_000_000, // 100-nanosecond units → seconds
        visemeId: e.visemeId,
      });
    };

    // SSML rate: Azure prosody rate uses percentage strings (+10%, -20%, +0%)
    const ratePercent = Math.round((speechRate - 1.0) * 100);
    const rateStr     = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="en-US"><voice name="${resolvedVoice}"><mstts:express-as style="chat"><prosody rate="${rateStr}">${_escapeXml(text)}</prosody></mstts:express-as></voice></speak>`;

    return new Promise((resolve, reject) => {
      synthesizer.speakSsmlAsync(
        ssml,
        (result) => {
          synthesizer.close();
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            resolve({
              audioBase64:    _bufferToBase64(result.audioData),
              visemeTimeline: _buildTimeline(visemeEvents, visemeWeights),
            });
          } else {
            reject(new Error(`Azure synthesis failed: ${result.errorDetails}`));
          }
        },
        (err) => {
          synthesizer.close();
          reject(new Error(`Azure TTS error: ${err}`));
        }
      );
    });
  }
}

function _bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

function _escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function _buildTimeline(visemeEvents, visemeWeights) {
  if (!visemeEvents.length) return { frames: [], totalDuration: 0 };

  const weights = visemeWeights || AZURE_DEFAULT_WEIGHTS;
  const frames  = [];

  for (let i = 0; i < visemeEvents.length; i++) {
    const { offsetSeconds, visemeId } = visemeEvents[i];
    const visemeKey  = AZURE_VISEME_TO_KEY[visemeId] ?? 'neutral';
    const nextOffset = i + 1 < visemeEvents.length
      ? visemeEvents[i + 1].offsetSeconds
      : offsetSeconds + 0.08;
    const duration = Math.max(nextOffset - offsetSeconds, 0.001);
    const weight   = visemeKey === 'neutral' ? 0 : (weights[visemeKey] ?? 0.5);
    frames.push({ time: offsetSeconds, viseme: visemeKey, duration, weight });
  }

  const last = frames[frames.length - 1];
  return { frames, totalDuration: last.time + last.duration };
}

export const azureTtsService = new AzureTtsService();
