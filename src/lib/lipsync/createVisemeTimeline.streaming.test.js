import { createVisemeTimeline } from './createVisemeTimeline';

// A sentence long enough (>400ms) that applyFinalLowering activates on the
// non-streaming path: final-window frames get their weight ramped down.
function alignmentFor(text, charMs = 60) {
  const characters = text.split('');
  return {
    characters,
    character_start_times_seconds: characters.map((_, i) => (i * charMs) / 1000),
    character_end_times_seconds: characters.map((_, i) => ((i + 1) * charMs) / 1000),
  };
}

describe('createVisemeTimeline streaming option', () => {
  const alignment = alignmentFor('this is a fairly long sentence for testing purposes');

  it('applies final lowering by default (one-shot REST path)', () => {
    const oneShot = createVisemeTimeline(alignment, {});
    const streaming = createVisemeTimeline(alignment, { streaming: true });

    expect(oneShot.totalDuration).toBeCloseTo(streaming.totalDuration, 5);
    expect(oneShot.frames.length).toBe(streaming.frames.length);

    // In the lowering window (last 15% / 250ms) the one-shot weights must be
    // strictly lower than the streaming weights for non-neutral frames.
    const cutoff = oneShot.totalDuration - Math.min(oneShot.totalDuration * 0.15, 0.25);
    let compared = 0;
    for (let i = 0; i < oneShot.frames.length; i++) {
      const a = oneShot.frames[i];
      const b = streaming.frames[i];
      if (a.viseme !== 'neutral' && a.time > cutoff && b.weight > 0) {
        expect(a.weight).toBeLessThan(b.weight);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(0); // the window actually contained frames
  });

  it('leaves pre-window frames identical in both modes', () => {
    const oneShot = createVisemeTimeline(alignment, {});
    const streaming = createVisemeTimeline(alignment, { streaming: true });
    const cutoff = oneShot.totalDuration - Math.min(oneShot.totalDuration * 0.15, 0.25);
    for (let i = 0; i < oneShot.frames.length; i++) {
      if (oneShot.frames[i].time <= cutoff) {
        expect(oneShot.frames[i]).toEqual(streaming.frames[i]);
      }
    }
  });
});
