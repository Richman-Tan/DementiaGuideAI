import {
  CHAR_TO_VISEME,
  VISEME_WEIGHT,
  CHAR_WEIGHT_OVERRIDE,
  DEFAULT_CONSONANT_VISEME,
  DEFAULT_CONSONANT_WEIGHT,
} from './phonemeMap';
import { wordToPhonemes } from './g2p/g2p';
import {
  PHONE_TO_VISEME,
  PHONE_WEIGHT_OVERRIDE,
  phoneDurationWeight,
} from './g2p/arpabetToViseme';

// ── Digraph table ─────────────────────────────────────────────────────────────
// Common English letter-pair patterns and their best-fit viseme.
// A matched pair consumes both characters and emits a single frame that spans
// both timestamps — more accurate than two separate single-character guesses.
// Matched case-insensitively.
const DIGRAPH_VISEME = {
  // Vowel digraphs — weights scaled to match reduced VISEME_WEIGHT table
  'oo': { viseme: 'ou',      weight: 0.70 },  // "food", "book"
  'ee': { viseme: 'ee',      weight: 0.66 },  // "see", "feet"
  'ea': { viseme: 'ee',      weight: 0.62 },  // "beach", "read"
  'ai': { viseme: 'aa',      weight: 0.62 },  // "rain", "paid"
  'ay': { viseme: 'aa',      weight: 0.62 },  // "day", "play"
  'oa': { viseme: 'oh',      weight: 0.65 },  // "boat", "road"
  'ou': { viseme: 'ou',      weight: 0.65 },  // "out", "found"
  'ow': { viseme: 'aa',      weight: 0.62 },  // "how", "now"
  'oi': { viseme: 'oh',      weight: 0.62 },  // "oil", "coin"
  'oy': { viseme: 'oh',      weight: 0.62 },  // "boy", "toy"
  'au': { viseme: 'aa',      weight: 0.65 },  // "caught", "audio"
  'aw': { viseme: 'aa',      weight: 0.65 },  // "law", "saw"
  'ie': { viseme: 'ee',      weight: 0.60 },  // "piece", "brief"
  'ey': { viseme: 'ee',      weight: 0.58 },  // "key", "money"
  'ue': { viseme: 'ou',      weight: 0.62 },  // "blue", "clue"

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
  // Soft-c context — /s/ sound when c precedes e/i/y
  'ce': { viseme: 'v_ss', weight: 0.65 },  // "face", "cent"
  'ci': { viseme: 'v_ss', weight: 0.65 },  // "city", "circle"
  'cy': { viseme: 'v_ss', weight: 0.65 },  // "cycle"
  // Soft-g context — /dʒ/ sound when g precedes e/i/y
  'ge': { viseme: 'v_ch', weight: 0.68 },  // "gentle", "age"
  'gi': { viseme: 'v_ch', weight: 0.68 },  // "giant", "gin"
  'gy': { viseme: 'v_ch', weight: 0.68 },  // "gym", "gyrate"
};

// Gap threshold below which two adjacent same-viseme frames are merged (seconds).
const MERGE_GAP_THRESHOLD = 0.03;

// English function words are typically unstressed — reduced vowel (schwa) in natural speech.
// Their viseme weights are scaled down so the mouth moves less on articles, prepositions, etc.
const FUNCTION_WORDS = new Set([
  'a','an','the',
  'and','or','but','nor','so','yet','for',
  'in','on','at','to','of','by','as','up','out','off','with','from','into','about',
  'is','are','was','were','be','been','being','am',
  'have','has','had','do','does','did',
  'will','would','could','should','may','might','shall','can','must',
  'i','me','my','we','our','us','you','your','he','him','his','she','her','it','its',
  'they','them','their','this','that','these','those',
  'not','no',
  'if','than','though','when','where','which','who','whom','what',
]);

const FUNCTION_WORD_SCALE = 0.68; // unstressed words get 68% of normal peak weight

/**
 * Pre-scan character array and return a Float32Array of per-character weight multipliers.
 * Function words get FUNCTION_WORD_SCALE; content words get 1.0.
 */
function buildWordScales(characters) {
  const scales = new Float32Array(characters.length).fill(1.0);
  let wordStart = -1;
  let wordText  = '';
  for (let i = 0; i <= characters.length; i++) {
    const ch = i < characters.length ? characters[i] : null;
    if (ch && /[a-zA-Z]/.test(ch)) {
      if (wordStart < 0) wordStart = i;
      wordText += ch.toLowerCase();
    } else if (wordStart >= 0) {
      const scale = FUNCTION_WORDS.has(wordText) ? FUNCTION_WORD_SCALE : 1.0;
      for (let j = wordStart; j < i; j++) scales[j] = scale;
      wordStart = -1;
      wordText  = '';
    }
  }
  return scales;
}

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
/**
 * @param {object} alignment  - ElevenLabs character-level alignment
 * @param {object} [options]
 * @param {object} [options.visemeWeights] - Per-avatar weight overrides (from avatarProfiles.js).
 *   When provided, these replace VISEME_WEIGHT from phonemeMap.js so each model can be tuned
 *   independently. Digraph weights are scaled proportionally via the aa weight ratio.
 * @param {boolean} [options.streaming] - True when this alignment is a PARTIAL chunk of an
 *   ongoing stream: skips applyFinalLowering (which would droop the mouth mid-sentence —
 *   the stream's true end is handled by the player when the timeline runs out).
 */
export function createVisemeTimeline(alignment, options = {}) {
  const { characters, character_start_times_seconds, character_end_times_seconds } = alignment;

  if (!characters || !characters.length) {
    return { frames: [], totalDuration: 0 };
  }

  // Resolve which weight table to use for this render.
  // Digraph weights are absolute values tuned to the AvatarSDK baseline (aa=0.68).
  // Scale them proportionally when a different profile's aa weight is used.
  const resolvedWeights = options.visemeWeights || VISEME_WEIGHT;
  const digraphScale    = resolvedWeights.aa / VISEME_WEIGHT.aa; // 1.0 for SDK, ~1.25 for RPM

  // Pre-compute per-character word stress scale (1.0 = content word, 0.68 = function word).
  const wordScales = buildWordScales(characters);

  // G2P pre-pass: for every word found in the pronunciation lexicon, build real
  // phoneme frames distributed across the word's time span. English spelling is
  // a poor proxy for phonetics ("one" → /w/, silent letters, soft/hard c/g), so
  // the char/digraph heuristics below only run for out-of-vocabulary words.
  const g2pFrames = buildG2PWordFrames(
    characters, character_start_times_seconds, character_end_times_seconds,
    resolvedWeights, digraphScale);

  const rawFrames = [];
  let i = 0;

  while (i < characters.length) {
    const g2p = g2pFrames.get(i);
    if (g2p) {
      rawFrames.push(...g2p.frames);
      i = g2p.nextIndex;
      continue;
    }

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
            rawFrames.push({ time: start, viseme: entry.viseme, duration, weight: entry.weight * digraphScale * wordScales[i] });
          }
          i += 2;
          continue;
        }
      }
    }

    // ── Single-character lookup ──────────────────────────────────────────────
    const duration = Math.max(end - start, 0.001);

    // Neutralise punctuation, digits, and any non-letter character so they don't
    // produce spurious jaw movement via the DEFAULT_CONSONANT_VISEME fallback.
    if (!/[a-zA-Z]/.test(char)) {
      rawFrames.push({ time: start, viseme: 'neutral', duration, weight: 0 });
      i++;
      continue;
    }

    const viseme = CHAR_TO_VISEME[char];

    if (viseme === 'neutral') {
      rawFrames.push({ time: start, viseme: 'neutral', duration, weight: 0 });
    } else if (viseme) {
      // CHAR_WEIGHT_OVERRIDE takes priority; otherwise use the resolved (profile-specific) table.
      // Multiply by the word's stress scale so function words articulate less than content words.
      const baseWeight = CHAR_WEIGHT_OVERRIDE[char] !== undefined
        ? CHAR_WEIGHT_OVERRIDE[char] * digraphScale // scale overrides too so bilabials stay proportional
        : resolvedWeights[viseme] ?? VISEME_WEIGHT[viseme];
      rawFrames.push({ time: start, viseme, duration, weight: baseWeight * wordScales[i] });
    } else {
      // Generic alphabetic consonant — tiny jaw activity so avatar doesn't look frozen
      rawFrames.push({ time: start, viseme: DEFAULT_CONSONANT_VISEME, duration, weight: DEFAULT_CONSONANT_WEIGHT * digraphScale * wordScales[i] });
    }

    i++;
  }

  const totalDuration = character_end_times_seconds[characters.length - 1] || 0;
  const merged        = mergeConsecutiveSameViseme(rawFrames);
  const frames        = options.streaming ? merged : applyFinalLowering(merged, totalDuration);

  return { frames, totalDuration };
}

/**
 * Scans the character array for words, looks each up in the G2P lexicon, and
 * returns a Map of wordStartIndex → { nextIndex, frames } for every word with a
 * known pronunciation. The main loop consumes these instead of char heuristics.
 *
 * Timing model: a word's span runs from its first char's start time to its last
 * char's end time (ElevenLabs char timestamps are reliable at word granularity);
 * phonemes are distributed across that span proportionally to per-class nominal
 * durations (vowels long, stops short — see arpabetToViseme.js).
 */
function buildG2PWordFrames(characters, startTimes, endTimes, resolvedWeights, digraphScale) {
  const result = new Map();
  let wordStart = -1;
  let wordText  = '';

  for (let i = 0; i <= characters.length; i++) {
    const ch = i < characters.length ? characters[i] : null;
    if (ch && /[a-zA-Z']/.test(ch)) {
      if (wordStart < 0) wordStart = i;
      wordText += ch;
    } else if (wordStart >= 0) {
      const phones = wordToPhonemes(wordText);
      const span   = endTimes[i - 1] - startTimes[wordStart];
      if (phones && span > 0.005) {
        const scale = FUNCTION_WORDS.has(wordText.toLowerCase()) ? FUNCTION_WORD_SCALE : 1.0;
        result.set(wordStart, {
          nextIndex: i,
          frames: phonesToFrames(phones, startTimes[wordStart], span, scale, resolvedWeights, digraphScale),
        });
      }
      wordStart = -1;
      wordText  = '';
    }
  }
  return result;
}

function phonesToFrames(phones, wordStartTime, span, wordScale, resolvedWeights, digraphScale) {
  const durWeights = phones.map(phoneDurationWeight);
  const total      = durWeights.reduce((a, b) => a + b, 0);

  const frames = [];
  let t = wordStartTime;
  for (let k = 0; k < phones.length; k++) {
    const duration = span * (durWeights[k] / total);
    const phone    = phones[k];
    const viseme   = PHONE_TO_VISEME[phone];

    if (!viseme || viseme === 'neutral') {
      frames.push({ time: t, viseme: 'neutral', duration, weight: 0 });
    } else {
      // Same weight-resolution rules as the char path: per-phone overrides are
      // absolute (scaled by profile ratio); everything else uses the profile table.
      const baseWeight = PHONE_WEIGHT_OVERRIDE[phone] !== undefined
        ? PHONE_WEIGHT_OVERRIDE[phone] * digraphScale
        : resolvedWeights[viseme] ?? VISEME_WEIGHT[viseme];
      frames.push({ time: t, viseme, duration, weight: baseWeight * wordScale });
    }
    t += duration;
  }
  return frames;
}

/**
 * Ramps down viseme weights over the final portion of the sentence so the mouth
 * closes naturally rather than snapping shut when audio ends.
 * Only active for sentences longer than 400ms; window is capped at 250ms.
 */
function applyFinalLowering(frames, totalDuration) {
  if (!frames.length || totalDuration < 0.4) return frames;
  const window   = Math.min(totalDuration * 0.15, 0.250);
  const cutoff   = totalDuration - window;
  for (const frame of frames) {
    if (frame.viseme !== 'neutral' && frame.time > cutoff) {
      const t = (frame.time - cutoff) / window; // 0 → 1
      frame.weight = Math.max(0, frame.weight * (1.0 - t * 0.65));
    }
  }
  return frames;
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
