import { azureTtsService as azureRaw } from './azureTtsService';
import { elevenLabsService as elevenRaw } from './elevenLabsService';
import { openaiService as openaiRaw } from '@/lib/openaiService';
import type {
  AzureTtsService,
  ElevenLabsService,
  OpenAITtsService,
  TtsOptions,
  TtsResult,
} from '@/lib/types';

// The provider singletons are still JS; assert their contracts so this module
// is fully typed. Remove the casts once the providers are migrated to TS.
const azureTtsService = azureRaw as unknown as AzureTtsService;
const elevenLabsService = elevenRaw as unknown as ElevenLabsService;
const openaiService = openaiRaw as unknown as OpenAITtsService;

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Provider-agnostic TTS entry point.
 *
 * Provider priority (automatic):
 *   1. Azure TTS  — real phoneme viseme IDs, most accurate lip sync
 *   2. ElevenLabs — character-level alignment, good timing
 *   3. OpenAI TTS — no alignment data, RMS amplitude fallback in WebView
 */
export async function tts(text: string, options: TtsOptions = {}): Promise<TtsResult> {
  const hasAzure = await azureTtsService.hasCredentials();
  console.log('[ttsService] hasAzure:', hasAzure);
  if (hasAzure) {
    try {
      const { audioBase64, visemeTimeline } = await azureTtsService.ttsWithAlignment(
        text,
        options.speechRate ?? 0.78,
        options.visemeWeights ?? null,
        options.voice ?? null
      );
      console.log('[ttsService] Azure OK — viseme frames:', visemeTimeline?.frames?.length ?? 0);
      return {
        audio: `data:audio/mpeg;base64,${audioBase64}`,
        visemeTimeline,
      };
    } catch (err) {
      console.warn('[ttsService] Azure failed, falling back to ElevenLabs:', messageOf(err));
    }
  }

  const hasElevenLabs = await elevenLabsService.hasApiKey();
  if (hasElevenLabs) {
    try {
      const { audioBase64, visemeTimeline } = await elevenLabsService.ttsWithAlignment(
        text,
        options.voice,
        options.speechRate ?? 0.78,
        options.visemeWeights ?? null
      );
      return {
        audio: `data:audio/mpeg;base64,${audioBase64}`,
        visemeTimeline,
      };
    } catch (err) {
      console.warn('[ttsService] ElevenLabs failed, falling back to OpenAI TTS:', messageOf(err));
    }
  }

  const dataUri = await openaiService.tts(text, options.voice ?? 'nova');
  return { audio: dataUri, visemeTimeline: null };
}
