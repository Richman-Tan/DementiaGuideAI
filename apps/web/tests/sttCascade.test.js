// The web speech-to-text cascade (services/sttWeb.js): live Web Speech first,
// a parallel recording kept for a Whisper rescue when the live result is empty,
// and a sticky degrade to the Whisper-only provider after one live start
// failure. These are the thresholds and the ordering the study relies on when
// it reports STT fallbacks per arm — none of them was asserted anywhere.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/services/openaiClient.js', () => ({
  openaiClient: { transcribe: vi.fn(async () => 'rescued text') },
}));
vi.mock('../src/study/events.js', () => ({ emit: vi.fn() }));

// ─── browser fakes ──────────────────────────────────────────────────────────
let recognizers = [];
function installSpeechRecognition({ startThrows = null } = {}) {
  class FakeRecognition {
    constructor() { recognizers.push(this); this.started = false; }
    start() {
      if (startThrows) throw startThrows;
      this.started = true;
    }
    stop() { this.stopped = true; queueMicrotask(() => this.onend?.()); }
    abort() { this.aborted = true; }
    // Test helper: deliver a partial the way Chrome does.
    say(text) { this.onresult?.({ results: [[{ transcript: text }]] }); }
  }
  vi.stubGlobal('window', { SpeechRecognition: FakeRecognition });
  return FakeRecognition;
}

function installMediaRecorder(blobBytes) {
  class FakeMediaRecorder {
    static isTypeSupported(m) { return m === 'audio/webm;codecs=opus'; }
    constructor(stream, opts) { this.state = 'inactive'; this.mimeType = opts?.mimeType; }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      if (blobBytes > 0) this.ondataavailable?.({ data: new Blob([new Uint8Array(blobBytes)]) });
      queueMicrotask(() => this.onstop?.());
    }
  }
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
}

function installMic({ deny = false } = {}) {
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn(async () => {
        if (deny) { const e = new Error('denied'); e.name = 'NotAllowedError'; throw e; }
        return { getTracks: () => [{ stop() {} }] };
      }),
    },
  });
}

async function freshModule() {
  vi.resetModules();
  const mod = await import('../src/services/sttWeb.js');
  const { openaiClient } = await import('../src/services/openaiClient.js');
  const { emit } = await import('../src/study/events.js');
  openaiClient.transcribe.mockClear();
  emit.mockClear();
  return { ...mod, transcribe: openaiClient.transcribe, emit };
}

beforeEach(() => {
  recognizers = [];
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('live provider', () => {
  it('configures the recognizer for en-NZ, continuous, with interim results', async () => {
    installSpeechRecognition(); installMediaRecorder(0); installMic();
    const { startSttSession } = await freshModule();
    const session = await startSttSession();
    expect(session.provider).toBe('web-speech');
    const rec = recognizers[0];
    expect(rec.lang).toBe('en-NZ');
    expect(rec.continuous).toBe(true);
    expect(rec.interimResults).toBe(true);
    expect(rec.started).toBe(true);
    session.cancel();
  });

  it('returns the live transcript with source "live" and never calls Whisper', async () => {
    installSpeechRecognition(); installMediaRecorder(10000); installMic();
    const { startSttSession, transcribe } = await freshModule();
    const onPartial = vi.fn();
    const session = await startSttSession({ onPartial });
    recognizers[0].say('how do I ');
    recognizers[0].say('how do I help mum sleep');
    const out = await session.stop();
    expect(out).toEqual({ transcript: 'how do I help mum sleep', source: 'live' });
    expect(onPartial).toHaveBeenLastCalledWith('how do I help mum sleep');
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('rescues an empty live result through Whisper only when the recording exceeds 4096 bytes', async () => {
    installSpeechRecognition(); installMediaRecorder(4097); installMic();
    let m = await freshModule();
    let out = await (await m.startSttSession()).stop();
    expect(m.transcribe).toHaveBeenCalledTimes(1);
    expect(m.transcribe.mock.calls[0][1]).toBe('recording.webm');
    expect(out).toEqual({ transcript: 'rescued text', source: 'whisper-rescue' });

    installMediaRecorder(4096);
    m = await freshModule();
    out = await (await m.startSttSession()).stop();
    expect(m.transcribe).not.toHaveBeenCalled();
    expect(out).toEqual({ transcript: '', source: 'live' });
  });

  it('records a failed rescue as a fallback event and returns empty', async () => {
    installSpeechRecognition(); installMediaRecorder(9000); installMic();
    const m = await freshModule();
    m.transcribe.mockRejectedValueOnce(new Error('whisper 500'));
    const out = await (await m.startSttSession()).stop();
    expect(out).toEqual({ transcript: '', source: 'live' });
    expect(m.emit).toHaveBeenCalledWith('fallback', expect.objectContaining({ kind: 'stt_rescue_failed' }));
  });
});

describe('sticky degrade', () => {
  it('a live start failure that is not permission-denied switches to Whisper for the rest of the session', async () => {
    installSpeechRecognition({ startThrows: new Error('recognizer already started') });
    installMediaRecorder(5000); installMic();
    const m = await freshModule();

    const first = await m.startSttSession();
    expect(first.provider).toBe('whisper');
    expect(m.emit).toHaveBeenCalledWith('fallback', expect.objectContaining({ kind: 'stt_whisper' }));
    expect(recognizers).toHaveLength(1);

    // Live would work now — but the degrade is sticky.
    installSpeechRecognition();
    const second = await m.startSttSession();
    expect(second.provider).toBe('whisper');
    expect(recognizers).toHaveLength(1);
    expect(m.emit).toHaveBeenCalledTimes(1); // recorded once, not per session
  });

  it('permission-denied is rethrown, not degraded — the participant is told, not silently moved to Whisper', async () => {
    installSpeechRecognition(); installMediaRecorder(5000); installMic({ deny: true });
    const m = await freshModule();
    await expect(m.startSttSession()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(m.emit).not.toHaveBeenCalled();
  });

  it('goes straight to Whisper when the browser has no SpeechRecognition at all', async () => {
    vi.stubGlobal('window', {});
    installMediaRecorder(5000); installMic();
    const m = await freshModule();
    expect(m.isLiveRecognitionAvailable()).toBe(false);
    expect((await m.startSttSession()).provider).toBe('whisper');
  });
});

describe('whisper provider', () => {
  it('skips the upload for recordings under 2048 bytes and returns empty', async () => {
    vi.stubGlobal('window', {}); installMediaRecorder(2047); installMic();
    const m = await freshModule();
    const out = await (await m.startSttSession()).stop();
    expect(out).toEqual({ transcript: '', source: 'whisper' });
    expect(m.transcribe).not.toHaveBeenCalled();
  });

  it('uploads recordings of 2048 bytes or more', async () => {
    vi.stubGlobal('window', {}); installMediaRecorder(2048); installMic();
    const m = await freshModule();
    const out = await (await m.startSttSession()).stop();
    expect(m.transcribe).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ transcript: 'rescued text', source: 'whisper' });
  });
});
