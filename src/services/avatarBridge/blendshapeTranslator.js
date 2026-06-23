/**
 * blendshapeTranslator
 *
 * Converts the 14-key internal viseme timeline (from Azure/ElevenLabs TTS)
 * to the Apple ARKit 52 blendshape format used by Reallusion CC4/CC5 characters
 * in Unity. This module runs in the RN JS thread — not inside a WebView.
 *
 * Input  (from ttsService):
 *   { frames: [{ time, viseme, duration, weight }], totalDuration }
 *
 * Output (for AvatarUnity / Unity UaaL):
 *   [{ time, weights: { [arkit_key]: 0.0–1.0 } }]
 */

// Base ARKit 52 blendshape contributions for each of the 14 internal viseme keys.
// Values are multiplied by (frame.weight × profileScale) at translation time.
// Only jaw/mouth shapes are driven here; eye/brow shapes are handled by Unity's
// own AvatarController animation layer.
const VISEME_TO_ARKIT = {
  // Vowels
  aa: { jawOpen: 0.70, mouthShrugLower: 0.30, mouthShrugUpper: 0.10 },
  ih: { jawOpen: 0.25, mouthStretchLeft: 0.22, mouthStretchRight: 0.22 },
  ou: { mouthPucker: 0.80, mouthFunnel: 0.50, jawOpen: 0.12 },
  ee: { mouthStretchLeft: 0.65, mouthStretchRight: 0.65, jawOpen: 0.18 },
  oh: { mouthFunnel: 0.70, jawOpen: 0.42, mouthPucker: 0.20 },
  // Consonants — bilabial/labiodental
  v_pp: { mouthClose: 0.90, mouthPressLeft: 0.45, mouthPressRight: 0.45 },
  v_ff: { mouthUpperUpLeft: 0.60, mouthUpperUpRight: 0.60, mouthFrownLeft: 0.30, mouthFrownRight: 0.30 },
  // Dental/alveolar
  v_th: { mouthStretchLeft: 0.30, mouthStretchRight: 0.30, mouthLowerDownLeft: 0.20, mouthLowerDownRight: 0.20 },
  v_dd: { jawOpen: 0.22, mouthShrugUpper: 0.30, mouthLowerDownLeft: 0.15, mouthLowerDownRight: 0.15 },
  // Velar
  v_kk: { jawOpen: 0.30, mouthShrugLower: 0.40 },
  // Palato-alveolar / sibilants
  v_ch: { mouthPucker: 0.40, mouthFunnel: 0.30, jawOpen: 0.22 },
  v_ss: { jawOpen: 0.10, mouthStretchLeft: 0.18, mouthStretchRight: 0.18 },
  // Nasal / rhotic
  v_nn: { jawOpen: 0.08, mouthShrugUpper: 0.22 },
  v_rr: { mouthPucker: 0.32, jawOpen: 0.22, mouthFunnel: 0.18 },
};

// Default ARKit weight scalars when no per-profile visemeWeights are provided.
// These are tuned for Reallusion CC4 Auto Setup character rigs.
const CC4_DEFAULT_WEIGHT = 0.70;

/**
 * Convert a 14-viseme timeline to an ARKit 52 blendshape timeline.
 *
 * @param {{ frames: Array, totalDuration: number }} visemeTimeline
 * @param {Object|null} visemeWeights  Per-profile weight scalars (14 keys). Pass null
 *                                     for CC4 profiles to use CC4_DEFAULT_WEIGHT.
 * @returns {Array<{ time: number, weights: Object }>}
 */
export function visemeTimelineToArkit(visemeTimeline, visemeWeights) {
  if (!visemeTimeline?.frames?.length) return [];

  return visemeTimeline.frames.map(frame => {
    const { time, viseme, weight } = frame;
    const baseShapes = VISEME_TO_ARKIT[viseme];
    if (!baseShapes) return { time, weights: {} };

    const profileScale = visemeWeights?.[viseme] ?? CC4_DEFAULT_WEIGHT;
    const effective = weight * profileScale;

    const weights = {};
    for (const [key, multiplier] of Object.entries(baseShapes)) {
      const value = effective * multiplier;
      if (value > 0.001) weights[key] = Math.min(1.0, value);
    }
    return { time, weights };
  });
}

/**
 * Build an ARKit 52 playAudio payload from the existing TTS segment format.
 * This is the entry point called by AvatarUnity / UnityAvatarBridge in Phase 5.
 *
 * @param {{ audio: string, visemeTimeline: Object|null, text: string, emotion: string }} segment
 * @param {Object|null} visemeWeights - per-profile weight scalars (pass null for CC4 profiles)
 * @returns {{ audio: string, blendshapes: Array, emotion: string, text: string }}
 */
export function segmentToArkitPayload(segment, visemeWeights) {
  const { audio, visemeTimeline, text, emotion } = segment;
  return {
    audio,
    blendshapes: visemeTimelineToArkit(visemeTimeline, visemeWeights),
    emotion: emotion ?? 'neutral',
    text,
  };
}
