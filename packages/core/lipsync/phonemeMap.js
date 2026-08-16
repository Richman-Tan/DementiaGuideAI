// Maps individual characters to internal viseme keys.
// Vowels drive mouth-open shapes; each consonant class maps to its specific
// articulator shape so all 14 model visemes get used.
export const CHAR_TO_VISEME = {
  // ── Vowels ────────────────────────────────────────────────────────────────
  'a': 'aa', 'A': 'aa',          // "cat", "father"
  'i': 'ih', 'I': 'ih',          // "bit", "sit"
  'y': 'ih', 'Y': 'ih',          // "yes" (palatal glide)
  'u': 'ou', 'U': 'ou',          // "put", "use"
  'w': 'ou', 'W': 'ou',          // "we" (labial-velar glide)
  'o': 'oh', 'O': 'oh',          // "go", "no"
  'e': 'ee', 'E': 'ee',          // "see", "be"

  // ── Bilabials ─────────────────────────────────────────────────────────────
  'm': 'v_pp', 'M': 'v_pp',      // nasal — lips close visibly (lower weight via CHAR_WEIGHT_OVERRIDE)
  'b': 'v_pp', 'B': 'v_pp',      // voiced bilabial stop
  'p': 'v_pp', 'P': 'v_pp',      // voiceless bilabial stop

  // ── Labiodentals ──────────────────────────────────────────────────────────
  'f': 'v_ff', 'F': 'v_ff',
  'v': 'v_ff', 'V': 'v_ff',

  // ── Alveolars ─────────────────────────────────────────────────────────────
  'd': 'v_dd', 'D': 'v_dd',
  't': 'v_dd', 'T': 'v_dd',
  'n': 'v_nn', 'N': 'v_nn',
  's': 'v_ss', 'S': 'v_ss',
  'z': 'v_ss', 'Z': 'v_ss',
  'l': 'v_nn', 'L': 'v_nn',      // lateral alveolar — same articulator region as n

  // ── Velars ────────────────────────────────────────────────────────────────
  'k': 'v_kk', 'K': 'v_kk',
  'g': 'v_kk', 'G': 'v_kk',      // default hard-g; soft-g (gentle) handled by digraph
  'c': 'v_kk', 'C': 'v_kk',      // default hard-c; soft-c (city) handled by digraph
  'q': 'v_kk', 'Q': 'v_kk',      // qu = kw
  'x': 'v_kk', 'X': 'v_kk',      // ks

  // ── Rhotic ────────────────────────────────────────────────────────────────
  'r': 'v_rr', 'R': 'v_rr',

  // ── Affricates ────────────────────────────────────────────────────────────
  'j': 'v_ch', 'J': 'v_ch',      // "joy" — dʒ affricate, same shape as CH

  // ── Aspiration (nearly invisible articulation) ────────────────────────────
  'h': 'neutral', 'H': 'neutral', // pure aspiration — no visible lip/jaw movement
};

// Peak weight per internal viseme key (0–1).
// Vowel weights are kept moderate — AvatarSDK morph targets reach extreme
// articulation well before 1.0, so 0.65–0.70 is the natural-looking ceiling.
export const VISEME_WEIGHT = {
  aa: 0.68,   // open vowel — 0.90 caused full tongue protrusion on AvatarSDK
  ih: 0.60,   // front vowel — narrow, minimal jaw
  ou: 0.65,   // rounded vowel
  ee: 0.62,   // high front vowel — wide stretch, near-closed jaw
  oh: 0.65,   // open-mid back vowel
  // Consonant viseme weights — slightly reduced to match vowel rebalancing
  v_pp: 0.70, // bilabial closure — kept higher for visible lip contact
  v_ff: 0.58,
  v_th: 0.60,
  v_dd: 0.62,
  v_kk: 0.62,
  v_ch: 0.62,
  v_ss: 0.58,
  v_nn: 0.55,
  v_rr: 0.60,
  neutral: 0.0,
};

// Per-character weight overrides — applied instead of VISEME_WEIGHT[viseme] when present.
// Useful when the same viseme key is used for sounds with different visible intensity.
export const CHAR_WEIGHT_OVERRIDE = {
  'm': 0.55, 'M': 0.55,  // bilabial nasal — lip closure visible but softer than stop
  'b': 0.72, 'B': 0.72,  // voiced stop — fuller closure than nasal
  'p': 0.78, 'P': 0.78,  // voiceless stop — hardest bilabial contact
};

// Fallback for unrecognised alphabetic characters.
// Non-alphabetic characters (punctuation, digits) are neutralised upstream in createVisemeTimeline.
export const DEFAULT_CONSONANT_VISEME = 'v_dd';
export const DEFAULT_CONSONANT_WEIGHT = 0.30;
