// A keyword check for emergencies in what the person wrote.
//
// It is the floor, not the judge. The pipeline asks a model whether a message
// describes an emergency (the `triage` provider); this runs only when that is
// unavailable or fails, so that an obvious emergency still raises the help card.
// It leans towards catching real emergencies, and it matches whole words and
// phrases: the check it replaces matched substrings, so "white" (hit) and
// "pharmacy" (harm) both raised the card.
//
// The categories follow the emergency list in the system prompt's safety rules.
import type { TriageResult } from './types.ts';

interface Rule {
  category: string;
  level: 'emergency' | 'caution';
  pattern: RegExp;
}

const RULES: Rule[] = [
  {
    // Signs happening now. A stroke mentioned in passing ("since his stroke last
    // year") is the next rule, at a lower level.
    category: 'stroke',
    level: 'emergency',
    pattern:
      /\b((having|signs of|symptoms of|looks like|might be|could be) a stroke|face (is |has )?droop\w*|droop\w* (face|mouth)|slurr\w* (speech|words)|speech (is |has gone )?slurr\w*|(arm|leg|side) (is |has gone )?(weak|numb)|can'?t (lift|raise|move) (his|her|their|my) (arm|leg))\b/i,
  },
  {
    category: 'stroke_mentioned',
    level: 'caution',
    pattern: /\bstroke\b/i,
  },
  {
    category: 'unresponsive',
    level: 'emergency',
    pattern:
      /\b(unresponsive|unconscious|passed out|collapsed|won'?t wake( up)?|can'?t wake (him|her|them)( up)?|not waking( up)?|not responding|stopped breathing|not breathing)\b/i,
  },
  {
    category: 'breathing',
    level: 'emergency',
    pattern:
      /\b(can'?t breathe|cannot breathe|struggling to breathe|trouble breathing|difficulty breathing|gasping|chok(ing|ed)|turning blue)\b/i,
  },
  {
    category: 'chest_pain',
    level: 'emergency',
    pattern: /\b(chest pains?|heart attack|pain in (his|her|their|my) chest)\b/i,
  },
  {
    category: 'fall_injury',
    level: 'emergency',
    pattern:
      /\b((fell|fallen|fall)\b.{0,60}\b(hit (his|her|their|my) head|can'?t get up|bleeding|broken|unconscious)|hit (his|her|their|my) head|bleeding (heavily|badly|a lot)|won'?t stop bleeding)\b/i,
  },
  {
    category: 'poisoning',
    level: 'emergency',
    pattern:
      /\b(overdos\w*|took too many (pills|tablets)|taken too many (pills|tablets)|swallowed (bleach|detergent|cleaner|poison|batter(y|ies)|something (harmful|poisonous))|drank (bleach|detergent|cleaner|poison))\b/i,
  },
  {
    category: 'self_harm',
    level: 'emergency',
    pattern:
      /\b(suicid\w*|kill (myself|himself|herself|themselves)|end (my|his|her|their) (own )?life|self[- ]harm\w*|hurt(ing)? (myself|himself|herself)|don'?t want to (live|be here)( any ?more)?|better off dead)\b/i,
  },
  {
    category: 'missing_person',
    level: 'caution',
    pattern:
      /\b((has|is|went|gone|go|goes) missing|\w+'s missing|wandered (off|away)|can'?t find (him|her|them|mum|dad|my (mum|dad|mother|father|husband|wife|partner)))\b/i,
  },
  {
    category: 'violence',
    level: 'caution',
    pattern:
      /\b(violent|attack(ed|ing)? me|(hit|hits|hitting|punch(ed|es)?|kick(ed|s)?|bit|bites) me|threaten(ed|s|ing)? (me|to)|afraid (of|for my safety)|scared of (him|her))\b/i,
  },
];

/** The emergency categories a message matches, and the most serious level among them. */
export function safetyFloor(message: string): TriageResult {
  const matched = RULES.filter((rule) => rule.pattern.test(message));
  // A stroke described as happening now is not also "a stroke mentioned".
  const urgentStroke = matched.some((rule) => rule.category === 'stroke');
  const hits = matched.filter((rule) => !(urgentStroke && rule.category === 'stroke_mentioned'));
  const level = hits.some((h) => h.level === 'emergency')
    ? 'emergency'
    : hits.length > 0
      ? 'caution'
      : 'none';
  return { level, categories: hits.map((h) => h.category) };
}
