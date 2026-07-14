import { azureTtsService as azureRaw } from './azureTtsService';
import { elevenLabsService as elevenRaw } from './elevenLabsService';
import { normalizeSpokenText } from './normalizeSpokenText';
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
  // Expand numbers/symbols to spoken words BEFORE any provider runs. The audio
  // is unchanged (providers say "twenty-three" for "23" either way) but the
  // alignment now carries real letters, so numbers drive the lips instead of
  // freezing the mouth. See normalizeSpokenText for the rationale.
  const rawLen = text.length;
  text = normalizeSpokenText(text);
  const normalized = text.length !== rawLen;
  console.log(
    `[TTS] request chars=${text.length}` +
      (normalized ? ` (normalized from ${rawLen})` : '') +
      ` voice=${options.voice ?? 'default'} rate=${options.speechRate ?? 0.78}`
  );

  const frameCount = (r: TtsResult['visemeTimeline']) => r?.frames?.length ?? 0;

  const hasAzure = await azureTtsService.hasCredentials();
  if (hasAzure) {
    const t0 = Date.now();
    try {
      const { audioBase64, visemeTimeline } = await azureTtsService.ttsWithAlignment(
        text,
        options.speechRate ?? 0.78,
        options.visemeWeights ?? null,
        options.voice ?? null
      );
      console.log(
        `[TTS] provider=azure ok ms=${Date.now() - t0} frames=${frameCount(visemeTimeline)}`
      );
      return { audio: `data:audio/mpeg;base64,${audioBase64}`, visemeTimeline };
    } catch (err) {
      console.warn(
        `[TTS] provider=azure failed ms=${Date.now() - t0}: ${messageOf(err)} — falling back to ElevenLabs`
      );
    }
  }

  const hasElevenLabs = await elevenLabsService.hasApiKey();
  if (hasElevenLabs) {
    // Avatar profiles carry Azure voice names (e.g. en-US-EricNeural), which are NOT
    // valid ElevenLabs voice IDs. Only forward a voice that looks like an ElevenLabs
    // ID (16+ alphanumerics); otherwise use a warm, mature male voice (Brian) that
    // matches the Aaron avatar, instead of 404-ing or landing on the female default.
    const WARM_MALE_ELEVEN_VOICE = 'nPczCjzI2devNBz1zQrb'; // ElevenLabs "Brian"
    const elevenVoice =
      options.voice && /^[A-Za-z0-9]{16,}$/.test(options.voice)
        ? options.voice
        : WARM_MALE_ELEVEN_VOICE;
    const t0 = Date.now();
    try {
      const { audioBase64, visemeTimeline } = await elevenLabsService.ttsWithAlignment(
        text,
        elevenVoice,
        options.speechRate ?? 0.78,
        options.visemeWeights ?? null
      );
      console.log(
        `[TTS] provider=elevenlabs ok ms=${Date.now() - t0} frames=${frameCount(visemeTimeline)} voice=${elevenVoice}`
      );
      return { audio: `data:audio/mpeg;base64,${audioBase64}`, visemeTimeline };
    } catch (err) {
      console.warn(
        `[TTS] provider=elevenlabs failed ms=${Date.now() - t0}: ${messageOf(err)} — falling back to OpenAI TTS`
      );
    }
  }

  // OpenAI TTS only accepts its own voice enum. options.voice may be an Azure
  // (en-US-EricNeural) or ElevenLabs (voice-id) name from the avatar profile, which
  // OpenAI rejects — so whitelist it and fall back to a valid voice (onyx = male,
  // matching the current avatar) rather than passing an incompatible name through.
  const OPENAI_VOICES = new Set([
    'nova', 'shimmer', 'echo', 'onyx', 'fable', 'alloy', 'ash', 'sage', 'coral',
  ]);
  const openaiVoice = options.voice && OPENAI_VOICES.has(options.voice) ? options.voice : 'onyx';
  const t0 = Date.now();
  const dataUri = await openaiService.tts(text, openaiVoice);
  // OpenAI returns no alignment, so there is NO lip-sync on this path — the WebView
  // falls back to RMS amplitude. Flag it loudly so a silent-mouth avatar is diagnosable.
  console.warn(
    `[TTS] provider=openai ok ms=${Date.now() - t0} frames=0 voice=${openaiVoice} — no alignment, lips use RMS fallback`
  );
  return { audio: dataUri, visemeTimeline: null };
}
