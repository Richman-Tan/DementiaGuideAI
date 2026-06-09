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

export const AVATAR_PROFILES = {
  aria_sdk: {
    id:          'aria_sdk',
    name:        'Aria',
    label:       'Classic',
    description: 'Warm, expressive look',
    modelKey:    'sdk',
    voice:       'en-US-JennyNeural',
    //
    // AvatarSDK MetaPerson — blobby/blended shapes, forgiving of heuristic errors.
    // Reduce if tongue protrudes.
    //
    visemeWeights: {
      aa: 0.68, ih: 0.60, ou: 0.65, ee: 0.62, oh: 0.65,
      v_pp: 0.70, v_ff: 0.58, v_th: 0.60, v_dd: 0.62,
      v_kk: 0.62, v_ch: 0.62, v_ss: 0.58, v_nn: 0.55, v_rr: 0.60,
      neutral: 0.0,
    },
  },

  aria_rpm: {
    id:          'aria_rpm',
    name:        'Aria',
    label:       'New Look',
    description: 'Enhanced lip sync with Ready Player Me',
    modelKey:    'rpm',
    voice:       'en-US-AriaNeural',
    //
    // RPM Oculus visemes — highly distinct shapes designed for audio-driven
    // phoneme detection. Low weights prevent heuristic errors looking jarring.
    //
    visemeWeights: {
      aa: 0.55, ih: 0.48, ou: 0.52, ee: 0.48, oh: 0.52,
      v_pp: 0.62, v_ff: 0.46, v_th: 0.48, v_dd: 0.50,
      v_kk: 0.50, v_ch: 0.50, v_ss: 0.46, v_nn: 0.44, v_rr: 0.48,
      neutral: 0.0,
    },
  },

  aria_metahuman: {
    id:          'aria_metahuman',
    name:        'Eric',
    label:       'Eric',
    description: 'High-fidelity Reallusion character',
    modelKey:    'metahuman',
    voice:       'en-US-EricNeural',
    //
    // MetaHuman ARKit shapes are professionally calibrated to anatomical range —
    // use high weights. Each viseme key drives a combo of ARKit shapes (via the
    // ARKit fallback in patchExprMap) where the inner combo scale factors are
    // already conservative (jawOpen 0.12–0.72 per vowel). The outer profile
    // weight is a multiplier on top, so it needs to be high (0.85–1.0) for
    // visible mouth movement.
    //
    visemeWeights: {
      aa: 1.00, ih: 0.88, ou: 0.92, ee: 0.88, oh: 0.95,
      v_pp: 0.95, v_ff: 0.82, v_th: 0.85, v_dd: 0.88,
      v_kk: 0.88, v_ch: 0.88, v_ss: 0.82, v_nn: 0.78, v_rr: 0.85,
      neutral: 0.0,
    },
  },
};

export const DEFAULT_AVATAR_ID  = 'aria_sdk';
export const AVATAR_PROFILE_LIST = Object.values(AVATAR_PROFILES);
