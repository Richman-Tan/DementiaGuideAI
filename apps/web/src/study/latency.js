// Per-turn latency capture.
//
// The pipeline was already designed to be measured — openaiClient.chatStream
// accepts timingCbs (onRagDone, onLlmSend, onSources, onFinal) — but the web
// build only ever used two of them, so no timing was recorded anywhere. This
// closes that: one timer per turn, six stages, emitted as both a study event and
// a `[LATENCY SUMMARY] {…}` console line.
//
// The console line matters. scripts/parse-latency.mjs already parses exactly
// that format into the report's latency table, so the existing tooling works on
// web sessions with no changes, and a moderator debugging a session can read the
// same numbers straight out of the console.
import { emit } from './events.js';

const now = () =>
  (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

/**
 * createTurnTimer('A') → timer
 *
 * Call mark() at each stage boundary; unset marks simply drop out of the
 * summary rather than reporting zero, so a turn that took the REST path is not
 * silently indistinguishable from one that was instant.
 */
export function createTurnTimer(arm = null, taskId = null) {
  const t0 = now();
  const marks = Object.create(null);

  const rel = (a) => (marks[a] == null ? null : Math.round(marks[a]));
  const delta = (a, b) => (marks[a] == null || marks[b] == null ? null : Math.round(marks[b] - marks[a]));

  return {
    /** First call for a given name wins — later duplicates are ignored. */
    mark(name) {
      if (marks[name] == null) marks[name] = now() - t0;
    },

    /** Stage timings, in the field names scripts/parse-latency.mjs expects. */
    summary() {
      const s = {
        stt_ms: rel('sttDone'),
        rag_ms: delta('sttDone', 'ragDone'),
        llm_to_token_ms: delta('llmSend', 'firstToken'),
        first_sentence_ms: delta('firstToken', 'firstSentence'),
        tts_first_ms: delta('ttsRequest', 'firstAudio'),
        to_first_audio_ms: rel('firstAudio'),
        // Not one of the six report stages, and parse-latency.mjs ignores it.
        // It is the text arm's analogue of to_first_audio_ms: the moment the
        // participant first has something to read.
        to_first_token_ms: rel('firstToken'),
      };
      for (const k of Object.keys(s)) if (s[k] == null) delete s[k];
      return s;
    },

    /** Emit once, at the end of the turn. Safe to call outside a study session. */
    finish(extra = {}) {
      const s = this.summary();
      if (Object.keys(s).length === 0) return s;
      // Single-line JSON, no newlines inside the braces — the parser's regex
      // stops at the first newline.
      console.log(`[LATENCY SUMMARY] ${JSON.stringify(s)}`);
      emit('latency', { arm, taskId, ...s, ...extra });
      return s;
    },
  };
}
