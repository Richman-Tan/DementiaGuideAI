// What the latency marks mean.
//
// The study's headline claim is an avatar-vs-text comparison of how long a
// participant waits. That only holds if both arms are measured at the same point
// in the participant's experience: Arm B at the moment text appears
// (`to_first_token_ms`), Arm A at the moment speech becomes audible
// (`to_first_audio_ms`).
//
// They were not. `firstAudio` was marked when the TTS response resolved, which on
// the REST path — the only path a study session takes — happens before the audio
// is queued, decoded and played. Arm A therefore looked faster than it was, by an
// interval nobody recorded. These tests pin the corrected meaning.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTurnTimer } from '../src/study/latency.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

beforeEach(() => {
  globalThis.localStorage = memoryStorage();
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 202, json: async () => ({}) }));
});

/** Marks in the order the REST path produces them, with a gap before playback. */
function restTurn({ playbackGapMs = 0 } = {}) {
  const turn = createTurnTimer('A', 't1a');
  turn.mark('sttDone');
  turn.mark('ragDone');
  turn.mark('llmSend');
  turn.mark('firstToken');
  turn.mark('firstSentence');
  turn.mark('ttsRequest');
  turn.mark('ttsResponse');
  if (playbackGapMs) {
    const until = Date.now() + playbackGapMs;
    while (Date.now() < until) { /* deliberate busy wait: marks use a real clock */ }
  }
  turn.mark('firstAudio');
  return turn;
}

describe('to_first_audio_ms measures time to audible, not time to arrival', () => {
  it('includes the wait between the audio arriving and playing', () => {
    const s = restTurn({ playbackGapMs: 30 }).summary();
    expect(s.playback_wait_ms).toBeGreaterThanOrEqual(25);
    expect(s.to_first_audio_ms).toBeGreaterThanOrEqual(s.playback_wait_ms);
  });

  it('keeps tts_first_ms as the TTS round trip only, excluding playback wait', () => {
    const s = restTurn({ playbackGapMs: 40 }).summary();
    // If tts_first_ms still ended at firstAudio it would absorb the gap, and the
    // stage breakdown would stop adding up.
    expect(s.tts_first_ms).toBeLessThan(s.to_first_audio_ms);
    expect(s.tts_first_ms + s.playback_wait_ms).toBeLessThanOrEqual(s.to_first_audio_ms + 2);
  });

  it('reports audible strictly later than arrival when there is a gap', () => {
    const s = restTurn({ playbackGapMs: 30 }).summary();
    const arrival = s.to_first_audio_ms - s.playback_wait_ms;
    expect(s.to_first_audio_ms).toBeGreaterThan(arrival);
  });
});

describe('the two arms stay comparable', () => {
  it('measures each arm at the participant-visible moment', () => {
    const s = restTurn({ playbackGapMs: 20 }).summary();
    // Arm B's analogue. Text appears before speech does, so a like-for-like
    // comparison requires audio to be timed at playback, which is now the case.
    expect(s.to_first_token_ms).toBeLessThanOrEqual(s.to_first_audio_ms);
  });

  it('omits audio timings entirely rather than reporting a misleading zero', () => {
    // Audio off: no TTS marks at all. The turn still carries to_first_token_ms,
    // so it is not lost from the dataset, just not counted as audio latency.
    const turn = createTurnTimer('A', 't1a');
    turn.mark('sttDone');
    turn.mark('llmSend');
    turn.mark('firstToken');
    const s = turn.summary();
    expect(s.to_first_audio_ms).toBeUndefined();
    expect(s.playback_wait_ms).toBeUndefined();
    expect(s.tts_first_ms).toBeUndefined();
    expect(s.to_first_token_ms).toBeGreaterThanOrEqual(0);
  });
});
