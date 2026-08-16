// Web avatar roster — mobile parity: the Unity CC characters (Aaron default,
// Ariana) lead, matching src/features/avatar/config/avatarProfiles.ts; the
// Three.js personas are that file's LEGACY block, kept selectable on web as
// the fallback renderer when no Unity WebGL build is installed (and as an
// escape hatch for low-end devices). Picker order = insertion order.

export const AVATAR_PROFILES = {
  aaron: {
    id: 'aaron',
    name: 'Aaron',
    label: 'Classic',
    description: 'Lifelike 3D guide (Unity)',
    renderer: 'unity',
    unityCharacterId: 'aaron',
    elevenVoiceId: 'nPczCjzI2devNBz1zQrb', // Brian — warm, mature male
    openaiVoice: 'onyx',
    visemeWeights: null, // CC blendshapes; translated Unity-side
  },

  ariana: {
    id: 'ariana',
    name: 'Ariana',
    label: 'New',
    description: 'Lifelike 3D guide (Unity)',
    renderer: 'unity',
    unityCharacterId: 'ariana',
    elevenVoiceId: 'EXAVITQu4vr4xnSDxMaL', // Bella — warm, clear female
    openaiVoice: 'nova',
    visemeWeights: null,
  },

  aria: {
    id: 'aria',
    name: 'Aria',
    label: 'Legacy',
    description: 'Warm, expressive 3D guide',
    renderer: 'threejs',
    modelKey: 'aria', // assets/characters/aria/model.glb (~26 MB)
    elevenVoiceId: 'EXAVITQu4vr4xnSDxMaL', // Bella — warm, clear female
    openaiVoice: 'nova',
    // AvatarSDK MetaPerson — blobby/blended shapes, forgiving of heuristic errors.
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

  zhenja: {
    id: 'zhenja',
    name: 'Zhenja',
    label: 'Legacy Lite',
    description: 'Lighter download — loads faster',
    renderer: 'threejs',
    modelKey: 'zhenja', // assets/characters/zhenja/zhenja.glb (~8.8 MB)
    elevenVoiceId: 'EXAVITQu4vr4xnSDxMaL',
    openaiVoice: 'nova',
    // RPM Oculus visemes — highly distinct shapes; keep weights conservative.
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
};

export const DEFAULT_AVATAR_ID = 'aaron';

export const getAvatarProfile = (id) => AVATAR_PROFILES[id] ?? AVATAR_PROFILES[DEFAULT_AVATAR_ID];
