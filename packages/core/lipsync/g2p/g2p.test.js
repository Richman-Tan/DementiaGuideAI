import { wordToPhonemes } from './g2p';
import { PHONE_TO_VISEME, phoneDurationWeight } from './arpabetToViseme';

describe('wordToPhonemes', () => {
  it('looks up known words regardless of case and surrounding punctuation', () => {
    expect(wordToPhonemes('one')).toEqual(['W', 'AH', 'N']); // spelling says /o/, the lexicon says /w/
    expect(wordToPhonemes('Enough,')).toEqual(['IH', 'N', 'AH', 'F']);
    expect(wordToPhonemes('"Hello!"')).toEqual(['HH', 'AH', 'L', 'OW']);
  });

  it('returns null for an empty or punctuation-only token', () => {
    expect(wordToPhonemes('')).toBeNull();
    expect(wordToPhonemes('—')).toBeNull();
    expect(wordToPhonemes('123')).toBeNull();
  });

  it('returns null for words outside the lexicon, so the caller falls back to spelling', () => {
    expect(wordToPhonemes('geriatrician')).toBeNull();
    expect(wordToPhonemes("don't")).toBeNull();
  });

  describe("possessives and 's contractions missing from the pruned lexicon", () => {
    it('adds /z/ after a voiced final phone', () => {
      expect(wordToPhonemes("Aaron's")).toEqual(['EH', 'R', 'AH', 'N', 'Z']);
    });

    it('adds /s/ after a voiceless final phone', () => {
      expect(wordToPhonemes("Kate's")).toEqual(['K', 'EY', 'T', 'S']);
      expect(wordToPhonemes("it's")).toEqual(['IH', 'T', 'S']);
    });

    it('adds /ɪz/ after a sibilant or affricate', () => {
      expect(wordToPhonemes("judge's")).toEqual(['JH', 'AH', 'JH', 'IH', 'Z']);
      expect(wordToPhonemes("boss's")).toEqual(['B', 'AA', 'S', 'IH', 'Z']);
    });

    it('falls through to null when the base word is unknown too', () => {
      expect(wordToPhonemes("geriatrician's")).toBeNull();
    });
  });

  describe('simple plurals missing from the pruned lexicon', () => {
    it('adds /z/ after a voiced final phone', () => {
      expect(wordToPhonemes('grandsons')).toEqual(['G', 'R', 'AE', 'N', 'D', 'S', 'AH', 'N', 'Z']);
    });

    it('adds /s/ after a voiceless final phone', () => {
      expect(wordToPhonemes('respites')).toEqual(['R', 'EH', 'S', 'P', 'IH', 'T', 'S']);
      expect(wordToPhonemes('aunts')).toEqual(['AE', 'N', 'T', 'S']);
    });

    it('adds /ɪz/ when the singular already ends in a sibilant', () => {
      expect(wordToPhonemes('hospices')).toEqual(['HH', 'AA', 'S', 'P', 'AH', 'S', 'IH', 'Z']);
    });

    it('does not strip the s from a word ending in -ss', () => {
      // "carelessness" is not in the lexicon and must not be read as "carelessnes" + s.
      expect(wordToPhonemes('carelessness')).toBeNull();
    });

    it('returns null when the singular is unknown too', () => {
      expect(wordToPhonemes('geriatricians')).toBeNull();
    });
  });
});

describe('arpabetToViseme', () => {
  it('maps every phone the lexicon produces to a viseme', () => {
    for (const w of [
      'one',
      'enough',
      'hello',
      'judge',
      'garage',
      'bath',
      'church',
      'thing',
      'measure',
    ]) {
      for (const p of wordToPhonemes(w) ?? []) expect(PHONE_TO_VISEME[p]).toBeDefined();
    }
  });

  it('weights vowels and diphthongs longer than stops', () => {
    expect(phoneDurationWeight('AY')).toBe(1.8);
    expect(phoneDurationWeight('AA')).toBe(1.4);
    expect(phoneDurationWeight('M')).toBe(0.9);
    expect(phoneDurationWeight('P')).toBe(0.7);
  });

  it('gives a phone outside every class a neutral weight of 1.0', () => {
    expect(phoneDurationWeight('XX')).toBe(1.0);
    expect(phoneDurationWeight('')).toBe(1.0);
  });
});
