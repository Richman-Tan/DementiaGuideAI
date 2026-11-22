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
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.onclose?.({});
  }
  emitOpen() {
    this.readyState = 1;
    this.onopen?.();
  }
  emitMessage(obj) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
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
    stream.sendText('Take 2 tablets daily');
    const ws = FakeWebSocket.instances[0];
    // Complete words → normalized like the REST path would.
    expect(ws.sent[1].text).toBe('Take two tablets ');
  });

  // Phone numbers arrive over several tokens, and "call" can arrive before the
  // "111" it introduces. Each piece must be spoken as the REST path speaks the
  // whole sentence: digit by digit, never "one hundred eleven".
  describe('phone numbers across tokens', () => {
    const texts = (ws) => ws.sent.slice(1).map((m) => (m.flush ? `${m.text}[flush]` : m.text));
    const open = () => {
      const made = makeStream();
      made.stream.open();
      FakeWebSocket.instances[0].emitOpen();
      return { ...made, ws: FakeWebSocket.instances[0] };
    };

    it('holds a number until it is complete, then speaks it whole', () => {
      const { stream, ws, events } = open();
      for (const t of ['Call', ' Health', 'line', ' on', ' 080', '0', ' 611', ' 116', '.', ' Then'])
        stream.sendText(t);
      expect(texts(ws)).toEqual([
        'Call Healthline on oh eight hundred, six one one, one one six. ',
      ]);
      // onTextSent still mirrors the wire, so subtitle offsets stay in step.
      expect(events.sentText).toEqual([
        ' ',
        'Call Healthline on oh eight hundred, six one one, one one six. ',
      ]);
    });

    it('keeps "call" with the 111 that follows it', () => {
      const { stream, ws } = open();
      for (const t of ['Please', ' call', ' 111', ' now', '.', ' Stay']) stream.sendText(t);
      // 'call ' alone, then '111 ' alone, used to read "one hundred eleven".
      expect(texts(ws)).toEqual(['Please ', 'call one one one now. ']);
    });

    it('flush() sends a clause that ends in its partial word, with the number', () => {
      const { stream, ws } = open();
      for (const t of ['If he falls,', ' call', ' 111', ',']) stream.sendText(t);
      stream.flush(); // the caller split early at that comma
      stream.sendText(' ');
      expect(texts(ws)).toEqual(['If he ', 'falls, ', 'call one one one, ', ' [flush]']);
    });

    it('flush() sends held words that end with the clause comma', () => {
      const { stream, ws } = open();
      stream.sendText('Then call them on 111, and');
      stream.flush();
      expect(texts(ws)).toEqual(['Then ', 'call them on one one one, ', ' [flush]']);
    });

    it('flush() keeps held words that belong to text still open', () => {
      const { stream, ws } = open();
      stream.sendText('Alzheimers New Zealand, on 0800 004 001');
      stream.flush(); // an early split at the earlier comma, mid-number
      stream.sendText('. Next');
      expect(texts(ws)).toEqual([
        'Alzheimers New Zealand, ',
        ' [flush]',
        'on oh eight hundred, oh oh four, oh oh one. ',
      ]);
    });

    it('flush() sends held words before the break and leaves a closing word without digits, as before', () => {
      const { stream, ws } = open();
      stream.sendText('It is at the right time.\n\nNext');
      stream.flush();
      expect(texts(ws)).toEqual(['It is ', 'at the right ', ' [flush]']);
      stream.sendText(' one ');
      expect(texts(ws).slice(-1)).toEqual(['time.\n\nNext one ']);
    });

    it('flush() takes a closing word with digits along at the end of the reply', () => {
      const { stream, ws } = open();
      stream.sendText('Call Healthline on 0800 611 116.');
      stream.flush();
      stream.end();
      expect(texts(ws)).toEqual([
        'Call Healthline on oh eight hundred, six one one, one one six. ',
        ' [flush]',
        '',
      ]);
    });

    it('end() releases held words together with the partial word', () => {
      const { stream, ws } = open();
      stream.sendText('Call 0800 611 116');
      stream.end();
      expect(texts(ws)).toEqual(['Call oh eight hundred, six one one, one one six [flush]', '']);
    });
  });

  it("flush() forces generation without stealing the next sentence's held word", () => {
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
    ws.emitMessage({
      audio: b64,
      alignment: { chars: ['h', 'i'], charStartTimesMs: [0, 50], charDurationsMs: [50, 50] },
    });
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

  it('rejects open() when the WebSocket constructor throws, without arming the timeout', async () => {
    global.WebSocket = class {
      constructor() {
        throw new Error('bad url');
      }
    };
    const { stream } = makeStream();
    await expect(stream.open()).rejects.toThrow('bad url');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rejects open() when the BOS config cannot be sent', async () => {
    const { stream, events } = makeStream();
    const p = stream.open();
    const ws = FakeWebSocket.instances[0];
    ws.send = () => {
      throw new Error('socket not writable');
    };
    ws.emitOpen();
    await expect(p).rejects.toThrow('socket not writable');
    // The handshake never completed, so onTextSent never saw the BOS space.
    expect(events.sentText).toEqual([]);
  });

  it('rejects open() on a socket error during the handshake, naming the cause', async () => {
    const { stream, events } = makeStream();
    const p = stream.open();
    FakeWebSocket.instances[0].onerror({ message: 'ECONNREFUSED' });
    await expect(p).rejects.toThrow('ElevenLabs WS connection error: ECONNREFUSED');
    // A failed open is reported through the promise, not onError.
    expect(events.errors).toHaveLength(0);
    expect(stream.isDead).toBe(true);
    // The open timeout was cleared: nothing fires later.
    jest.advanceTimersByTime(10000);
    expect(events.errors).toHaveLength(0);
  });

  it('rejects open() on a handshake error that carries no message', async () => {
    const { stream } = makeStream();
    const p = stream.open();
    FakeWebSocket.instances[0].onerror({});
    await expect(p).rejects.toThrow(/^ElevenLabs WS connection error$/);
  });

  it('fires onError once for a socket error after the handshake', () => {
    const { stream, events } = makeStream();
    stream.open();
    const ws = FakeWebSocket.instances[0];
    ws.emitOpen();
    ws.onerror({ message: 'reset by peer' });
    expect(events.errors.map((e) => e.message)).toEqual(['ElevenLabs WS error: reset by peer']);
    expect(stream.isDead).toBe(true);
  });

  it('reports a server error message as fatal, preferring its message over its code', () => {
    const { stream, events } = makeStream();
    stream.open();
    const ws = FakeWebSocket.instances[0];
    ws.emitOpen();
    ws.emitMessage({ error: 'quota_exceeded', message: 'You have run out of characters' });
    expect(events.errors).toHaveLength(1);
    expect(events.errors[0].message).toBe(
      'ElevenLabs stream error: You have run out of characters'
    );
    expect(ws.readyState).toBe(3); // the socket is closed on the way out
  });

  it('falls back to the error code when the server sends no message', () => {
    const { stream, events } = makeStream();
    stream.open();
    const ws = FakeWebSocket.instances[0];
    ws.emitOpen();
    ws.emitMessage({ error: 'invalid_api_key' });
    expect(events.errors[0].message).toBe('ElevenLabs stream error: invalid_api_key');
  });

  it('fails the stream once if a send throws mid-turn, and stops sending', () => {
    const { stream, events } = makeStream();
    stream.open();
    const ws = FakeWebSocket.instances[0];
    ws.emitOpen();
    ws.send = () => {
      throw new Error('socket closed');
    };
    stream.sendText('First words here ');
    expect(events.errors.map((e) => e.message)).toEqual(['socket closed']);
    // The failed text was never confirmed as sent.
    expect(events.sentText).toEqual([' ']);
    stream.sendText('more words ');
    stream.flush();
    stream.end();
    expect(events.errors).toHaveLength(1);
  });

  it('stops flushing queued text at the first send that fails during open', () => {
    const { stream, events } = makeStream();
    stream.open();
    stream.sendText('Early words ');
    stream.sendText('more early words ');
    const ws = FakeWebSocket.instances[0];
    let calls = 0;
    const realSend = ws.send.bind(ws);
    // BOS goes through; the first queued payload fails.
    ws.send = (data) => {
      calls++;
      if (calls > 1) throw new Error('write after close');
      realSend(data);
    };
    ws.emitOpen();
    expect(ws.sent).toHaveLength(1); // BOS only
    expect(calls).toBe(2); // the second queued payload was never attempted
    expect(events.errors.map((e) => e.message)).toEqual(['write after close']);
  });

  it('ignores a frame that is not JSON', () => {
    const { stream, events } = makeStream();
    stream.open();
    const ws = FakeWebSocket.instances[0];
    ws.emitOpen();
    ws.onmessage({ data: 'not json' });
    expect(events.chunks).toHaveLength(0);
    expect(events.errors).toHaveLength(0);
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
