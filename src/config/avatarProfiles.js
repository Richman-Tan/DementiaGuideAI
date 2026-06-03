/**
 * Avatar profiles — one entry per character model.
 *
 * Each profile stores its own visemeWeights so the two models are tuned
 * independently and neither's config can bleed into the other.
 *
 * AvatarSDK (aria_sdk):  Weights are reduced because the MetaPerson morph
 *   targets reach extreme articulation before 1.0.
 *
 * Ready Player Me (aria_rpm):  Weights are higher because RPM ships purpose-
 *   built Oculus visemes (viseme_PP, viseme_CH, …) designed for full 0–1 range.
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
    // AvatarSDK-tuned weights — calmer, model reaches extremes well before 1.0
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
    // RPM Oculus visemes are purpose-built for full range — use original target values
    visemeWeights: {
      aa: 0.85, ih: 0.72, ou: 0.78, ee: 0.75, oh: 0.80,
      v_pp: 0.78, v_ff: 0.65, v_th: 0.68, v_dd: 0.72,
      v_kk: 0.72, v_ch: 0.72, v_ss: 0.65, v_nn: 0.65, v_rr: 0.70,
      neutral: 0.0,
    },
  },
};

export const DEFAULT_AVATAR_ID  = 'aria_sdk';
export const AVATAR_PROFILE_LIST = Object.values(AVATAR_PROFILES);
