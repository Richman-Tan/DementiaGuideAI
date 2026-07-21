/**
 * ARPAbet phoneme → internal 14-key viseme mapping, plus per-phone-class
 * duration weights used to distribute a word's phonemes across its
 * ElevenLabs word span (char timestamps are reliable at word granularity;
 * individual letters within a word are not phones, so their per-char times
 * are meaningless once we know the real phoneme sequence).
 */

export const PHONE_TO_VISEME = {
  AA: 'aa', AE: 'aa', AH: 'aa', AO: 'aa', AW: 'aa', AY: 'aa',
  EH: 'ih', IH: 'ih',
  EY: 'ee', IY: 'ee', Y: 'ee',
  OW: 'oh', OY: 'oh',
  UH: 'ou', UW: 'ou', W: 'ou',
  ER: 'v_rr', R: 'v_rr',
  L: 'v_dd', T: 'v_dd', D: 'v_dd', N: 'v_dd',
  K: 'v_kk', G: 'v_kk', NG: 'v_kk',
  CH: 'v_ch', JH: 'v_ch', SH: 'v_ch', ZH: 'v_ch',
  S: 'v_ss', Z: 'v_ss',
  TH: 'v_th', DH: 'v_th',
  F: 'v_ff', V: 'v_ff',
  P: 'v_pp', B: 'v_pp', M: 'v_pp',
  HH: 'neutral',
};

// Relative duration of each phone within a word (vowels dominate the span,
// stops are brief). Absolute time comes from normalising these against the
// word's measured span, so only the ratios matter.
const DURATION_BY_CLASS = [
  [/^(AA|AE|AH|AO|EH|IH|IY|UH|UW|ER)$/, 1.4],  // monophthong vowels
  [/^(AW|AY|EY|OW|OY)$/,                1.8],  // diphthongs
  [/^(P|B|T|D|K|G)$/,                   0.7],  // stops
  [/^(M|N|NG)$/,                        0.9],  // nasals
  [/^(F|V|S|Z|TH|DH|SH|ZH|HH)$/,        1.1],  // fricatives
  [/^(CH|JH)$/,                         1.1],  // affricates
  [/^(W|Y|R|L)$/,                       1.0],  // glides/liquids
];

export function phoneDurationWeight(phone) {
  for (const [re, w] of DURATION_BY_CLASS)
    if (re.test(phone)) return w;
  return 1.0;
}

// Per-phone articulation intensity overrides, mirroring CHAR_WEIGHT_OVERRIDE
// in phonemeMap.js (values are absolute weights on the AvatarSDK baseline —
// callers scale them by the profile's digraphScale like the char path does).
// /m/ is a soft closure, /p/ a hard plosive; the difference reads on the lips.
export const PHONE_WEIGHT_OVERRIDE = {
  M: 0.55,
  B: 0.72,
  P: 0.78,
};
