// Azure TTS viseme IDs 0-21 → internal viseme keys used by the avatar.
// Unlike ElevenLabs character alignment, these are actual phoneme groups —
// no heuristic mapping needed.
export const AZURE_VISEME_TO_KEY = {
  0:  'neutral',  // silence
  1:  'aa',       // æ, ə, ʌ   — cat, about, cut
  2:  'aa',       // ɑ          — father, palm
  3:  'oh',       // ɔ          — law, caught
  4:  'ee',       // e, ɛ, ʊ   — say, bed, book
  5:  'v_rr',     // ɝ          — bird, hurt
  6:  'ih',       // j, i, ɪ   — yes, see, bit
  7:  'ou',       // w, u       — we, too
  8:  'oh',       // o          — go, show
  9:  'aa',       // aʊ diphthong — how, out (starts open)
  10: 'oh',       // ɔɪ diphthong — boy, coin (starts rounded)
  11: 'aa',       // aɪ diphthong — my, kite (starts open)
  12: 'neutral',  // h           — aspiration, no visible articulation
  13: 'v_rr',     // ɹ           — red, right
  14: 'v_nn',     // l           — lip, feel
  15: 'v_ss',     // s, z        — see, zoo
  16: 'v_ch',     // ʃ,tʃ,ʒ,dʒ — she, chair, vision, joy
  17: 'v_th',     // θ, ð        — think, the
  18: 'v_ff',     // f, v        — fan, van
  19: 'v_dd',     // d, t, n     — dog, top, no
  20: 'v_kk',     // k, g, ŋ    — cat, go, sing
  21: 'v_pp',     // p, b, m     — pop, bob, mom
};

// Default weights matching the AvatarSDK (aria_sdk) profile baseline.
// Per-avatar overrides are passed in at call time via visemeWeights.
export const AZURE_DEFAULT_WEIGHTS = {
  aa: 0.72, ih: 0.60, ou: 0.72, ee: 0.62, oh: 0.65,
  v_pp: 0.70, v_ff: 0.58, v_th: 0.60, v_dd: 0.62,
  v_kk: 0.62, v_ch: 0.62, v_ss: 0.58, v_nn: 0.55, v_rr: 0.60,
  neutral: 0.0,
};
