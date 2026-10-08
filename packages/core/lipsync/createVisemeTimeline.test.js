import { createVisemeTimeline } from './createVisemeTimeline';

// Words in the G2P lexicon are animated from their real phonemes; everything
// else falls back to spelling: digraphs first, then single letters. Te reo
// Maori words are the everyday case for that fallback in a New Zealand app,
// since none of them are in the (English) lexicon.

function alignment(characters, charMs = 50) {
  return {
    characters,
    character_start_times_seconds: characters.map((_, i) => (i * charMs) / 1000),
    character_end_times_seconds: characters.map((_, i) => ((i + 1) * charMs) / 1000),
  };
}
const alignmentFor = (text, charMs) => alignment(text.split(''), charMs);

// [viseme, weight] per frame, weights rounded so float noise cannot fail a test.
const shape = (frames) => frames.map((f) => [f.viseme, Math.round(f.weight * 1e4) / 1e4]);

describe('createVisemeTimeline', () => {
  it('returns an empty timeline when there are no characters', () => {
    expect(createVisemeTimeline({ characters: [] })).toEqual({ frames: [], totalDuration: 0 });
    expect(createVisemeTimeline({})).toEqual({ frames: [], totalDuration: 0 });
  });

  it('uses the lexicon for known words: "one" opens on /w/ (rounded), not on the spelled o', () => {
    const { frames } = createVisemeTimeline(alignmentFor('one'), { streaming: true });
    expect(frames.map((f) => f.viseme)).toEqual(['ou', 'aa', 'v_dd']);
  });

  describe('spelling fallback for words outside the lexicon', () => {
    it('maps single letters, holding h neutral (aspiration has no visible shape)', () => {
      const { frames, totalDuration } = createVisemeTimeline(alignmentFor('koha'), { streaming: true });
      expect(shape(frames)).toEqual([['v_kk', 0.62], ['oh', 0.65], ['neutral', 0], ['aa', 0.68]]);
      expect(frames.map((f) => f.time)).toEqual([0, 0.05, 0.1, 0.15]);
      expect(totalDuration).toBe(0.2);
    });

    it('collapses a vowel or consonant digraph into one frame spanning both letters', () => {
      const { frames } = createVisemeTimeline(alignmentFor('whanau'), { streaming: true });
      // wh: rounded lips; a; n; au: one open-vowel frame.
      expect(shape(frames)).toEqual([['ou', 0.28], ['aa', 0.68], ['v_nn', 0.55], ['aa', 0.65]]);
      expect(frames[0].duration).toBeCloseTo(0.1, 6);
      expect(frames[3].time).toBeCloseTo(0.2, 6);
      expect(frames[3].duration).toBeCloseTo(0.1, 6);
    });

    it('treats silent-letter digraphs (kn, gh) as closed-mouth frames', () => {
      const { frames } = createVisemeTimeline(alignmentFor('knightly'), { streaming: true });
      expect(shape(frames)).toEqual([
        ['neutral', 0], ['ih', 0.6], ['neutral', 0], ['v_dd', 0.62], ['v_nn', 0.55], ['ih', 0.6],
      ]);
    });

    it('gives bilabials their per-letter weights (m soft, p hard)', () => {
      const { frames } = createVisemeTimeline(alignmentFor('mokopuna'), { streaming: true });
      expect(shape(frames)).toEqual([
        ['v_pp', 0.55], ['oh', 0.65], ['v_kk', 0.62], ['oh', 0.65],
        ['v_pp', 0.78], ['ou', 0.65], ['v_nn', 0.55], ['aa', 0.68],
      ]);
    });

    it('scales digraphs and letter overrides by the profile, falling back per viseme to the base table', () => {
      // aa 0.85 against the 0.68 baseline: every absolute weight x 1.25.
      const weights = { aa: 0.85, oh: 0.7 };
      expect(shape(createVisemeTimeline(alignmentFor('mokopuna'), { visemeWeights: weights, streaming: true }).frames)).toEqual([
        ['v_pp', 0.6875], ['oh', 0.7], ['v_kk', 0.62], ['oh', 0.7],
        ['v_pp', 0.975], ['ou', 0.65], ['v_nn', 0.55], ['aa', 0.85],
      ]);
      expect(shape(createVisemeTimeline(alignmentFor('whanau'), { visemeWeights: weights, streaming: true }).frames)).toEqual([
        ['ou', 0.35], ['aa', 0.85], ['v_nn', 0.55], ['aa', 0.8125],
      ]);
    });

    it('holds punctuation and characters outside A-Z (such as a macron vowel) neutral', () => {
      expect(shape(createVisemeTimeline(alignmentFor('koha!'), { streaming: true }).frames)).toEqual([
        ['v_kk', 0.62], ['oh', 0.65], ['neutral', 0], ['aa', 0.68], ['neutral', 0],
      ]);
      // U+0101 (a with macron) is not in A-Z: it is neither paired as a digraph
      // nor guessed at.
      expect(shape(createVisemeTimeline(alignmentFor('whānau'), { streaming: true }).frames)).toEqual([
        ['ou', 0.28], ['neutral', 0], ['v_nn', 0.55], ['aa', 0.65],
      ]);
    });

    it('gives an alphabetic entry with no mapping the small generic-consonant movement', () => {
      // An "a" carrying a combining accent (U+0301) arrives as one entry:
      // alphabetic, but not a key of the letter table, so the jaw gets the 0.30
      // fallback rather than freezing.
      const { frames } = createVisemeTimeline(alignment(['k', 'o', 'h', 'á']), { streaming: true });
      expect(shape(frames)).toEqual([['v_kk', 0.62], ['oh', 0.65], ['neutral', 0], ['v_dd', 0.3]]);
    });
  });
});
