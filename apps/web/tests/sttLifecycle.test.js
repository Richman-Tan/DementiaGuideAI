// The parts of the web speech-to-text session (services/sttWeb.js) that
// sttCascade.test.js does not reach: hands-free endpointing (RMS meter +
// transcript-stability timer), recognizer errors after start, browsers without
// MediaRecorder or without a preferred codec, and tearing a session down so
// the microphone indicator goes off.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/services/openaiClient.js', () => ({
  openaiClient: { transcribe: vi.fn(async () => 'whisper text') },
}));

// ─── browser fakes ───────────────────────────────────────────────────────────
let recognizers;
class FakeRecognition {
  constructor() {
    recognizers.push(this);
  }
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
    queueMicrotask(() => this.onend?.());
  }
  abort() {
    this.aborted = true;
  }
  say(text) {
    this.onresult?.({ results: [[{ transcript: text }]] });
  }
}

// Microphone level the fake analyser reports (normalised RMS == |level|).
let level;
let audioContexts;
class FakeAudioContext {
  constructor() {
    audioContexts.push(this);
    this.closed = false;
  }
  createMediaStreamSource(stream) {
    this.source = stream;
    return {
      connect: (n) => {
        this.connected = n;
      },
    };
  }
  createAnalyser() {
    return { fftSize: 0, getFloatTimeDomainData: (buf) => buf.fill(level) };
  }
  close() {
    this.closed = true;
  }
}

let tracks;
function installMic() {
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn(async () => {
        const t = { stop: vi.fn() };
        tracks.push(t);
        return { getTracks: () => [t] };
      }),
    },
  });
}

let recorders;
function installMediaRecorder({ supported = ['audio/webm;codecs=opus'], bytes = 0 } = {}) {
  class FakeMediaRecorder {
    static isTypeSupported(m) {
      return supported.includes(m);
    }
    constructor(stream, opts) {
      recorders.push(this);
      this.opts = opts;
      this.state = 'inactive';
    }
    start(ms) {
      this.timeslice = ms;
      this.state = 'recording';
    }
    stop() {
      if (this.state === 'inactive') throw new Error('InvalidStateError');
      this.state = 'inactive';
      if (bytes) this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)]) });
      this.ondataavailable?.({ data: new Blob([]) }); // an empty slice is ignored
      queueMicrotask(() => this.onstop?.());
    }
  }
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
}

async function freshModule() {
  vi.resetModules();
  const mod = await import('../src/services/sttWeb.js');
  const { openaiClient } = await import('../src/services/openaiClient.js');
  openaiClient.transcribe.mockClear();
  return { ...mod, transcribe: openaiClient.transcribe };
}

beforeEach(() => {
  recognizers = [];
  audioContexts = [];
  tracks = [];
  recorders = [];
  level = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('hands-free endpointing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { SpeechRecognition: FakeRecognition, AudioContext: FakeAudioContext });
    installMediaRecorder();
    installMic();
  });

  it('meters the microphone through an AnalyserNode on the same stream', async () => {
    const { startSttSession } = await freshModule();
    const session = await startSttSession({ handsFree: true });
    const ctx = audioContexts[0];
    expect(ctx.source).toBeDefined();
    expect(ctx.connected.fftSize).toBe(512);
    session.cancel();
  });

  it('gives up after 8 s with no speech at all, and reports it only once', async () => {
    const { startSttSession } = await freshModule();
    const onEndOfSpeech = vi.fn();
    const session = await startSttSession({ handsFree: true, onEndOfSpeech });
    await vi.advanceTimersByTimeAsync(7950);
    expect(onEndOfSpeech).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(onEndOfSpeech).toHaveBeenCalledTimes(1);
    expect(onEndOfSpeech).toHaveBeenCalledWith({ reason: 'lead-silence' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(onEndOfSpeech).toHaveBeenCalledTimes(1);
    session.cancel();
  });

  it('ends the utterance after 1.2 s of a stable transcript AND a quiet microphone', async () => {
    const { startSttSession } = await freshModule();
    const onEndOfSpeech = vi.fn();
    const onPartial = vi.fn();
    const session = await startSttSession({ handsFree: true, onEndOfSpeech, onPartial });
    level = 0.2; // still talking
    recognizers[0].say('how do I');
    await vi.advanceTimersByTimeAsync(3000);
    expect(onEndOfSpeech).not.toHaveBeenCalled(); // stable text, but loud
    level = 0; // falls quiet
    await vi.advanceTimersByTimeAsync(300);
    expect(onEndOfSpeech).toHaveBeenCalledWith({ reason: 'silence' });
    expect(onPartial).toHaveBeenCalledWith('how do I');
    session.cancel();
  });

  it('a changing transcript keeps the utterance open even when quiet', async () => {
    const { startSttSession } = await freshModule();
    const onEndOfSpeech = vi.fn();
    const session = await startSttSession({ handsFree: true, onEndOfSpeech });
    recognizers[0].say('how');
    await vi.advanceTimersByTimeAsync(1000);
    recognizers[0].say('how do I');
    await vi.advanceTimersByTimeAsync(1000);
    expect(onEndOfSpeech).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(onEndOfSpeech).toHaveBeenCalledTimes(1);
    session.cancel();
  });

  it('cancel releases everything: recognizer, recorder, audio context and mic tracks', async () => {
    const { startSttSession } = await freshModule();
    const session = await startSttSession({ handsFree: true });
    session.cancel();
    expect(recognizers[0].aborted).toBe(true);
    expect(recorders[0].onstop).toBeNull();
    expect(audioContexts[0].closed).toBe(true);
    expect(tracks[0].stop).toHaveBeenCalled();
  });

  it('a failure after the meter is running still closes it and stops the mic', async () => {
    class ThrowingRecognition extends FakeRecognition {
      start() {
        throw new Error('already started');
      }
    }
    vi.stubGlobal('window', {
      SpeechRecognition: ThrowingRecognition,
      AudioContext: FakeAudioContext,
    });
    const { startSttSession } = await freshModule();
    const session = await startSttSession({ handsFree: true });
    expect(session.provider).toBe('whisper'); // degraded
    expect(audioContexts[0].closed).toBe(true);
    expect(tracks[0].stop).toHaveBeenCalled();
    session.cancel();
  });

  it('an audio context that refuses to close does not break teardown', async () => {
    class StubbornContext extends FakeAudioContext {
      close() {
        throw new Error('already closed');
      }
    }
    vi.stubGlobal('window', {
      SpeechRecognition: FakeRecognition,
      webkitAudioContext: StubbornContext,
    });
    const { startSttSession } = await freshModule();
    const session = await startSttSession({ handsFree: true });
    expect(() => session.cancel()).not.toThrow();
    expect(tracks[0].stop).toHaveBeenCalled();
  });
});

describe('recognizer errors after start', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { webkitSpeechRecognition: FakeRecognition });
    installMediaRecorder();
    installMic();
  });

  it('not-allowed becomes a permission-denied error', async () => {
    const { startSttSession } = await freshModule();
    const onError = vi.fn();
    const session = await startSttSession({ onError });
    recognizers[0].onerror({ error: 'not-allowed' });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatchObject({
      message: 'Microphone permission denied',
      code: 'permission-denied',
    });
    session.cancel();
  });

  it('a real recognizer error is reported with its code', async () => {
    const { startSttSession } = await freshModule();
    const onError = vi.fn();
    const session = await startSttSession({ onError });
    recognizers[0].onerror({ error: 'network' });
    expect(onError.mock.calls[0][0].message).toBe('speech recognition error: network');
    session.cancel();
  });

  it('routine no-speech / aborted events, and errors without a code, stay quiet', async () => {
    const { startSttSession } = await freshModule();
    const onError = vi.fn();
    const session = await startSttSession({ onError });
    recognizers[0].onerror({ error: 'no-speech' });
    recognizers[0].onerror({ error: 'aborted' });
    recognizers[0].onerror({});
    expect(onError).not.toHaveBeenCalled();
    session.cancel();
  });

  it('an unchanged or blank partial is not re-announced', async () => {
    const { startSttSession } = await freshModule();
    const onPartial = vi.fn();
    const session = await startSttSession({ onPartial });
    recognizers[0].say('hello');
    recognizers[0].say('hello ');
    recognizers[0].say('   ');
    expect(onPartial).toHaveBeenCalledTimes(1);
    session.cancel();
  });
});

describe('recording support', () => {
  it('without MediaRecorder, both providers fail cleanly and release the mic', async () => {
    vi.stubGlobal('window', { SpeechRecognition: FakeRecognition });
    installMic();
    const { startSttSession } = await freshModule();
    await expect(startSttSession()).rejects.toThrow(/MediaRecorder/);
    expect(tracks).toHaveLength(2); // live attempt, then the Whisper fallback
    for (const t of tracks) expect(t.stop).toHaveBeenCalled();
  });

  it('with no preferred codec, records with the browser default as webm', async () => {
    vi.stubGlobal('window', {});
    installMediaRecorder({ supported: [], bytes: 3000 });
    installMic();
    const { startSttSession, transcribe } = await freshModule();
    const session = await startSttSession();
    expect(recorders[0].opts).toBeUndefined();
    expect(recorders[0].timeslice).toBe(250);
    expect(await session.stop()).toEqual({ transcript: 'whisper text', source: 'whisper' });
    const [blob, name] = transcribe.mock.calls[0];
    expect(blob.type).toBe('audio/webm');
    expect(name).toBe('recording.webm');
  });

  it('Safari: records mp4 and names the upload accordingly', async () => {
    vi.stubGlobal('window', {});
    installMediaRecorder({ supported: ['audio/mp4'], bytes: 3000 });
    installMic();
    const { startSttSession, transcribe } = await freshModule();
    await (await startSttSession()).stop();
    expect(recorders[0].opts).toEqual({ mimeType: 'audio/mp4' });
    expect(transcribe.mock.calls[0][0].type).toBe('audio/mp4');
    expect(transcribe.mock.calls[0][1]).toBe('recording.mp4');
  });

  it('an empty Whisper result is returned as an empty transcript', async () => {
    vi.stubGlobal('window', {});
    installMediaRecorder({ bytes: 3000 });
    installMic();
    const { startSttSession, transcribe } = await freshModule();
    transcribe.mockResolvedValueOnce(undefined);
    expect(await (await startSttSession()).stop()).toEqual({ transcript: '', source: 'whisper' });
  });

  it('a Whisper session that recorded nothing returns empty without uploading', async () => {
    vi.stubGlobal('window', {});
    installMediaRecorder({ bytes: 0 });
    installMic();
    const { startSttSession, transcribe } = await freshModule();
    expect(await (await startSttSession()).stop()).toEqual({ transcript: '', source: 'whisper' });
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('cancelling a Whisper session stops the recorder and the mic', async () => {
    vi.stubGlobal('window', {});
    installMediaRecorder();
    installMic();
    const { startSttSession } = await freshModule();
    const session = await startSttSession();
    session.cancel();
    expect(recorders[0].state).toBe('inactive');
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(() => session.cancel()).not.toThrow(); // stopping twice is tolerated
  });

  it('a mic failure that is not a denial carries the browser’s message', async () => {
    vi.stubGlobal('window', {});
    installMediaRecorder();
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => {
          throw Object.assign(new Error('Requested device not found'), { name: 'NotFoundError' });
        }),
      },
    });
    const { startSttSession } = await freshModule();
    const err = await startSttSession().catch((e) => e);
    expect(err.message).toBe('Requested device not found');
    expect(err.code).toBeUndefined();
  });

  it('a SecurityError from getUserMedia counts as a denial', async () => {
    vi.stubGlobal('window', {});
    installMediaRecorder();
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => {
          throw Object.assign(new Error('insecure'), { name: 'SecurityError' });
        }),
      },
    });
    const { startSttSession } = await freshModule();
    await expect(startSttSession()).rejects.toMatchObject({
      code: 'permission-denied',
      message: 'Microphone permission denied',
    });
  });

  it('a non-Error rejection from getUserMedia is stringified', async () => {
    vi.stubGlobal('window', {});
    installMediaRecorder();
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => {
          throw 'blocked';
        }),
      },
    });
    const { startSttSession } = await freshModule();
    await expect(startSttSession()).rejects.toThrow('blocked');
  });
});
