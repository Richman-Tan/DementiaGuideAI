/* global Buffer */
import { createElevenLabsStream, pcmBase64DurationSec } from './elevenLabsStreamService';

// Minimal WebSocket fake: captures sent payloads, lets tests drive open/message.
class FakeWebSocket {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.onclose?.({}); }
  emitOpen() { this.readyState = 1; this.onopen?.(); }
  emitMessage(obj) { this.onmessage?.({ data: JSON.stringify(obj) }); }
}

describe('pcmBase64DurationSec', () => {
  it('computes duration from 16-bit mono byte length', () => {
    // 22050 samples = 1s = 44100 bytes → base64 length 58800.
    const bytes = new Uint8Array(44100);
    const b64 = Buffer.from(bytes).toString('base64');
    expect(pcmBase64DurationSec(b64, 22050)).toBeCloseTo(1.0, 3);
  });
  it('returns 0 for empty payloads', () => {
    expect(pcmBase64DurationSec('')).toBe(0);
  });
});

describe('createElevenLabsStream', () => {
  const realWebSocket = global.WebSocket;
  beforeEach(() => {
    jest.useFakeTimers();
    FakeWebSocket.instances = [];
    global.WebSocket = FakeWebSocket;
  });
  afterEach(() => {
    global.WebSocket = realWebSocket;
    jest.useRealTimers();
  });

  function makeStream(overrides = {}) {
    const events = { chunks: [], final: 0, errors: [], sentText: [] };
    const stream = createElevenLabsStream({
      apiKey: 'k',
      voiceId: 'voice123',
      onAudioChunk: (c) => events.chunks.push(c),
      onFinal: () => events.final++,
      onError: (e) => events.errors.push(e),
      onTextSent: (t) => events.sentText.push(t),
      ...overrides,
    });
    return { stream, events };
  }

  it('sends BOS config on open and forwards whole words only', () => {
    const { stream, events } = makeStream();
    stream.open();
    const ws = FakeWebSocket.instances[0];
    ws.emitOpen();

    expect(ws.sent[0].xi_api_key).toBe('k');
    expect(ws.sent[0].voice_settings.speed).toBe(0.78);

    stream.sendText('Hello wor');
    // 'Hello ' sent; 'wor' held until the word completes.
    expect(ws.sent[1]).toEqual({ text: 'Hello ' });
    stream.sendText('ld. Next');
    expect(ws.sent[2]).toEqual({ text: 'world. ' });
    // onTextSent mirrors the wire exactly (BOS space + both text sends).
    expect(events.sentText).toEqual([' ', 'Hello ', 'world. ']);
  });

  it('queues text sent before the handshake completes', () => {
    const { stream } = makeStream();
    stream.open();
    stream.sendText('Early tokens here ');
    const ws = FakeWebSocket.instances[0];
    expect(ws.sent).toHaveLength(0); // nothing on the wire yet
    ws.emitOpen();
    expect(ws.sent[0].xi_api_key).toBe('k'); // BOS first
    expect(ws.sent[1]).toEqual({ text: 'Early tokens here ' });
  });

  it('normalizes numbers at the word level so alignment gets real letters', () => {
    const { stream } = makeStream();
    stream.open();
    FakeWebSocket.instances[0].emitOpen();
    stream.sendText('call 0800 late');
    const ws = FakeWebSocket.instances[0];
    // '0800 ' is a complete word → normalized like the REST path would.
    expect(ws.sent[1].text).toBe('call eight hundred ');
  });

  it('flush() forces generation without stealing the next sentence\'s held word', () => {
    const { stream } = makeStream();
    stream.open();
    const ws = FakeWebSocket.instances[0];
    ws.emitOpen();
    stream.sendText('First sentence. Next');
    stream.flush(); // boundary detected by the caller
    const flushMsg = ws.sent.find((m) => m.flush);
    expect(flushMsg).toEqual({ text: ' ', flush: true });
    // 'Next' is still held for the next sentence.
    stream.sendText(' words ');
    expect(ws.sent[ws.sent.length - 1].text).toBe('Next words ');
  });

  it('end() releases held text then closes input with an empty message', () => {
    const { stream } = makeStream();
    stream.open();
    const ws = FakeWebSocket.instances[0];
    ws.emitOpen();
    stream.sendText('Goodbye now.');
    stream.end();
    const texts = ws.sent.map((m) => m.text);
    // 'Goodbye ' went out on sendText; the held 'now.' is released by end().
    expect(texts.slice(1)).toEqual(['Goodbye ', 'now. ', '']);
  });

  it('delivers audio chunks with duration and alignment, then final', () => {
    const { stream, events } = makeStream();
    stream.open();
    const ws = FakeWebSocket.instances[0];
    ws.emitOpen();

    const b64 = Buffer.from(new Uint8Array(4410)).toString('base64'); // 100ms @22050
    ws.emitMessage({ audio: b64, alignment: { chars: ['h', 'i'], charStartTimesMs: [0, 50], charDurationsMs: [50, 50] } });
    expect(events.chunks).toHaveLength(1);
    expect(events.chunks[0].durationSec).toBeCloseTo(0.1, 3);
    expect(events.chunks[0].alignment.chars).toEqual(['h', 'i']);

    ws.emitMessage({ isFinal: true });
    expect(events.final).toBe(1);
    expect(events.errors).toHaveLength(0);
  });

  it('rejects open() when the handshake times out', async () => {
    const { stream } = makeStream();
    const p = stream.open();
    const assertion = expect(p).rejects.toThrow(/open timed out/);
    jest.advanceTimersByTime(4000);
    await assertion;
  });

  it('fires onError once when the socket stalls with input pending', () => {
    const { stream, events } = makeStream();
    stream.open();
    const ws = FakeWebSocket.instances[0];
    ws.emitOpen();
    stream.sendText('Some words here ');
    jest.advanceTimersByTime(7000); // > WS_STALL_TIMEOUT_MS with no audio
    expect(events.errors).toHaveLength(1);
    expect(String(events.errors[0].message)).toMatch(/stalled/);
    // Further failures don't re-fire.
    ws.onerror?.({ message: 'later' });
    expect(events.errors).toHaveLength(1);
  });

  it('treats an unexpected close mid-input as fatal', () => {
    const { stream, events } = makeStream();
    stream.open();
    const ws = FakeWebSocket.instances[0];
    ws.emitOpen();
    stream.sendText('Talking along ');
    ws.close();
    expect(events.errors).toHaveLength(1);
    expect(String(events.errors[0].message)).toMatch(/closed unexpectedly/);
  });

  it('treats a close after end() as completion, not an error', () => {
    const { stream, events } = makeStream();
    stream.open();
    const ws = FakeWebSocket.instances[0];
    ws.emitOpen();
    stream.sendText('All done. ');
    stream.end();
    ws.close(); // server closed without an explicit isFinal
    expect(events.errors).toHaveLength(0);
    expect(events.final).toBe(1);
  });

  it('abort() silences all subsequent callbacks', () => {
    const { stream, events } = makeStream();
    stream.open();
    const ws = FakeWebSocket.instances[0];
    ws.emitOpen();
    stream.sendText('Interrupt me ');
    stream.abort();
    ws.emitMessage({ audio: Buffer.from(new Uint8Array(100)).toString('base64') });
    ws.emitMessage({ isFinal: true });
    expect(events.chunks).toHaveLength(0);
    expect(events.final).toBe(0);
    expect(events.errors).toHaveLength(0);
  });
});
