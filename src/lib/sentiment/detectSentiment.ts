// Keyword sets for sentence-level sentiment detection.
// Used to choose a facial expression layer that blends over Aria's speaking animation.
// Words are matched on full word boundaries (no substring matches).

export type Sentiment = 'positive' | 'warm' | 'concern' | 'question' | 'neutral';

const POSITIVE = new Set<string>([
  'great',
  'wonderful',
  'excellent',
  'good',
  'happy',
  'lovely',
  'beautiful',
  'fantastic',
  'amazing',
  'love',
  'enjoy',
  'glad',
  'pleased',
  'thank',
  'thanks',
  'delightful',
  'perfect',
  'celebrate',
  'proud',
  'joy',
  'excited',
  'brilliant',
  'better',
  'improvement',
  'progress',
  'positive',
  'success',
  'well',
  'encourage',
  'hope',
  'hopeful',
  'bright',
  'cheerful',
  'smile',
]);

const WARM = new Set<string>([
  'understand',
  'care',
  'support',
  'help',
  'together',
  'family',
  'loved',
  'comfort',
  'gentle',
  'kind',
  'patient',
  'remember',
  'feel',
  'heart',
  'safe',
  'warm',
  'here',
  'always',
  'listen',
  'important',
  'matter',
  'precious',
  'cherish',
  'strength',
  'courage',
  'journey',
  'share',
  'close',
  'connection',
  'trust',
  'peace',
  'calm',
  'reassure',
  'alongside',
  'with',
]);

const CONCERN = new Set<string>([
  'worry',
  'difficult',
  'hard',
  'challenge',
  'pain',
  'sad',
  'confus',
  'forget',
  'lost',
  'anxious',
  'scared',
  'afraid',
  'stress',
  'upset',
  'trouble',
  'problem',
  'struggle',
  'frustrat',
  'overwhelm',
  'alone',
  'sorry',
  'unfortunate',
  'difficult',
  'distress',
  'concern',
  'upsetting',
  'grief',
  'loss',
  'miss',
  'tired',
  'exhausted',
  'burden',
]);

/**
 * Returns one of: 'positive' | 'warm' | 'concern' | 'question' | 'neutral'
 * Called once per TTS sentence so it stays on the hot path.
 */
export function detectSentiment(text: string): Sentiment {
  const words = text.toLowerCase().match(/\b\w+\b/g) || [];

  let positive = 0,
    warm = 0,
    concern = 0;
  for (const w of words) {
    if (POSITIVE.has(w)) positive++;
    if (WARM.has(w)) warm++;
    if (CONCERN.has(w)) concern++;
  }

  const isQuestion = /\?/.test(text);

  if (concern > 0 && concern >= positive) return 'concern';
  if (positive > warm) return 'positive';
  if (warm > 0) return 'warm';
  if (isQuestion) return 'question';
  return 'neutral';
}
