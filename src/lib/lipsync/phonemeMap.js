// Maps individual characters (from ElevenLabs character-level alignment) to VRM viseme names.
// Bilabial stops (m, b, p) map to 'neutral' because those sounds require a closed mouth.
// All other consonants fall through to DEFAULT_CONSONANT_VISEME at reduced weight.
export const CHAR_TO_VISEME = {
  // Open vowels → aa
  'a': 'aa', 'A': 'aa',

  // High front vowels → ih  (short-i, y-glide)
  'i': 'ih', 'I': 'ih', 'y': 'ih', 'Y': 'ih',

  // High back / round vowels → ou
  'u': 'ou', 'U': 'ou', 'w': 'ou', 'W': 'ou',

  // Mid back vowel → oh
  'o': 'oh', 'O': 'oh',

  // Mid front vowel → ee
  'e': 'ee', 'E': 'ee',

  // Bilabial stops + nasal → neutral (closed mouth)
  'm': 'neutral', 'M': 'neutral',
  'b': 'neutral', 'B': 'neutral',
  'p': 'neutral', 'P': 'neutral',
};

// Peak blend shape weight per viseme (0–1).
// Open vowels get full weight; partially-open vowels slightly less.
export const VISEME_WEIGHT = {
  aa: 0.90,
  ih: 0.80,
  ou: 0.80,
  ee: 0.80,
  oh: 0.85,
  neutral: 0.0,
};

// Fallback for consonants not in CHAR_TO_VISEME (generic mouth activity).
export const DEFAULT_CONSONANT_VISEME = 'aa';
export const DEFAULT_CONSONANT_WEIGHT = 0.30;
