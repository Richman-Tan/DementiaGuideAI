/**
 * Grapheme-to-phoneme lookup against a pruned CMUdict lexicon (25k most
 * frequent English words — see unity-avatar/tools/build-lexicon.js).
 *
 * This replaces spelling-based viseme guessing for known words: English
 * orthography is a terrible proxy for phonetics ("one" starts with /w/,
 * "enough" ends in /f/, silent letters everywhere). Words not in the lexicon
 * return null and the caller falls back to the char-heuristic path.
 */

import LEXICON from './lexicon.json';

// Suffix rules for simple inflections missing from the pruned lexicon.
// Voiceless consonants take /s/ (cats), everything else /z/ (dogs, John's).
const VOICELESS = new Set(['P', 'T', 'K', 'F', 'TH']);

function pluralPhone(lastPhone) {
  if (['S', 'Z', 'SH', 'ZH', 'CH', 'JH'].includes(lastPhone)) return 'IH Z';
  return VOICELESS.has(lastPhone) ? 'S' : 'Z';
}

/**
 * @param {string} word — raw token, any case, may include apostrophes
 * @returns {string[]|null} ARPAbet phones (stress-stripped), or null if unknown
 */
export function wordToPhonemes(word) {
  const w = word.toLowerCase().replace(/[^a-z']/g, '');
  if (!w) return null;

  const direct = LEXICON[w];
  if (direct) return direct.split(' ');

  // Possessives / contractions: "aaron's" → aaron + Z
  if (w.endsWith("'s")) {
    const base = LEXICON[w.slice(0, -2)];
    if (base) {
      const phones = base.split(' ');
      return phones.concat(pluralPhone(phones[phones.length - 1]).split(' '));
    }
  }

  // Simple plural: "pumpkins" → pumpkin + Z
  if (w.endsWith('s') && !w.endsWith('ss')) {
    const base = LEXICON[w.slice(0, -1)];
    if (base) {
      const phones = base.split(' ');
      return phones.concat(pluralPhone(phones[phones.length - 1]).split(' '));
    }
  }

  return null;
}
