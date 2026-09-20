// Whether the screen should adopt the server copy of a conversation thread,
// kept pure so the decision is testable without mounting ChatProvider.
//
// Two rules pulling in opposite directions:
//   - For the SAME thread, an empty server copy must not blank the screen —
//     the cache renders instantly on load, and a server hiccup (or a write
//     still in flight) returning nothing would wipe a real conversation.
//   - For a DIFFERENT thread, the server copy must replace the screen even
//     when it is empty. The study's arm switch is exactly this case: arm B's
//     fresh thread has no messages, and keeping arm A's on screen lets the
//     participant re-read them instead of searching — and feeds them to the
//     model as arm B context, contaminating the headline comparison. The DB
//     threads were correctly separate; the screen was not (found live in the
//     2026-09-09 pilot run-through).
export function shouldAdoptServerThread(prevId, nextId, serverLength) {
  if (serverLength > 0) return true;
  return Boolean(prevId) && prevId !== nextId;
}
