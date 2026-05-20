import {
  CHAR_TO_VISEME,
  VISEME_WEIGHT,
  DEFAULT_CONSONANT_VISEME,
  DEFAULT_CONSONANT_WEIGHT,
} from './phonemeMap';

// Gap threshold below which two adjacent same-viseme frames are merged (seconds).
const MERGE_GAP_THRESHOLD = 0.02;

/**
 * Converts ElevenLabs character-level alignment data into a VisemeTimeline
 * that the WebView LipSyncController can consume directly.
 *
 * @param {object} alignment
 *   alignment.characters                     - string[]
 *   alignment.character_start_times_seconds  - number[]
 *   alignment.character_end_times_seconds    - number[]
 *
 * @returns {{ frames: VisemeFrame[], totalDuration: number }}
 *
 * VisemeFrame: { time, viseme, duration, weight }
 *
 * How the pipeline works:
 *   ElevenLabs alignment → charToFrame() per character
 *   → mergeConsecutiveSameViseme() to collapse repeated visemes
 *   → VisemeTimeline sent across the WebView bridge as JSON
 *   → LipSyncController.getVisemeWeights() drives VRM blend shapes each frame
 */
export function createVisemeTimeline(alignment) {
  const { characters, character_start_times_seconds, character_end_times_seconds } = alignment;

  if (!characters || !characters.length) {
    return { frames: [], totalDuration: 0 };
  }

  const rawFrames = [];

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    const startTime = character_start_times_seconds[i];
    const endTime = character_end_times_seconds[i];
    const duration = Math.max(endTime - startTime, 0.001); // guard against zero-length

    // Whitespace / newline → silence (neutral, weight 0)
    if (char === ' ' || char === '\n' || char === '\r' || char === '\t') {
      rawFrames.push({ time: startTime, viseme: 'neutral', duration, weight: 0 });
      continue;
    }

    const viseme = CHAR_TO_VISEME[char];

    if (viseme === 'neutral') {
      // Bilabial stop — closed mouth
      rawFrames.push({ time: startTime, viseme: 'neutral', duration, weight: 0 });
    } else if (viseme) {
      // Known vowel or semi-vowel
      rawFrames.push({ time: startTime, viseme, duration, weight: VISEME_WEIGHT[viseme] });
    } else {
      // Generic consonant — light mouth activity
      rawFrames.push({
        time: startTime,
        viseme: DEFAULT_CONSONANT_VISEME,
        duration,
        weight: DEFAULT_CONSONANT_WEIGHT,
      });
    }
  }

  const frames = mergeConsecutiveSameViseme(rawFrames);
  const totalDuration = character_end_times_seconds[characters.length - 1] || 0;

  return { frames, totalDuration };
}

/**
 * Collapses adjacent frames that share the same viseme and whose gap is below
 * MERGE_GAP_THRESHOLD into a single longer frame. This prevents micro-jitter
 * on long vowel runs (e.g. "aaa" from three consecutive 'a' characters).
 */
function mergeConsecutiveSameViseme(frames) {
  if (!frames.length) return frames;

  const merged = [{ ...frames[0] }];

  for (let i = 1; i < frames.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = frames[i];
    const gap = curr.time - (prev.time + prev.duration);

    if (prev.viseme === curr.viseme && gap < MERGE_GAP_THRESHOLD) {
      // Extend the previous frame to cover this one (including any gap)
      prev.duration = curr.time + curr.duration - prev.time;
      // Keep the higher weight of the two
      prev.weight = Math.max(prev.weight, curr.weight);
    } else {
      merged.push({ ...curr });
    }
  }

  return merged;
}
