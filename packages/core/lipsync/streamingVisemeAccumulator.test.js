import { createStreamingVisemeAccumulator } from './streamingVisemeAccumulator';

// Build a WS-shaped alignment for a string: each char 50ms, starting at startMs.
function alignmentFor(text, startMs = 0, charMs = 50) {
  const chars = text.split('');
  return {
    chars,
    charStartTimesMs: chars.map((_, i) => startMs + i * charMs),
    charDurationsMs: chars.map(() => charMs),
  };
}

describe('createStreamingVisemeAccumulator', () => {
  it('emits frames in absolute stream time for a single chunk', () => {
    const acc = createStreamingVisemeAccumulator({});
    const { frames, charTimes } = acc.push(alignmentFor('hello world '), 0.6);
    expect(frames.length).toBeGreaterThan(0);
    expect(charTimes).toHaveLength(12);
    expect(frames[0].time).toBeCloseTo(0, 3);
    expect(acc.getStreamOffsetSec()).toBeCloseTo(0.6, 5);
  });

  it('offsets chunk-relative alignments by the accumulated stream time', () => {
    const acc = createStreamingVisemeAccumulator({});
    acc.push(alignmentFor('first part done '), 0.8);
    // Second chunk restarts its clock at 0 → must be recognized as
    // chunk-relative and shifted by +0.8s.
    const { frames, charTimes } = acc.push(alignmentFor('second bit '), 0.55);
    expect(charTimes[0]).toBeCloseTo(0.8, 3);
    expect(frames[0].time).toBeGreaterThanOrEqual(0.8);
  });

  it('passes through stream-relative alignments unchanged', () => {
    const acc = createStreamingVisemeAccumulator({});
    acc.push(alignmentFor('first part done ', 0), 0.8);
    // Second chunk's timestamps continue from ~800ms → already absolute.
    const { charTimes } = acc.push(alignmentFor('second bit ', 800), 0.55);
    expect(charTimes[0]).toBeCloseTo(0.8, 3);
  });

  it('carries a split word across chunks so G2P sees whole words', () => {
    const acc = createStreamingVisemeAccumulator({});
    // 'medica' has no trailing space — must be held back entirely...
    const first = acc.push(alignmentFor('take your medica'), 0.8);
    const heldFrameTimes = first.frames.map((f) => f.time);
    // ...only 'take your ' may produce frames in this push.
    expect(Math.max(...heldFrameTimes)).toBeLessThan(0.5); // 'medica' starts at 10*50ms=0.5s
    // The completed word arrives with the next chunk (chunk-relative times).
    const second = acc.push(alignmentFor('tion now '), 0.45);
    const times = second.frames.map((f) => f.time);
    // Frames for 'medication' start where 'medica' started: 0.5s.
    expect(Math.min(...times)).toBeCloseTo(0.5, 2);
  });

  it('flush() releases the held trailing word at stream end', () => {
    const acc = createStreamingVisemeAccumulator({});
    acc.push(alignmentFor('say goodbye'), 0.55); // 'goodbye' held (no trailing space)
    const { frames } = acc.flush();
    expect(frames.length).toBeGreaterThan(0);
    expect(frames[0].time).toBeCloseTo(0.2, 2); // 'goodbye' starts at 4*50ms
    // Second flush is a no-op.
    expect(acc.flush().frames).toEqual([]);
  });

  it('handles alignment-less audio chunks by advancing the clock only', () => {
    const acc = createStreamingVisemeAccumulator({});
    const res = acc.push(null, 0.3);
    expect(res.frames).toEqual([]);
    expect(acc.getStreamOffsetSec()).toBeCloseTo(0.3, 5);
  });
});
