// Converts ElevenLabs WebSocket per-chunk alignment into viseme frames in
// ABSOLUTE stream time, ready to append to the WebView's live timeline.
//
// Two problems this solves that the one-shot path doesn't have:
//
// 1. Reference-frame ambiguity: each WS message's alignment times may be
//    relative to that chunk OR to the whole stream depending on server
//    behaviour. We detect at runtime: if a chunk's first char start is already
//    at/after the stream position we've accounted for, times are stream-
//    relative and used as-is; otherwise we add the running offset.
//
// 2. Word tearing: a word can be split across WS messages ("medic" + "ation").
//    createVisemeTimeline's G2P pass would render two half-word frame sets.
//    We hold back the trailing partial word (chars after the last whitespace)
//    and prepend it to the next chunk's alignment.
//
// Usage per response turn:
//   const acc = createStreamingVisemeAccumulator({ visemeWeights });
//   ...on each WS message: frames = acc.push(alignment, pcmDurationSec);
//   ...on stream end:      frames = acc.flush();

import { createVisemeTimeline } from './createVisemeTimeline';

const EPSILON_SEC = 0.25; // tolerance when classifying chunk- vs stream-relative times

export function createStreamingVisemeAccumulator({ visemeWeights = null } = {}) {
  let streamOffsetSec = 0;   // cumulative duration of all PCM audio received so far
  let carry = null;          // { characters, starts, ends } — held-back trailing partial word

  const toFrames = (characters, starts, ends) => {
    if (!characters.length) return [];
    const { frames } = createVisemeTimeline(
      {
        characters,
        character_start_times_seconds: starts,
        character_end_times_seconds: ends,
      },
      { visemeWeights: visemeWeights || undefined, streaming: true }
    );
    return frames;
  };

  return {
    /**
     * @param {object} alignment ElevenLabs WS alignment: { chars, charStartTimesMs, charDurationsMs }
     * @param {number} pcmChunkDurationSec duration of the audio that CAME WITH this alignment
     * @returns {{ frames: Array, charTimes: number[] }} viseme frames in absolute
     *   stream time (may be empty while a partial word is held) plus the absolute
     *   start time of every incoming alignment char — the cumulative char count
     *   across pushes is the caller's subtitle-timing join key.
     */
    push(alignment, pcmChunkDurationSec) {
      const chars = alignment?.chars ?? [];
      const startsMs = alignment?.charStartTimesMs ?? [];
      const durationsMs = alignment?.charDurationsMs ?? [];
      if (!chars.length) {
        streamOffsetSec += pcmChunkDurationSec || 0;
        return { frames: [], charTimes: [] };
      }

      // Normalize to absolute stream seconds.
      const firstStartSec = startsMs[0] / 1000;
      const chunkRelative = firstStartSec < streamOffsetSec - EPSILON_SEC;
      const base = chunkRelative ? streamOffsetSec : 0;

      let characters = chars.slice();
      let starts = startsMs.map((ms) => base + ms / 1000);
      let ends = startsMs.map((ms, i) => base + (ms + (durationsMs[i] ?? 0)) / 1000);
      const charTimes = starts.slice(); // times for the incoming chars only (pre-carry)

      // Prepend the carried partial word from the previous chunk.
      if (carry) {
        characters = carry.characters.concat(characters);
        starts = carry.starts.concat(starts);
        ends = carry.ends.concat(ends);
        carry = null;
      }

      // Hold back the trailing partial word (no whitespace after it yet) so
      // G2P sees whole words. If the chunk is ALL one partial word, carry it
      // entirely and emit nothing yet.
      let lastSpace = -1;
      for (let i = characters.length - 1; i >= 0; i--) {
        if (/\s/.test(characters[i])) { lastSpace = i; break; }
      }
      if (lastSpace >= 0 && lastSpace < characters.length - 1) {
        carry = {
          characters: characters.slice(lastSpace + 1),
          starts: starts.slice(lastSpace + 1),
          ends: ends.slice(lastSpace + 1),
        };
        characters = characters.slice(0, lastSpace + 1);
        starts = starts.slice(0, lastSpace + 1);
        ends = ends.slice(0, lastSpace + 1);
      } else if (lastSpace < 0) {
        carry = { characters, starts, ends };
        characters = [];
        starts = [];
        ends = [];
      }

      streamOffsetSec += pcmChunkDurationSec || 0;
      return { frames: toFrames(characters, starts, ends), charTimes };
    },

    /** Emit any held-back trailing word at stream end. */
    flush() {
      if (!carry) return { frames: [], charTimes: [] };
      const { characters, starts, ends } = carry;
      carry = null;
      return { frames: toFrames(characters, starts, ends), charTimes: [] };
    },

    /** Total seconds of audio pushed so far (the stream-time clock). */
    getStreamOffsetSec: () => streamOffsetSec,
  };
}
