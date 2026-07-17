/**
 * Avatar profiles — one entry per character model.
 *
 * Each profile stores its own visemeWeights so the two models are tuned
 * independently and neither's config can bleed into the other.
 *
 * ── AvatarSDK (aria_sdk) ────────────────────────────────────────────────────
 * The MetaPerson model ships visemes WITHOUT the viseme_ prefix (aa, ih, ou,
 * E, oh, PP, FF, …). patchExprMap detects this and remaps EXPR_MAP at runtime.
 * The shapes are "blobby" — they blend smoothly and hide heuristic mismatch
 * well, so moderate weights (0.55–0.70) work naturally.
 *
 * ── Ready Player Me (aria_rpm) ──────────────────────────────────────────────
 * The zhenja.glb ships the full Oculus OVR LipSync viseme set WITH the
 * viseme_ prefix (viseme_aa, viseme_PP, viseme_CH, …). These shapes are highly
 * distinct and purpose-built for audio-driven phoneme detection at full range.
 * Counter-intuitively, RPM needs LOWER weights than AvatarSDK — distinct shapes
 * make heuristic mapping errors more visible, so keep weights conservative.
 *
 * ── MetaHuman (aria_metahuman) ──────────────────────────────────────────────
 * Exports 51 ARKit blendshapes (jawOpen, mouthFunnel, mouthSmileLeft, etc.)
 * via the smorchj/metahuman-to-glb pipeline. No Oculus visemes — patchExprMap
 * ARKit fallback drives weighted combinations of ARKit shapes. Weights sit
 * between SDK and RPM: shapes are high-quality but still driven by heuristic
 * text mapping, so keep values moderate.
 *
 * modelKey is resolved to an actual asset in VoiceScreen where require() calls
 * must be static — profile objects are plain JSON-serialisable data.
 */

export type AvatarRenderer = 'threejs' | 'unity';

export interface AvatarProfile {
  id: string;
  name: string;
  label: string;
  description: string;
  renderer: AvatarRenderer;
  /** Static require() key resolved in VoiceScreen; absent for Unity renderers. */
  modelKey?: string;
  voice: string;
  /**
   * Provider-specific voices. `voice` above is the Azure voice name; ElevenLabs
   * and OpenAI reject Azure names, so without these fields ttsService falls
   * back to its hardcoded defaults and every avatar speaks with the same voice.
   */
  elevenVoiceId?: string;
  openaiVoice?: string;
  /** Per-viseme peak weights, or null to use the renderer's built-in default. */
  visemeWeights: Record<string, number> | null;
}

export const AVATAR_PROFILES = {
  aria_sdk: {
    id: 'aria_sdk',
    name: 'Aria',
    label: 'Classic',
    description: 'Warm, expressive look',
    renderer: 'threejs',
    modelKey: 'sdk',
    voice: 'en-US-JennyNeural',
    elevenVoiceId: 'EXAVITQu4vr4xnSDxMaL', // Bella — warm, clear female
    openaiVoice: 'nova',
    //
    // AvatarSDK MetaPerson — blobby/blended shapes, forgiving of heuristic errors.
    // Reduce if tongue protrudes.
    //
    visemeWeights: {
      aa: 0.68,
      ih: 0.6,
      ou: 0.65,
      ee: 0.62,
      oh: 0.65,
      v_pp: 0.7,
      v_ff: 0.58,
      v_th: 0.6,
      v_dd: 0.62,
      v_kk: 0.62,
      v_ch: 0.62,
      v_ss: 0.58,
      v_nn: 0.55,
      v_rr: 0.6,
      neutral: 0.0,
    },
  },

  aria_rpm: {
    id: 'aria_rpm',
    name: 'Aria',
    label: 'New Look',
    description: 'Enhanced lip sync with Ready Player Me',
    renderer: 'threejs',
    modelKey: 'rpm',
    voice: 'en-US-AriaNeural',
    elevenVoiceId: 'EXAVITQu4vr4xnSDxMaL', // Bella — same Aria persona as aria_sdk
    openaiVoice: 'nova',
    //
    // RPM Oculus visemes — highly distinct shapes designed for audio-driven
    // phoneme detection. Low weights prevent heuristic errors looking jarring.
    //
    visemeWeights: {
      aa: 0.55,
      ih: 0.48,
      ou: 0.52,
      ee: 0.48,
      oh: 0.52,
      v_pp: 0.62,
      v_ff: 0.46,
      v_th: 0.48,
      v_dd: 0.5,
      v_kk: 0.5,
      v_ch: 0.5,
      v_ss: 0.46,
      v_nn: 0.44,
      v_rr: 0.48,
      neutral: 0.0,
    },
  },

  aria_metahuman: {
    id: 'aria_metahuman',
    name: 'Eric',
    label: 'Eric',
    description: 'High-fidelity AvatarSDK character',
    renderer: 'threejs',
    modelKey: 'metahuman',
    voice: 'en-US-EricNeural',
    elevenVoiceId: 'nPczCjzI2devNBz1zQrb', // Brian — warm, mature male
    openaiVoice: 'onyx',
    //
    // AvatarSDK MetaPerson export — same model type as aria_sdk.
    // Viseme shapes (aa, ih, ou, oh, PP, FF…) are direct morph targets.
    // Slightly higher than aria_sdk because Eric has a fuller ARKit set
    // (jawOpen combos for ee/oh) so blending is smoother.
    //
    visemeWeights: {
      aa: 0.7,
      ih: 0.62,
      ou: 0.67,
      ee: 0.64,
      oh: 0.68,
      v_pp: 0.72,
      v_ff: 0.6,
      v_th: 0.62,
      v_dd: 0.64,
      v_kk: 0.64,
      v_ch: 0.64,
      v_ss: 0.6,
      v_nn: 0.57,
      v_rr: 0.62,
      neutral: 0.0,
    },
  },

  cc4_aria: {
    id: 'cc4_aria',
    name: 'Aria',
    label: 'CC4',
    description: 'Reallusion CC4 character (Unity)',
    renderer: 'unity',
    // The CC4 character is HD_Aaron — male voices across all providers.
    voice: 'en-US-EricNeural',
    elevenVoiceId: 'nPczCjzI2devNBz1zQrb', // Brian — warm, mature male
    openaiVoice: 'onyx',
    // CC4 uses its own native blendshape set (see blendshapeTranslator.js), not
    // ARKit. visemeWeights is null so blendshapeTranslator uses its built-in
    // CC4_DEFAULT_WEIGHT scalar.
    visemeWeights: null,
  },
} satisfies Record<string, AvatarProfile>;

export const DEFAULT_AVATAR_ID = 'aria_sdk';
export const AVATAR_PROFILE_LIST: AvatarProfile[] = Object.values(AVATAR_PROFILES);
