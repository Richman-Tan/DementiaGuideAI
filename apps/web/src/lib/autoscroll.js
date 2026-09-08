// Whether the chat transcript should follow new content, kept pure so the
// decision is testable. The rule that matters: streaming scrolls the view only
// while the reader is already at the bottom. Before this, every token forced
// scrollTop to the end — scroll up to reread an answer while the next one
// streams in and the view is yanked away, which a pilot tester described as
// "the script goes whizzing by without a chance to read it".

/** Close enough to the bottom that following new content is what the reader wants. */
export function isNearBottom({ scrollTop, scrollHeight, clientHeight }, threshold = 80) {
  return scrollHeight - scrollTop - clientHeight <= threshold;
}

/**
 * Sticky-scroll state machine. Starts stuck (a fresh transcript opens at the
 * latest message); any scroll re-evaluates against the bottom; `jump()` is the
 * "Jump to latest" button re-sticking on the reader's own terms.
 *
 * A programmatic scroll-to-bottom lands near the bottom, so the scroll event
 * it fires keeps the tracker stuck — no feedback loop.
 */
export function makeStickTracker(threshold = 80) {
  let stuck = true;
  return {
    stuck: () => stuck,
    onScroll(metrics) {
      stuck = isNearBottom(metrics, threshold);
      return stuck;
    },
    jump() {
      stuck = true;
    },
  };
}
