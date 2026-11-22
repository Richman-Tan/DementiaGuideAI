const {
  MARK,
  MARK_REVERSED,
  MARK_COMPACT,
  COMPACT_BELOW,
  markFor,
  markBounds,
  markViewBox,
  markAspect,
} = require('./mark');

// The geometry every renderer draws from. scripts/brand/build-icons.test.js pins
// the generated assets; these pin the helpers the in-app components call.

describe('markFor', () => {
  it('switches to the compact mark below the threshold, whatever the background', () => {
    expect(markFor(COMPACT_BELOW - 1, false)).toBe(MARK_COMPACT);
    expect(markFor(COMPACT_BELOW - 1, true)).toBe(MARK_COMPACT);
  });

  it('uses the reversed (heavier ring) mark on a tile at or above the threshold', () => {
    expect(markFor(COMPACT_BELOW, true)).toBe(MARK_REVERSED);
    expect(markFor(120, false)).toBe(MARK);
  });
});

describe('markBounds', () => {
  it('includes the ring stroke and sits right of centre in the 48-box', () => {
    const b = markBounds(MARK);
    expect(b.minX).toBeCloseTo(6.5, 6); // solid disc's left edge
    expect(b.maxX).toBeCloseTo(44.2, 6); // ring centre 31 + r 11.5 + half of the 3.4 stroke
    expect(b.minY).toBeCloseTo(10.8, 6);
    expect(b.maxY).toBeCloseTo(37.2, 6);
    expect((b.minX + b.maxX) / 2).toBeGreaterThan(24);
  });
});

describe('markViewBox', () => {
  it('crops the viewBox to the mark itself, so an <svg> needs no transform', () => {
    for (const mark of [MARK, MARK_REVERSED, MARK_COMPACT]) {
      const b = markBounds(mark);
      const [x, y, w, h] = markViewBox(mark).split(' ').map(Number);
      expect(x).toBeCloseTo(b.minX, 6);
      expect(y).toBeCloseTo(b.minY, 6);
      expect(w).toBeCloseTo(b.width, 6);
      expect(h).toBeCloseTo(b.height, 6);
    }
  });

  it('is wider for the heavier ring of the reversed mark', () => {
    const [, , wPlain] = markViewBox(MARK).split(' ').map(Number);
    const [, , wReversed] = markViewBox(MARK_REVERSED).split(' ').map(Number);
    expect(wReversed).toBeGreaterThan(wPlain);
  });
});

describe('markAspect', () => {
  it('is width over height of the cropped mark, about 1.43 for the standard mark', () => {
    expect(markAspect(MARK)).toBeCloseTo(37.7 / 26.4, 6);
    expect(markAspect(MARK)).toBeCloseTo(1.43, 2);
  });

  it('is always wider than tall', () => {
    for (const mark of [MARK, MARK_REVERSED, MARK_COMPACT])
      expect(markAspect(mark)).toBeGreaterThan(1);
  });
});
