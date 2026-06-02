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
  'm': 'neutral', 'M': 'neutral', // nasal — lips always together, no burst
  'b': 'v_pp',    'B': 'v_pp',   // voiced bilabial stop
  'p': 'v_pp',    'P': 'v_pp',   // voiceless bilabial stop

  // ── Labiodentals ──────────────────────────────────────────────────────────
  'f': 'v_ff', 'F': 'v_ff',
  'v': 'v_ff', 'V': 'v_ff',

  // ── Alveolars ─────────────────────────────────────────────────────────────
  'd': 'v_dd', 'D': 'v_dd',
  't': 'v_dd', 'T': 'v_dd',
  'n': 'v_nn', 'N': 'v_nn',
  's': 'v_ss', 'S': 'v_ss',
  'z': 'v_ss', 'Z': 'v_ss',
  'l': 'v_nn', 'L': 'v_nn',     // lateral alveolar — same articulator region as n

  // ── Velars ────────────────────────────────────────────────────────────────
  'k': 'v_kk', 'K': 'v_kk',
  'g': 'v_kk', 'G': 'v_kk',
  'c': 'v_kk', 'C': 'v_kk',     // default hard c; soft c (city) handled by digraph
  'q': 'v_kk', 'Q': 'v_kk',     // qu = kw
  'x': 'v_kk', 'X': 'v_kk',     // ks

  // ── Rhotic ────────────────────────────────────────────────────────────────
  'r': 'v_rr', 'R': 'v_rr',

  // ── Affricates ────────────────────────────────────────────────────────────
  'j': 'v_ch', 'J': 'v_ch',     // "joy" — dʒ affricate, same shape as CH
};

// Peak weight per internal viseme key (0–1).
export const VISEME_WEIGHT = {
  aa: 0.90,
  ih: 0.75,
  ou: 0.80,
  ee: 0.78,
  oh: 0.82,
  // Consonant viseme weights — generally lower than vowels
  v_pp: 0.78,
  v_ff: 0.65,
  v_th: 0.68,
  v_dd: 0.72,
  v_kk: 0.72,
  v_ch: 0.72,
  v_ss: 0.65,
  v_nn: 0.65,
  v_rr: 0.70,
  neutral: 0.0,
};

// Fallback for unrecognised characters (h, unhandled punctuation, etc.).
export const DEFAULT_CONSONANT_VISEME = 'v_dd';
export const DEFAULT_CONSONANT_WEIGHT = 0.30;
