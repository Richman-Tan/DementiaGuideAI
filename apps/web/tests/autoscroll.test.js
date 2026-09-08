// The rule that makes a streaming transcript readable: follow new content only
// while the reader is already at the bottom. The pilot tester's words for the
// old behaviour — scrollTop forced to the end on every token — were "the script
// goes whizzing by without a chance to read it".
import { describe, it, expect } from 'vitest';
import { isNearBottom, makeStickTracker } from '../src/lib/autoscroll.js';

/** Scroller metrics: `gap` px of content still below the viewport. */
const metrics = (gap) => ({ scrollTop: 1000 - gap, scrollHeight: 1600, clientHeight: 600 });

describe('deciding what counts as "at the bottom"', () => {
  it('is exactly at the bottom', () => {
    expect(isNearBottom(metrics(0))).toBe(true);
  });

  it('tolerates the drift a programmatic scroll or trailing padding leaves', () => {
    expect(isNearBottom(metrics(79))).toBe(true);
    expect(isNearBottom(metrics(80))).toBe(true);
  });

  it('is not fooled by a reader one screen up', () => {
    expect(isNearBottom(metrics(81))).toBe(false);
    expect(isNearBottom(metrics(500))).toBe(false);
  });
});

describe('the sticky-scroll tracker', () => {
  it('starts stuck — a fresh transcript opens at the latest message', () => {
    expect(makeStickTracker().stuck()).toBe(true);
  });

  it('detaches when the reader scrolls up, and stays detached while they read', () => {
    const t = makeStickTracker();
    t.onScroll(metrics(400));
    expect(t.stuck()).toBe(false);
    // More content streams in below; nothing about their position changed.
    t.onScroll(metrics(700));
    expect(t.stuck()).toBe(false);
  });

  it('stays stuck across appended content when the reader is at the bottom', () => {
    // A programmatic scroll-to-bottom lands near the bottom, so the scroll
    // event it fires must not detach the tracker — that would be a one-token
    // autoscroll.
    const t = makeStickTracker();
    for (const gap of [0, 12, 40, 0]) {
      t.onScroll(metrics(gap));
      expect(t.stuck()).toBe(true);
    }
  });

  it('re-sticks when the reader scrolls back down themselves', () => {
    const t = makeStickTracker();
    t.onScroll(metrics(400));
    t.onScroll(metrics(10));
    expect(t.stuck()).toBe(true);
  });

  it('re-sticks on jump — the "Jump to latest" button', () => {
    const t = makeStickTracker();
    t.onScroll(metrics(400));
    expect(t.stuck()).toBe(false);
    t.jump();
    expect(t.stuck()).toBe(true);
  });
});
