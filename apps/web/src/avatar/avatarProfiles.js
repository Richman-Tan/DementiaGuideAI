// Web avatar roster — the two Unity CC characters (Aaron default, Ariana),
// matching the lead entries of src/features/avatar/config/avatarProfiles.ts.
// Name, voice and copy belong to the character, not the renderer: with no
// Unity WebGL build (or a failed load) the same character keeps talking with
// the same voice, over the headless audio engine. A stored id that is no
// longer on the roster (the retired Three.js 'aria' / 'zhenja') resolves to
// the default through getAvatarProfile. Picker order = insertion order.

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
};

export const DEFAULT_AVATAR_ID = 'aaron';

export const getAvatarProfile = (id) => AVATAR_PROFILES[id] ?? AVATAR_PROFILES[DEFAULT_AVATAR_ID];
