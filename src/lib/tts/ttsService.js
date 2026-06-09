import { azureTtsService } from './azureTtsService';
import { elevenLabsService } from './elevenLabsService';
import { openaiService } from '../../services/openaiService';

/**
 * Provider-agnostic TTS entry point.
 *
 * Returns: { audio: string, visemeTimeline: object|null }
 *
 * Provider priority (automatic):
 *   1. Azure TTS  — real phoneme viseme IDs, most accurate lip sync
 *   2. ElevenLabs — character-level alignment, good timing
 *   3. OpenAI TTS — no alignment data, RMS amplitude fallback in WebView
 *
 * @param {string} text
 * @param {{ speechRate?: number, voice?: string, visemeWeights?: object }} [options]
 */
export async function tts(text, options = {}) {
  const hasAzure = await azureTtsService.hasCredentials();
  console.log('[ttsService] hasAzure:', hasAzure);
  if (hasAzure) {
    try {
      const { audioBase64, visemeTimeline } = await azureTtsService.ttsWithAlignment(
        text,
        options.speechRate ?? 0.82,
        options.visemeWeights ?? null
      );
      console.log('[ttsService] Azure OK — viseme frames:', visemeTimeline?.frames?.length ?? 0);
      return { audio: `data:audio/mpeg;base64,${audioBase64}`, visemeTimeline };
    } catch (err) {
      console.warn('[ttsService] Azure failed, falling back to ElevenLabs:', err.message);
    }
  }

  const hasElevenLabs = await elevenLabsService.hasApiKey();
  if (hasElevenLabs) {
    try {
      const { audioBase64, visemeTimeline } = await elevenLabsService.ttsWithAlignment(
        text,
        options.voice,
        options.speechRate ?? 0.82,
        options.visemeWeights ?? null
      );
      return { audio: `data:audio/mpeg;base64,${audioBase64}`, visemeTimeline };
    } catch (err) {
      console.warn('[ttsService] ElevenLabs failed, falling back to OpenAI TTS:', err.message);
    }
  }

  const dataUri = await openaiService.tts(text, options.voice ?? 'nova');
  return { audio: dataUri, visemeTimeline: null };
}
