import {
  CHAR_TO_VISEME,
  VISEME_WEIGHT,
  DEFAULT_CONSONANT_VISEME,
  DEFAULT_CONSONANT_WEIGHT,
} from './phonemeMap';

// ── Digraph table ─────────────────────────────────────────────────────────────
// Common English letter-pair patterns and their best-fit viseme.
// A matched pair consumes both characters and emits a single frame that spans
// both timestamps — more accurate than two separate single-character guesses.
// Matched case-insensitively.
const DIGRAPH_VISEME = {
  // Vowel digraphs
  'oo': { viseme: 'ou',      weight: 0.88 },  // "food", "book"
  'ee': { viseme: 'ee',      weight: 0.85 },  // "see", "feet"
  'ea': { viseme: 'ee',      weight: 0.78 },  // "beach", "read"
  'ai': { viseme: 'aa',      weight: 0.78 },  // "rain", "paid"
  'ay': { viseme: 'aa',      weight: 0.78 },  // "day", "play"
  'oa': { viseme: 'oh',      weight: 0.82 },  // "boat", "road"
  'ou': { viseme: 'ou',      weight: 0.82 },  // "out", "found"
  'ow': { viseme: 'aa',      weight: 0.78 },  // "how", "now"
  'oi': { viseme: 'oh',      weight: 0.75 },  // "oil", "coin"
  'oy': { viseme: 'oh',      weight: 0.75 },  // "boy", "toy"
  'au': { viseme: 'aa',      weight: 0.82 },  // "caught", "audio"
  'aw': { viseme: 'aa',      weight: 0.82 },  // "law", "saw"
  'ie': { viseme: 'ee',      weight: 0.75 },  // "piece", "brief"
  'ey': { viseme: 'ee',      weight: 0.72 },  // "key", "money"
  'ue': { viseme: 'ou',      weight: 0.78 },  // "blue", "clue"

  // Consonant digraphs — mapped to specific articulator visemes
  'th': { viseme: 'v_th', weight: 0.68 },  // "the", "think" — dental fricative
  'sh': { viseme: 'v_ch', weight: 0.68 },  // "she" — palato-alveolar, same shape as CH
  'ch': { viseme: 'v_ch', weight: 0.72 },  // "chair", "check"
  'wh': { viseme: 'ou',   weight: 0.28 },  // "where" — rounded lips
  'ph': { viseme: 'v_ff', weight: 0.65 },  // "phone" — labiodental like 'f'
  'ng': { viseme: 'v_nn', weight: 0.65 },  // "sing" — nasal
  'ck': { viseme: 'v_kk', weight: 0.65 },  // "back" — velar stop
  'gh': { viseme: 'neutral', weight: 0  },  // "night" — often silent
  'kn': { viseme: 'neutral', weight: 0  },  // "know" — k silent
  'qu': { viseme: 'v_kk', weight: 0.65 },  // "queen" — kw, velar
};

// Gap threshold below which two adjacent same-viseme frames are merged (seconds).
const MERGE_GAP_THRESHOLD = 0.02;

/**
 * Converts ElevenLabs character-level alignment into a VisemeTimeline the
 * WebView LipSyncController can consume.
 *
 * @param {object} alignment
 *   alignment.characters                     - string[]
 *   alignment.character_start_times_seconds  - number[]
 *   alignment.character_end_times_seconds    - number[]
 *
 * @returns {{ frames: VisemeFrame[], totalDuration: number }}
 *   VisemeFrame: { time, viseme, duration, weight }
 */
export function createVisemeTimeline(alignment) {
  const { characters, character_start_times_seconds, character_end_times_seconds } = alignment;

  if (!characters || !characters.length) {
    return { frames: [], totalDuration: 0 };
  }

  const rawFrames = [];
  let i = 0;

  while (i < characters.length) {
    const char  = characters[i];
    const start = character_start_times_seconds[i];
    const end   = character_end_times_seconds[i];

    // ── Whitespace → silence ─────────────────────────────────────────────────
    if (char === ' ' || char === '\n' || char === '\r' || char === '\t') {
      rawFrames.push({ time: start, viseme: 'neutral', duration: Math.max(end - start, 0.001), weight: 0 });
      i++;
      continue;
    }

    // ── Digraph look-ahead ───────────────────────────────────────────────────
    // Only attempt when the next character is also a letter (no space between).
    if (i + 1 < characters.length) {
      const char2 = characters[i + 1];
      const isLetter2 = /[a-zA-Z]/.test(char2);
      if (isLetter2) {
        const digraph = (char + char2).toLowerCase();
        const entry   = DIGRAPH_VISEME[digraph];
        if (entry) {
          const end2     = character_end_times_seconds[i + 1];
          const duration = Math.max(end2 - start, 0.001);
          if (entry.viseme === 'neutral') {
            rawFrames.push({ time: start, viseme: 'neutral', duration, weight: 0 });
          } else {
            rawFrames.push({ time: start, viseme: entry.viseme, duration, weight: entry.weight });
          }
          i += 2;
          continue;
        }
      }
    }

    // ── Single-character lookup ──────────────────────────────────────────────
    const duration = Math.max(end - start, 0.001);
    const viseme   = CHAR_TO_VISEME[char];

    if (viseme === 'neutral') {
      rawFrames.push({ time: start, viseme: 'neutral', duration, weight: 0 });
    } else if (viseme) {
      rawFrames.push({ time: start, viseme, duration, weight: VISEME_WEIGHT[viseme] });
    } else {
      // Generic consonant — tiny jaw activity so avatar doesn't look frozen
      rawFrames.push({ time: start, viseme: DEFAULT_CONSONANT_VISEME, duration, weight: DEFAULT_CONSONANT_WEIGHT });
    }

    i++;
  }

  const frames        = mergeConsecutiveSameViseme(rawFrames);
  const totalDuration = character_end_times_seconds[characters.length - 1] || 0;

  return { frames, totalDuration };
}

/**
 * Collapses adjacent frames that share the same viseme and whose gap is below
 * MERGE_GAP_THRESHOLD into a single longer frame. Prevents micro-jitter on
 * long vowel runs (e.g. "aaa" from three consecutive 'a' characters).
 */
function mergeConsecutiveSameViseme(frames) {
  if (!frames.length) return frames;

  const merged = [{ ...frames[0] }];

  for (let i = 1; i < frames.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = frames[i];
    const gap  = curr.time - (prev.time + prev.duration);

    if (prev.viseme === curr.viseme && gap < MERGE_GAP_THRESHOLD) {
      prev.duration = curr.time + curr.duration - prev.time;
      prev.weight   = Math.max(prev.weight, curr.weight);
    } else {
      merged.push({ ...curr });
    }
  }

  return merged;
}
