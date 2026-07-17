// Sentence-boundary splitter for the streamed LLM token feed — the single
// definition shared by the legacy (per-sentence REST TTS) and streaming
// (WebSocket TTS) producers, so both split identically by construction.
//
// Rules (unchanged from the original inline producer logic):
//   Primary:   split after . ! ? followed by whitespace. Uses a \x1F delimiter
//              substitution because Hermes doesn't support lookbehind.
//   Secondary: when the pending buffer exceeds earlyChunkChars and contains a
//              comma/semicolon past index 15, flush early — clause-heavy
//              responses shouldn't hold back first audio.

export const EARLY_CHUNK_CHARS = 150;

export function createSentenceSplitter({ earlyChunkChars = EARLY_CHUNK_CHARS } = {}) {
  let buf = '';

  return {
    /** Feed a token chunk; returns zero or more completed sentences. */
    push(piece) {
      buf += piece;
      const out = [];

      const marked = buf.replace(/([.!?])\s+/g, '$1\x1F');
      const parts = marked.split('\x1F');
      for (const s of parts.slice(0, -1)) out.push(s);
      buf = parts[parts.length - 1];

      if (buf.length > earlyChunkChars) {
        const splitIdx = Math.max(buf.lastIndexOf(','), buf.lastIndexOf(';'));
        if (splitIdx > 15) {
          out.push(buf.slice(0, splitIdx + 1));
          buf = buf.slice(splitIdx + 1).trimStart();
        }
      }
      return out;
    },

    /** Stream over: returns the remaining partial sentence, or null. */
    finish() {
      const rest = buf.trim();
      buf = '';
      return rest || null;
    },
  };
}
