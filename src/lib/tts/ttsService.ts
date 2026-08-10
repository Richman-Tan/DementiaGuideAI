import { azureTtsService as azureRaw } from './azureTtsService';
import { elevenLabsService as elevenRaw } from './elevenLabsService';
import { normalizeSpokenText } from './normalizeSpokenText';
import { openaiService as openaiRaw } from '@/lib/openaiService';
import { edgeFunctionTarget } from '@/lib/net/edgeFunction';
import { createVisemeTimeline } from '@/lib/lipsync/createVisemeTimeline';
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

// Centralized-key TTS: tts-proxy already runs the ElevenLabs -> OpenAI
// cascade server-side (see supabase/functions/tts-proxy), so this is one
// call, not a repeat of the local cascade below. Used only when the caller
// has no personal ElevenLabs/OpenAI key — see the bottom of tts() below.
// Azure has no centralized path (see tts-proxy's header comment on why), so
// it isn't part of this fallback; Azure users must be on BYOK for Azure.
async function ttsViaProxy(
  text: string,
  speechRate: number,
  visemeWeights: TtsOptions['visemeWeights']
): Promise<TtsResult> {
  const { url, headers } = await edgeFunctionTarget('tts-proxy');
  const resp = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, speechRate }),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => `HTTP ${resp.status}`);
    throw new Error(`AI voice service error: ${errText}`);
  }
  const data = await resp.json();
  // When tts-proxy served this from ElevenLabs, `alignment` has the same
  // shape elevenLabsService.ttsWithAlignment() gets locally — build the same
  // viseme timeline so BYOK and centralized ElevenLabs get identical lip-sync.
  // When it fell back to OpenAI server-side, alignment is null and the
  // WebView's RMS-amplitude fallback drives the mouth instead, same as the
  // local OpenAI tier below.
  const visemeTimeline = data.alignment
    ? createVisemeTimeline(data.alignment, { visemeWeights: visemeWeights ?? undefined })
    : null;
  return { audio: `data:audio/mpeg;base64,${data.audioBase64}`, visemeTimeline };
}

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
    // Prefer the profile's explicit ElevenLabs voice ID. options.voice carries the
    // Azure voice name (e.g. en-US-EricNeural), which is NOT a valid ElevenLabs ID —
    // only forward it if it looks like one (16+ alphanumerics); otherwise fall back
    // to a warm, mature male voice (Brian) instead of 404-ing.
    const WARM_MALE_ELEVEN_VOICE = 'nPczCjzI2devNBz1zQrb'; // ElevenLabs "Brian"
    const elevenVoice =
      options.elevenVoiceId ??
      (options.voice && /^[A-Za-z0-9]{16,}$/.test(options.voice)
        ? options.voice
        : WARM_MALE_ELEVEN_VOICE);
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

  // Neither Azure nor a personal ElevenLabs key worked. If there's also no
  // personal OpenAI key, this is a fully centralized user — one proxy call
  // replaces the rest of this cascade (it runs ElevenLabs -> OpenAI
  // server-side itself; see supabase/functions/tts-proxy). A personal OpenAI
  // key still takes the direct BYOK path below, unchanged.
  const hasOpenAiKey = await openaiService.hasApiKey();
  if (!hasOpenAiKey) {
    const t0 = Date.now();
    const result = await ttsViaProxy(text, options.speechRate ?? 0.78, options.visemeWeights ?? null);
    console.log(
      `[TTS] provider=proxy ok ms=${Date.now() - t0} frames=${frameCount(result.visemeTimeline)}`
    );
    return result;
  }

  // OpenAI TTS only accepts its own voice enum. Prefer the profile's explicit
  // openaiVoice; options.voice may be an Azure (en-US-EricNeural) or ElevenLabs
  // (voice-id) name, which OpenAI rejects — whitelist and fall back to onyx.
  const OPENAI_VOICES = new Set([
    'nova', 'shimmer', 'echo', 'onyx', 'fable', 'alloy', 'ash', 'sage', 'coral',
  ]);
  const requestedOpenaiVoice = options.openaiVoice ?? options.voice;
  const openaiVoice =
    requestedOpenaiVoice && OPENAI_VOICES.has(requestedOpenaiVoice) ? requestedOpenaiVoice : 'onyx';
  const t0 = Date.now();
  const dataUri = await openaiService.tts(text, openaiVoice);
  // OpenAI returns no alignment, so there is NO lip-sync on this path — the WebView
  // falls back to RMS amplitude. Flag it loudly so a silent-mouth avatar is diagnosable.
  console.warn(
    `[TTS] provider=openai ok ms=${Date.now() - t0} frames=0 voice=${openaiVoice} — no alignment, lips use RMS fallback`
  );
  return { audio: dataUri, visemeTimeline: null };
}
