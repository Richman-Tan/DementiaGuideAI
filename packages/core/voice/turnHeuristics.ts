// Two judgements the turn-taking machine relies on, kept apart from it because
// they are the parts that get tuned against recordings:
//
//   how long to wait after someone stops speaking before taking it that they
//   have finished, and whether what the microphone picked up is the assistant
//   hearing its own voice.
//
// Both work on text as a speech recogniser gives it, which may have no
// punctuation, so they go by words.

export interface EndOfTurnConfig {
  /** The wait when nothing about the words suggests otherwise. */
  baseMs: number;
  /** The wait when the words stop mid-clause: the speaker has more to say. */
  midClauseMs: number;
  /** The wait after what sounds like a complete question. */
  questionMs: number;
}

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

// A sentence does not end on one of these. Fillers are here too: "um" at the
// end means the speaker is still looking for the next word.
const TRAILING = new Set([
  'and',
  'but',
  'or',
  'so',
  'because',
  'if',
  'when',
  'while',
  'that',
  'which',
  'who',
  'the',
  'a',
  'an',
  'to',
  'of',
  'with',
  'for',
  'in',
  'on',
  'at',
  'about',
  'like',
  'my',
  'her',
  'his',
  'their',
  'our',
  'your',
  'is',
  'are',
  'was',
  'were',
  'um',
  'uh',
  'er',
  'erm',
  'hmm',
]);

const QUESTION_OPENERS = new Set([
  'what',
  'how',
  'why',
  'when',
  'where',
  'who',
  'which',
  'can',
  'could',
  'should',
  'would',
  'will',
  'is',
  'are',
  'do',
  'does',
  'did',
]);

/** A question needs this many words before it is taken as complete: "how do" is not one. */
const MIN_QUESTION_WORDS = 4;

/**
 * How long to wait after speech stops before treating the turn as finished.
 * Longer when the words break off mid-clause, shorter after a whole question,
 * and the base wait otherwise. People who are tired or hesitant pause in the
 * middle of a thought, so the base wait is generous and the short one is used
 * only on clear evidence.
 */
export function endOfTurnWaitMs(text: string, config: EndOfTurnConfig): number {
  const spoken = words(text);
  const last = spoken[spoken.length - 1];
  if (!last) return config.baseMs;
  if (TRAILING.has(last) || /,\s*$/.test(text)) return config.midClauseMs;
  const asked =
    /\?\s*$/.test(text) ||
    (QUESTION_OPENERS.has(spoken[0] as string) && spoken.length >= MIN_QUESTION_WORDS);
  return asked ? config.questionMs : config.baseMs;
}

/** The share of what was heard that must match the assistant's words, in order, to call it an echo. */
const ECHO_SHARE = 0.6;

/**
 * Whether what the microphone heard is the assistant's own speech coming back
 * through the speakers: most of the heard words appear, as one run and in
 * order, in what the assistant is saying.
 *
 * A single word is never called an echo. "Stop" and "wait" are single words,
 * and missing one of those is worse than a false interruption.
 */
export function looksLikeEcho(heard: string, speaking: string): boolean {
  const h = words(heard);
  const s = words(speaking);
  if (h.length < 2 || s.length === 0) return false;
  // The longest run of consecutive words the two share.
  let best = 0;
  let previous = new Array<number>(s.length + 1).fill(0);
  for (let i = 1; i <= h.length; i += 1) {
    const current = new Array<number>(s.length + 1).fill(0);
    for (let j = 1; j <= s.length; j += 1) {
      if (h[i - 1] === s[j - 1]) {
        current[j] = (previous[j - 1] as number) + 1;
        if ((current[j] as number) > best) best = current[j] as number;
      }
    }
    previous = current;
  }
  return best >= 2 && best / h.length >= ECHO_SHARE;
}
