// Matches a real knowledge-base source ({title, org}) to a library article so
// the source drawer can offer "Read related article". Conservative on purpose:
// a wrong link is worse than no link — unmatched sources fall back to the
// excerpt (+ external url when present).
import { ARTICLES } from '../data/services.js';

const normalize = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

const STOP = new Set([
  'the',
  'and',
  'for',
  'with',
  'about',
  'your',
  'you',
  'how',
  'what',
  'when',
  'are',
  'can',
]);

// Hand-curated aliases for known bulk sources whose chunk titles don't mirror
// article titles.
const ALIASES = [
  [/isupport|who dementia/i, 'person-centred'],
  [/sundown/i, 'managing-sundowning'],
  [/wander/i, 'wandering'],
  [/respite/i, 'respite'],
];

const indexed = ARTICLES.map((a) => ({ a, tokens: new Set(normalize(a.title + ' ' + a.sum)) }));

export function matchSourceToArticle(source) {
  const hay = `${source.title || ''} ${source.org || ''}`;
  for (const [re, id] of ALIASES) {
    if (re.test(hay)) {
      const hit = ARTICLES.find((a) => a.id === id);
      if (hit) return hit;
    }
  }
  const tokens = normalize(source.title);
  if (tokens.length < 2) return null;
  let best = null;
  let bestScore = 0;
  for (const { a, tokens: at } of indexed) {
    let overlap = 0;
    for (const t of tokens) if (at.has(t)) overlap += 1;
    const score = overlap / tokens.length;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  // ≥60% of the source-title's meaningful words must appear in the article.
  return bestScore >= 0.6 ? best : null;
}
