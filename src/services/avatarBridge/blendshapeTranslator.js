/**
 * blendshapeTranslator
 *
 * Converts the 14-key internal viseme timeline (from Azure/ElevenLabs TTS)
 * to CC4-specific blendshape weights for Reallusion CC4/CC5 characters in Unity.
 * This module runs in the RN JS thread — not inside a WebView.
 *
 * Input  (from ttsService):
 *   { frames: [{ time, viseme, duration, weight }], totalDuration }
 *
 * Output (for AvatarUnity / Unity UaaL — CC4AudioPayload.blendshapes):
 *   [{ time, weights: { [cc4_shape]: 0.0–1.0 } }]
 *
 * ── Reallusion CC4 viseme system ──────────────────────────────────────────────
 * CC4 uses an "8+7 phoneme pair" lip-sync system. When a CC4 character is
 * exported from Character Creator 4 as FBX and imported into Unity via the
 * Reallusion Auto Setup plugin, its SkinnedMeshRenderer (CC_Base_Body) includes
 * blendshapes for each viseme posture.
 *
 * This translator drives only the symmetric blendshapes that were verified
 * against blendshapes_dump.txt (397 shapes, 17 renderers on HD_Aaron):
 *
 *   V_Lip_Open     — baseline lip-gap shape used as an additive layer
 *   V_Open         — wide-jaw open vowel posture (aa, oh)
 *   V_Wide         — horizontal lip stretch (ih, eh — "smile" vowels)
 *   V_Tight        — narrow near-closed lips (ee, ss)
 *   V_Tight_O      — rounded protrusion (oo, rr)
 *   V_Explosive    — bilabial closure for stops (p/b/m)
 *   V_Dental_Lip   — upper teeth on lower lip (f/v)
 *   V_Affricate    — rounded palatal posture (ch/sh/j)
 *   Mouth_Lips_Pull_DL/DR — lower quadrant lip pulls (symmetric pair)
 *   Mouth_Lips_Pull_UL/UR — upper quadrant lip pulls (symmetric pair)
 *   Mouth_Lips_Press_L/R  — bilabial press closing force (symmetric pair)
 *   jaw_drive      — NOT a blendshape; drives the CC_Base_JawRoot bone rotation
 *                    via AvatarController.SetTargetWeights() in Unity
 */

// CC4 HD_Aaron blendshape map for 14-viseme lip sync.
// Verified against blendshapes_dump.txt (397 shapes, 17 renderers).
//
// Shape strategy — only symmetric shapes are used:
//   jaw_drive          → AvatarController bone rotation (CC_Base_JawRoot), NOT a blendshape
//   V_Lip_Open         → symmetric CC4 lip-separation shape
//   V_Open/Wide/Tight… → symmetric CC4 phoneme posture shapes
//   Mouth_Lips_Pull_DL/DR → quadrant lower-lip pulls (DL+DR equal = symmetric)
//   Mouth_Lips_Pull_UL/UR → quadrant upper-lip pulls (UL+UR equal = symmetric)
//   Mouth_Lips_Press_L/R  → bilabial close (both sides deform together)
//
// Shapes EXCLUDED (broken on this FBX export):
//   Jaw_Open blendshape       — confirmed asymmetric mesh deformation
//   Mouth_LowerLip_Depress_R  — zero vertex deformations (L works, R broken)
//   Mouth_UpperLip_Raise_R    — same issue
const VISEME_TO_CC4 = {
  // "ah" — widest open vowel
  aa: {
    jaw_drive:            1.00,
    V_Lip_Open:           0.90,
    V_Open:               0.80,
    Mouth_Lips_Pull_DL:   0.45,
    Mouth_Lips_Pull_DR:   0.45,
    Mouth_Lips_Pull_UL:   0.30,
    Mouth_Lips_Pull_UR:   0.30,
  },
  // "ih" — mid-open, wide corners
  ih: {
    jaw_drive:            0.45,
    V_Lip_Open:           0.42,
    V_Wide:               0.90,
    Mouth_Lips_Pull_DL:   0.22,
    Mouth_Lips_Pull_DR:   0.22,
  },
  // "oo" — rounded, small opening
  ou: {
    jaw_drive:            0.25,
    V_Lip_Open:           0.22,
    V_Tight_O:            1.00,
  },
  // "ee" — wide smile, small jaw
  ee: {
    jaw_drive:            0.18,
    V_Lip_Open:           0.18,
    V_Tight:              0.90,
  },
  // "oh" — rounded open
  oh: {
    jaw_drive:            0.70,
    V_Lip_Open:           0.65,
    V_Open:               0.58,
    Mouth_Lips_Pull_DL:   0.35,
    Mouth_Lips_Pull_DR:   0.35,
    Mouth_Lips_Pull_UL:   0.22,
    Mouth_Lips_Pull_UR:   0.22,
  },
  // Bilabial stop (p, b, m) — lips press together
  v_pp: {
    V_Explosive:          1.00,
    Mouth_Lips_Press_L:   0.40,
    Mouth_Lips_Press_R:   0.40,
  },
  // Labiodental (f, v) — upper teeth on lower lip
  v_ff: {
    V_Dental_Lip:         1.00,
    jaw_drive:            0.08,
  },
  // Dental (th) — tongue near teeth, slight opening
  v_th: {
    jaw_drive:            0.12,
    V_Lip_Open:           0.12,
    V_Open:               0.15,
  },
  // Alveolar (d, t, n, l) — tongue on ridge
  v_dd: {
    jaw_drive:            0.22,
    V_Lip_Open:           0.20,
    V_Open:               0.28,
    Mouth_Lips_Pull_DL:   0.14,
    Mouth_Lips_Pull_DR:   0.14,
  },
  // Velar (k, g) — back tongue, moderate opening
  v_kk: {
    jaw_drive:            0.32,
    V_Lip_Open:           0.28,
    V_Open:               0.22,
    Mouth_Lips_Pull_DL:   0.18,
    Mouth_Lips_Pull_DR:   0.18,
  },
  // Affricate (ch, sh, j, zh) — lips rounded
  v_ch: {
    V_Affricate:          0.90,
    jaw_drive:            0.15,
    V_Lip_Open:           0.12,
  },
  // Sibilant (s, z) — narrow, teeth close
  v_ss: {
    V_Tight:              0.35,
    jaw_drive:            0.08,
  },
  // Nasal (n, ng) — near-closed
  v_nn: {
    Mouth_Lips_Press_L:   0.25,
    Mouth_Lips_Press_R:   0.25,
    jaw_drive:            0.04,
  },
  // Rhotic (r) — rounded, slight opening
  v_rr: {
    V_Tight_O:            0.48,
    jaw_drive:            0.16,
    V_Lip_Open:           0.16,
  },
  // Silence — all shapes at zero (mouth closed)
  neutral: {},
};

// Global scale applied to all viseme weights for CC4 HD characters.
// HD characters have full-range blendshapes so no reduction needed.
const CC4_DEFAULT_WEIGHT = 1.0;

/**
 * Convert a 14-viseme timeline to a CC4 blendshape timeline.
 *
 * @param {{ frames: Array, totalDuration: number }} visemeTimeline
 * @param {Object|null} visemeWeights  Per-profile weight scalars (14 keys). Pass null
 *                                     for CC4 profiles to use CC4_DEFAULT_WEIGHT.
 * @returns {Array<{ time: number, weights: Object }>}
 */
export function visemeTimelineToCC4(visemeTimeline, visemeWeights) {
  if (!visemeTimeline?.frames?.length) return [];

  return visemeTimeline.frames.map(frame => {
    const { time, viseme, weight } = frame;
    const baseShapes = VISEME_TO_CC4[viseme];
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
 * Build a CC4AudioPayload from the existing TTS segment format.
 * This is the entry point called by AvatarUnity / UnityAvatarBridge in Phase 5.
 *
 * @param {{ audio: string, visemeTimeline: Object|null, text: string, emotion: string }} segment
 * @param {Object|null} visemeWeights - per-profile weight scalars (pass null for CC4 profiles)
 * @returns {{ audio: string, blendshapes: Array, emotion: string, text: string }}
 */
export function segmentToCC4Payload(segment, visemeWeights) {
  const { audio, visemeTimeline, text, emotion } = segment;
  return {
    audio,
    blendshapes: visemeTimelineToCC4(visemeTimeline, visemeWeights),
    emotion: emotion ?? 'neutral',
    text,
  };
}
