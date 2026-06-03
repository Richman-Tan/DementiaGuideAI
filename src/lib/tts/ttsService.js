import { elevenLabsService } from './elevenLabsService';
import { openaiService } from '../../services/openaiService';

/**
 * Provider-agnostic TTS entry point.
 *
 * Returns: { audio: string, visemeTimeline: object|null }
 *
 *   audio          — data:audio/mpeg;base64,... URI ready for Web Audio API decoding.
 *   visemeTimeline — { frames, totalDuration } when ElevenLabs is active, null otherwise.
 *                    null signals AvatarVRM to fall back to RMS-based lip sync.
 *
 * Provider selection (automatic):
 *   1. If an ElevenLabs API key is stored → try ElevenLabs with-timestamps endpoint.
 *      On any failure, log a warning and fall through to OpenAI TTS.
 *   2. OpenAI TTS (tts-1) is always the fallback; it returns no alignment data, so
 *      visemeTimeline is null and the avatar uses RMS amplitude for mouth animation.
 *
 * To swap the LLM/TTS provider later:
 *   - Replace `elevenLabsService` with a different service that implements
 *     ttsWithAlignment(text, voiceId) → { audioBase64, visemeTimeline }.
 *   - Update the import above; this function's call site in useAvatarConversation
 *     does not need to change.
 *
 * @param {string} text
 * @param {{ voice?: string }} [options]
 */
export async function tts(text, options = {}) {
  const hasElevenLabs = await elevenLabsService.hasApiKey();

  if (hasElevenLabs) {
    try {
      const { audioBase64, visemeTimeline } = await elevenLabsService.ttsWithAlignment(
        text,
        options.voice,
        options.speechRate ?? 1.0,
        options.visemeWeights ?? null
      );
      return {
        audio: `data:audio/mpeg;base64,${audioBase64}`,
        visemeTimeline,
      };
    } catch (err) {
      // Graceful degradation — ElevenLabs failed, use OpenAI TTS + RMS lip sync
      console.warn('[ttsService] ElevenLabs failed, falling back to OpenAI TTS:', err.message);
    }
  }

  // OpenAI TTS fallback — no alignment data available
  const dataUri = await openaiService.tts(text, options.voice ?? 'nova');
  return { audio: dataUri, visemeTimeline: null };
}
