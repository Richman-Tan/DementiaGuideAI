// The speech detector, fed generated sound: room noise, and a steady tone
// standing in for a voice. Times are in milliseconds of audio.
import { createSpeechDetector, DEFAULT_SPEECH_DETECTOR } from './speechDetector.ts';
import type { SpeechDetectorConfig, SpeechEvent } from './speechDetector.ts';

const RATE = 16000;
const ROOM = 0.002; // a quiet room
const VOICE = 0.12; // someone speaking at arm's length

/** Builds a recording from stretches of sound: [milliseconds, loudness]. */
function recording(parts: [number, number][], rate = RATE): Float32Array {
  const total = parts.reduce((n, [ms]) => n + Math.round((ms * rate) / 1000), 0);
  const out = new Float32Array(total);
  let seed = 12345;
  let i = 0;
  for (const [ms, amplitude] of parts) {
    const count = Math.round((ms * rate) / 1000);
    for (let k = 0; k < count; k += 1, i += 1) {
      // Noise for the room; a 180 Hz tone with a little noise for a voice.
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const noise = (seed / 0xffffffff) * 2 - 1;
      out[i] =
        amplitude > 0.02
          ? amplitude * Math.SQRT2 * Math.sin((2 * Math.PI * 180 * i) / rate) + 0.002 * noise
          : amplitude * Math.sqrt(3) * noise;
    }
  }
  return out;
}

/** Runs a recording through a detector in blocks, as an audio worklet would deliver it. */
function detect(
  samples: Float32Array,
  options: { block?: number; rate?: number } & Partial<SpeechDetectorConfig> = {}
) {
  const { block = 128, rate = RATE, ...config } = options;
  const detector = createSpeechDetector({ sampleRate: rate, ...config });
  const events: SpeechEvent[] = [];
  for (let i = 0; i < samples.length; i += block) {
    events.push(...detector.process(samples.subarray(i, Math.min(i + block, samples.length))));
  }
  return { events, detector };
}

const summary = (events: SpeechEvent[]) => events.map((e) => `${e.type} ${e.atMs}`);

describe('createSpeechDetector', () => {
  it('reports nothing for a quiet room', () => {
    expect(detect(recording([[5000, ROOM]])).events).toEqual([]);
    expect(detect(recording([[5000, 0]])).events).toEqual([]);
  });

  it('reports the start of speech once it has lasted, and the end once it has been quiet', () => {
    const { events, detector } = detect(
      recording([
        [1000, ROOM],
        [1500, VOICE],
        [1000, ROOM],
      ])
    );
    // Speech runs from 1,000 to 2,500 ms. The start needs 100 ms of sound and
    // the end 400 ms of quiet; each is decided on a 20 ms frame.
    expect(summary(events)).toEqual(['start 1100', 'end 2900']);
    expect(detector.speaking).toBe(false);
  });

  it('is speaking between the two', () => {
    const { events, detector } = detect(
      recording([
        [1000, ROOM],
        [800, VOICE],
      ])
    );
    expect(summary(events)).toEqual(['start 1100']);
    expect(detector.speaking).toBe(true);
    expect(detector.level).toBeCloseTo(VOICE, 2);
  });

  it('ignores a click or a tap', () => {
    const { events } = detect(
      recording([
        [1000, ROOM],
        [60, 0.4],
        [1000, ROOM],
      ])
    );
    expect(events).toEqual([]);
  });

  it('does not end speech at the gap between words', () => {
    const { events } = detect(
      recording([
        [1000, ROOM],
        [600, VOICE],
        [250, ROOM],
        [600, VOICE],
        [1000, ROOM],
      ])
    );
    expect(summary(events)).toEqual(['start 1100', 'end 2860']);
  });

  it('reports each stretch of speech when the pause between them is long', () => {
    const { events } = detect(
      recording([
        [1000, ROOM],
        [600, VOICE],
        [900, ROOM],
        [600, VOICE],
        [1000, ROOM],
      ])
    );
    expect(summary(events)).toEqual(['start 1100', 'end 2000', 'start 2600', 'end 3500']);
  });

  it('keeps hold of a voice that drops, without needing it as loud as at the start', () => {
    // The voice falls to just over half the level that was needed to start.
    const startLevel = Math.max(
      DEFAULT_SPEECH_DETECTOR.minLevel,
      ROOM * DEFAULT_SPEECH_DETECTOR.ratio
    );
    const { events } = detect(
      recording([
        [1000, ROOM],
        [500, VOICE],
        [1500, startLevel * 0.8],
        [1000, ROOM],
      ]),
      { loudAdaptRate: 0 }
    );
    expect(summary(events)).toEqual(['start 1100', 'end 3400']);
  });

  it('hears a quiet voice in a quiet room, and needs a louder one in a noisy room', () => {
    const quietVoice = 0.03;
    expect(
      summary(
        detect(
          recording([
            [1000, ROOM],
            [800, quietVoice],
          ])
        ).events
      )
    ).toEqual(['start 1100']);
    // The same voice against a television: not three and a half times the room.
    const noisy = 0.015;
    expect(
      detect(
        recording([
          [1000, noisy],
          [800, quietVoice],
        ])
      ).events
    ).toEqual([]);
    expect(
      summary(
        detect(
          recording([
            [1000, noisy],
            [800, VOICE],
          ])
        ).events
      )
    ).toEqual(['start 1100']);
  });

  it('does not count room hiss as speech however quiet the room was to begin with', () => {
    // Silence while calibrating, then ordinary room noise: far more than 3.5
    // times silence, and still below the level any speech reaches.
    const { events } = detect(
      recording([
        [400, 0],
        [3000, 0.006],
      ])
    );
    expect(events).toEqual([]);
  });

  it('hears someone who was already speaking when the microphone opened', () => {
    // No quiet at all before the voice: it must not be taken for the room.
    const { events } = detect(
      recording([
        [1500, VOICE],
        [1000, ROOM],
      ])
    );
    expect(summary(events)).toEqual(['start 300', 'end 1900']);
  });

  it('stops counting a noise that stays, such as a fan switched on', () => {
    const { events, detector } = detect(
      recording([
        [1000, ROOM],
        [30000, 0.05],
      ])
    );
    // It is taken for speech at first, and let go once it has become the room.
    expect(events.map((e) => e.type)).toEqual(['start', 'end']);
    expect(events[1]!.atMs).toBeLessThan(25000);
    expect(detector.speaking).toBe(false);
  });

  it('gives the same answer however the audio is cut into pieces', () => {
    const samples = recording([
      [1000, ROOM],
      [700, VOICE],
      [300, ROOM],
      [500, VOICE],
      [1200, ROOM],
    ]);
    const whole = summary(detect(samples, { block: samples.length }).events);
    expect(summary(detect(samples, { block: 128 }).events)).toEqual(whole);
    expect(summary(detect(samples, { block: 1 }).events)).toEqual(whole);
    expect(summary(detect(samples, { block: 4096 }).events)).toEqual(whole);
    expect(whole).toEqual(['start 1100', 'end 2900']);
  });

  it('works at the sample rate a browser microphone gives', () => {
    const samples = recording(
      [
        [1000, ROOM],
        [800, VOICE],
        [1000, ROOM],
      ],
      48000
    );
    expect(summary(detect(samples, { rate: 48000 }).events)).toEqual(['start 1100', 'end 2200']);
  });

  it('listens to the room afresh after a reset', () => {
    const detector = createSpeechDetector({ sampleRate: RATE });
    detector.process(
      recording([
        [1000, ROOM],
        [500, VOICE],
      ])
    );
    expect(detector.speaking).toBe(true);
    detector.reset();
    expect(detector.speaking).toBe(false);
    expect(detector.level).toBe(0);
    // Times count from the reset, and the calibration runs again.
    const events = detector.process(
      recording([
        [1000, ROOM],
        [500, VOICE],
      ])
    );
    expect(summary(events)).toEqual(['start 1100']);
  });

  it('takes its settings from the caller', () => {
    const samples = recording([
      [1000, ROOM],
      [800, VOICE],
      [1500, ROOM],
    ]);
    expect(summary(detect(samples, { onsetMs: 200, hangoverMs: 1000 }).events)).toEqual([
      'start 1200',
      'end 2800',
    ]);
  });

  it('copes with a frame shorter than one sample', () => {
    const detector = createSpeechDetector({ sampleRate: 10, frameMs: 20 });
    expect(detector.process(new Float32Array([0, 0, 0]))).toEqual([]);
  });
});
