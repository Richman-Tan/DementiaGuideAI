// Says when someone starts and stops speaking, from the microphone's audio.
//
// It goes by loudness against the room: a running estimate of the background
// level, and speech is sound well above it for long enough. That is all it
// knows. It cannot tell a voice from a door slamming, or the person from the
// assistant's own voice coming back through the speakers, which is why the
// turn-taking machine does not act on one of its reports alone: a sound has to
// last before it interrupts, and its words are checked against the assistant's.
//
// It is plain arithmetic on samples, with no audio API in it, so it runs the
// same in an audio worklet, on a phone, or in a test fed with generated sound.

export interface SpeechDetectorConfig {
  sampleRate: number;
  /** The length of one frame of analysis. */
  frameMs: number;
  /** A frame counts as speech when it is this many times louder than the background… */
  ratio: number;
  /** …and at least this loud in itself (RMS, 0 to 1), so a silent room's hiss never counts. */
  minLevel: number;
  /** Once speaking, a frame still counts as speech down to this share of the level needed to start. */
  holdShare: number;
  /** Sound must last this long before a start is reported. A click or a tap is shorter. */
  onsetMs: number;
  /** Quiet must last this long before an end is reported. The gaps between words are shorter. */
  hangoverMs: number;
  /** How fast the background estimate follows the room while it is quiet (share per frame). */
  adaptRate: number;
  /**
   * How fast it follows sound that stays loud (share per frame). Slow, so that
   * speech does not become "background", but not zero: a fan switched on has to
   * stop counting as speech eventually.
   */
  loudAdaptRate: number;
  /** How long the room is listened to before anything is reported. */
  calibrationMs: number;
}

export const DEFAULT_SPEECH_DETECTOR: Omit<SpeechDetectorConfig, 'sampleRate'> = {
  frameMs: 20,
  ratio: 3.5,
  minLevel: 0.01,
  holdShare: 0.6,
  onsetMs: 100,
  hangoverMs: 400,
  adaptRate: 0.05,
  loudAdaptRate: 0.002,
  calibrationMs: 200,
};

export interface SpeechEvent {
  type: 'start' | 'end';
  /** Milliseconds of audio processed when it was decided. */
  atMs: number;
}

export interface SpeechDetector {
  /** Feed audio as it arrives, in pieces of any size. Returns what changed during this piece. */
  process(samples: Float32Array): SpeechEvent[];
  readonly speaking: boolean;
  /** The loudness of the latest frame (RMS, 0 to 1), for a level meter. */
  readonly level: number;
  /** Forget the room and start again, as after the microphone is reopened. */
  reset(): void;
}

export function createSpeechDetector(
  options: Partial<SpeechDetectorConfig> & { sampleRate: number }
): SpeechDetector {
  const config: SpeechDetectorConfig = { ...DEFAULT_SPEECH_DETECTOR, ...options };
  const frameSize = Math.max(1, Math.round((config.sampleRate * config.frameMs) / 1000));

  let sumSquares = 0;
  let filled = 0;
  let frames = 0;
  let background = Infinity; // the quietest frame heard while calibrating
  let speaking = false;
  let loudMs = 0;
  let quietMs = 0;
  let level = 0;

  const reset = () => {
    sumSquares = 0;
    filled = 0;
    frames = 0;
    background = Infinity;
    speaking = false;
    loudMs = 0;
    quietMs = 0;
    level = 0;
  };

  const frame = (events: SpeechEvent[]) => {
    level = Math.sqrt(sumSquares / frameSize);
    sumSquares = 0;
    filled = 0;
    frames += 1;
    const atMs = frames * config.frameMs;

    if (atMs <= config.calibrationMs) {
      background = Math.min(background, level);
      return;
    }

    const startLevel = Math.max(config.minLevel, background * config.ratio);
    const loud = level > (speaking ? startLevel * config.holdShare : startLevel);
    background += (loud ? config.loudAdaptRate : config.adaptRate) * (level - background);

    if (!speaking) {
      loudMs = loud ? loudMs + config.frameMs : 0;
      if (loudMs >= config.onsetMs) {
        speaking = true;
        quietMs = 0;
        events.push({ type: 'start', atMs });
      }
    } else {
      quietMs = loud ? 0 : quietMs + config.frameMs;
      if (quietMs >= config.hangoverMs) {
        speaking = false;
        loudMs = 0;
        events.push({ type: 'end', atMs });
      }
    }
  };

  return {
    process(samples) {
      const events: SpeechEvent[] = [];
      for (let i = 0; i < samples.length; i += 1) {
        const sample = samples[i] as number;
        sumSquares += sample * sample;
        filled += 1;
        if (filled === frameSize) frame(events);
      }
      return events;
    },
    get speaking() {
      return speaking;
    },
    get level() {
      return level;
    },
    reset,
  };
}
