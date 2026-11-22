// What the latency marks mean.
//
// A text answer and a spoken answer are only comparable if both are measured at
// the same point in the user's experience: text at the moment it appears
// (`to_first_token_ms`), speech at the moment it becomes audible
// (`to_first_audio_ms`).
//
// `firstAudio` was once marked when the TTS response resolved, which on the REST
// path happens before the audio is queued, decoded and played, so speech looked
// faster than it was. These tests pin the corrected meaning.
import { describe, it, expect, vi } from 'vitest';
import { createTurnTimer } from '../src/lib/latency.js';

/** Marks in the order the REST path produces them, with a gap before playback. */
function restTurn({ playbackGapMs = 0 } = {}) {
  const turn = createTurnTimer();
  turn.mark('sttDone');
  turn.mark('ragDone');
  turn.mark('llmSend');
  turn.mark('firstToken');
  turn.mark('firstSentence');
  turn.mark('ttsRequest');
  turn.mark('ttsResponse');
  if (playbackGapMs) {
    const until = Date.now() + playbackGapMs;
    while (Date.now() < until) {
      /* deliberate busy wait: marks use a real clock */
    }
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

describe('text and speech stay comparable', () => {
  it('measures each arm at the participant-visible moment', () => {
    const s = restTurn({ playbackGapMs: 20 }).summary();
    // The text analogue. Text appears before speech does, so a like-for-like
    // comparison requires audio to be timed at playback, which is now the case.
    expect(s.to_first_token_ms).toBeLessThanOrEqual(s.to_first_audio_ms);
  });

  it('omits audio timings entirely rather than reporting a misleading zero', () => {
    // Audio off: no TTS marks at all. The turn still carries to_first_token_ms,
    // so it is not lost from the dataset, just not counted as audio latency.
    const turn = createTurnTimer();
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

describe('finish', () => {
  it('prints one [LATENCY SUMMARY] line that parse-latency.mjs can read', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const turn = createTurnTimer();
    turn.mark('llmSend');
    turn.mark('firstToken');
    const s = turn.finish();
    expect(log).toHaveBeenCalledTimes(1);
    const line = log.mock.calls[0][0];
    expect(line.startsWith('[LATENCY SUMMARY] ')).toBe(true);
    expect(JSON.parse(line.slice('[LATENCY SUMMARY] '.length))).toEqual(s);
    log.mockRestore();
  });

  it('prints nothing for a turn with no marks', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(createTurnTimer().finish()).toEqual({});
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('ignores a repeated mark of the same name', () => {
    const turn = createTurnTimer();
    turn.mark('firstToken');
    const first = turn.summary().to_first_token_ms;
    turn.mark('firstToken');
    expect(turn.summary().to_first_token_ms).toBe(first);
  });
});
