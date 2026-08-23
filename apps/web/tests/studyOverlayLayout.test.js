// The task band measures itself and writes the result back into page layout.
//
// That is a cycle, and it ran away: taller band → more body padding → taller
// document → scrollbar appears → narrower viewport → text rewraps → taller band.
// The ResizeObserver watching the band fired on every turn of it, pegging the
// main thread until keystrokes and paste were dropped and the tab stopped
// responding — during a task, which is when a participant can least afford it.
//
// Two defences, one test each. There is no DOM in this suite, so the publish
// step is modelled directly: what matters is that a settled height performs no
// writes, and that a height which alternates cannot keep writing forever.
import { describe, it, expect } from 'vitest';

/**
 * The overlay's publish step, extracted to the shape it has in
 * study/screens/StudyTaskOverlay.jsx: measure, bail if unchanged, then write.
 *
 * `measure` stands in for offsetHeight; `writes` records what reached the DOM.
 */
function makePublisher(measure) {
  let lastH = null;
  const writes = [];
  return {
    writes,
    apply() {
      const h = measure();
      if (h === lastH) return;
      lastH = h;
      writes.push(h);
    },
  };
}

describe('publishing the band height', () => {
  it('writes once when the height is settled, however often it is asked', () => {
    const p = makePublisher(() => 283);
    // A ResizeObserver on the band fires for every layout change on the page,
    // not just for changes to the band. Most of those are other people's.
    for (let i = 0; i < 50; i++) p.apply();
    expect(p.writes).toEqual([283]);
  });

  it('writes again when the height genuinely changes', () => {
    // Expanding or collapsing the band, or a text-scale change, must still be
    // published — the guard is not allowed to make the band stale.
    let h = 283;
    const p = makePublisher(() => h);
    p.apply();
    h = 96;   // participant pressed "Hide"
    p.apply();
    h = 283;  // and "Show" again
    p.apply();
    expect(p.writes).toEqual([283, 96, 283]);
  });

  it('does not write on repeated measurements at each settled value', () => {
    let h = 283;
    const p = makePublisher(() => h);
    for (let i = 0; i < 10; i++) p.apply();
    h = 96;
    for (let i = 0; i < 10; i++) p.apply();
    expect(p.writes).toEqual([283, 96]);
  });
});

// The guard alone cannot stop a height that truly alternates between two values
// — it would publish on every flip. That is why the scrollbar is taken out of
// the loop in styles/tokens.css rather than relying on this guard alone. This
// test documents the limit, so nobody later removes `scrollbar-gutter: stable`
// believing the guard covers it.
describe('the guard is not sufficient on its own', () => {
  it('still writes on every flip when the height oscillates', () => {
    let flip = false;
    const p = makePublisher(() => { flip = !flip; return flip ? 283 : 296; });
    for (let i = 0; i < 20; i++) p.apply();
    expect(p.writes.length).toBe(20);
    // Hence `html { scrollbar-gutter: stable }`: it removes the viewport-width
    // change that made the band's height alternate in the first place.
  });
});
