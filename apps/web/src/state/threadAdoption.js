// Whether the screen should adopt the server copy of a conversation thread,
// kept pure so the decision is testable without mounting ChatProvider.
//
// Two rules pulling in opposite directions:
//   - For the SAME thread, an empty server copy must not blank the screen —
//     the cache renders instantly on load, and a server hiccup (or a write
//     still in flight) returning nothing would wipe a real conversation.
//   - For a DIFFERENT thread, the server copy must replace the screen even
//     when it is empty. Switching to a fresh thread is exactly this case: it has
//     no messages, and keeping the previous thread's on screen would show them
//     under the new one and feed them to the model as its context.
export function shouldAdoptServerThread(prevId, nextId, serverLength) {
  if (serverLength > 0) return true;
  return Boolean(prevId) && prevId !== nextId;
}
