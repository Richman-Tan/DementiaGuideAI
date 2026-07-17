// Decides per turn whether the voice pipeline uses the ElevenLabs WebSocket
// streaming path or the classic per-sentence REST cascade.
//
// Streaming requires: developer flag on, no sticky degrade this session, an
// ElevenLabs key, and NO Azure credentials — Azure users keep their
// higher-fidelity phoneme-viseme REST path (streaming Azure is future work).
// The caller additionally gates on the renderer's supportsStreamingAudio and
// the user's fastVoiceMode setting.

import { VOICE_STREAMING_TTS } from '@/lib/voice/voiceConfig';
import { azureTtsService } from './azureTtsService';
import { elevenLabsService } from './elevenLabsService';

let ttsDegraded = false; // sticky after a mid-turn WS failure — REST for the rest of the session

export function markTtsDegraded(reason) {
  if (!ttsDegraded) {
    console.warn(`[TTS] streaming degraded for this session: ${reason}`);
  }
  ttsDegraded = true;
}

export async function selectTtsMode() {
  if (!VOICE_STREAMING_TTS || ttsDegraded) return 'rest';
  try {
    if (await azureTtsService.hasCredentials()) return 'rest';
    if (await elevenLabsService.hasApiKey()) return 'eleven-stream';
  } catch {
    // credential checks failing → be conservative
  }
  return 'rest';
}
