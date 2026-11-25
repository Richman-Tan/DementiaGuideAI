// The open microphone (voice/micInput.js): the stream it asks for, how it is
// wired to the audio worklet, and that the samples the worklet hands over are
// what decide "someone started speaking". The browser's audio is a stand-in;
// the speech detector is real.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openMicInput } from '../src/voice/micInput.js';

let world;

function fakeBrowser({ getUserMedia, addModule, state = 'running' } = {}) {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  world = { track, stream, nodes: [], contexts: [], constraints: null };

  class FakeNode {
    constructor(kind) {
      this.kind = kind;
      this.to = [];
      this.disconnected = false;
      world.nodes.push(this);
    }
    connect(node) {
      this.to.push(node.kind ?? node);
    }
    disconnect() {
      this.disconnected = true;
    }
  }
  class FakeContext {
    constructor() {
      this.sampleRate = 16000;
      this.state = state;
      this.destination = 'output';
      this.closed = false;
      this.resume = vi.fn(async () => {});
      this.audioWorklet = { addModule: vi.fn(addModule ?? (async () => {})) };
      world.contexts.push(this);
    }
    createMediaStreamSource(s) {
      const node = new FakeNode('source');
      node.stream = s;
      return node;
    }
    createGain() {
      const node = new FakeNode('gain');
      node.gain = { value: 1 };
      return node;
    }
    close() {
      this.closed = true;
      return Promise.resolve();
    }
  }
  class FakeWorkletNode extends FakeNode {
    constructor(ctx, name) {
      super('tap');
      this.name = name;
      this.port = { onmessage: null };
    }
  }

  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn(
        getUserMedia ??
          (async (constraints) => {
            world.constraints = constraints;
            return stream;
          })
      ),
    },
  });
  vi.stubGlobal('window', { AudioContext: FakeContext });
  vi.stubGlobal('AudioWorkletNode', FakeWorkletNode);
  return world;
}

/** 20 ms of sound at this loudness, as the worklet posts it. */
const frame = (amplitude) => ({
  data: Float32Array.from({ length: 320 }, (_, i) => amplitude * Math.sin(i / 3)),
});

const tap = () => world.nodes.find((n) => n.kind === 'tap');

beforeEach(() => fakeBrowser());
afterEach(() => vi.unstubAllGlobals());

describe('openMicInput', () => {
  it('asks for the microphone with echo cancellation, and wires it through the tap to a silent output', async () => {
    await openMicInput();
    expect(world.constraints).toEqual({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const ctx = world.contexts[0];
    expect(String(ctx.audioWorklet.addModule.mock.calls[0][0])).toMatch(/pcmTap\.worklet\.js$/);
    expect(tap().name).toBe('pcm-tap');

    const [source, , gain] = world.nodes;
    expect(source.stream).toBe(world.stream);
    expect(source.to).toEqual(['tap']);
    expect(tap().to).toEqual(['gain']);
    expect(gain.to).toEqual(['output']);
    expect(gain.gain.value).toBe(0); // the microphone is never played back
    expect(ctx.resume).not.toHaveBeenCalled();
  });

  it('reports speech starting and stopping from the samples the tap hands over', async () => {
    const onSpeechStart = vi.fn();
    const onSpeechEnd = vi.fn();
    await openMicInput({ onSpeechStart, onSpeechEnd });
    const send = (amplitude, frames) => {
      for (let i = 0; i < frames; i += 1) tap().port.onmessage(frame(amplitude));
    };
    send(0.002, 20); // the room
    expect(onSpeechStart).not.toHaveBeenCalled();
    send(0.2, 10); // 200 ms of voice
    expect(onSpeechStart).toHaveBeenCalledTimes(1);
    expect(onSpeechEnd).not.toHaveBeenCalled();
    send(0.002, 25); // half a second of quiet
    expect(onSpeechEnd).toHaveBeenCalledTimes(1);
  });

  it('works with nobody listening for the reports', async () => {
    await openMicInput();
    for (let i = 0; i < 20; i += 1) tap().port.onmessage(frame(0.002));
    for (let i = 0; i < 10; i += 1) tap().port.onmessage(frame(0.2));
    for (let i = 0; i < 25; i += 1) tap().port.onmessage(frame(0.002));
  });

  it('wakes an audio context the browser started suspended, and uses the prefixed one where needed', async () => {
    const w = fakeBrowser({ state: 'suspended' });
    const Ctx = window.AudioContext;
    vi.stubGlobal('window', { webkitAudioContext: Ctx });
    await openMicInput();
    expect(w.contexts[0].resume).toHaveBeenCalledTimes(1);
  });

  it('releases the microphone and the audio context on close', async () => {
    const mic = await openMicInput({ onSpeechStart: vi.fn() });
    mic.close();
    expect(world.track.stop).toHaveBeenCalledTimes(1);
    expect(world.contexts[0].closed).toBe(true);
    expect(tap().port.onmessage).toBeNull();
    expect(tap().disconnected).toBe(true);
    expect(world.nodes[0].disconnected).toBe(true);
  });

  it.each(['NotAllowedError', 'SecurityError'])(
    'reports a refusal (%s) as a permission error',
    async (name) => {
      fakeBrowser({
        getUserMedia: async () => {
          throw Object.assign(new Error('denied'), { name });
        },
      });
      await expect(openMicInput()).rejects.toMatchObject({
        message: 'Microphone permission denied',
        code: 'permission-denied',
      });
    }
  );

  it('passes any other microphone failure on as it is', async () => {
    fakeBrowser({
      getUserMedia: async () => {
        throw Object.assign(new Error('Requested device not found'), { name: 'NotFoundError' });
      },
    });
    const error = await openMicInput().catch((e) => e);
    expect(error.message).toBe('Requested device not found');
    expect(error.code).toBeUndefined();

    fakeBrowser({ getUserMedia: () => Promise.reject('no devices') });
    expect((await openMicInput().catch((e) => e)).message).toBe('no devices');
  });

  it('lets go of the microphone if the audio cannot be set up', async () => {
    const w = fakeBrowser({
      addModule: async () => {
        throw new Error('worklet failed to load');
      },
    });
    await expect(openMicInput()).rejects.toThrow('worklet failed to load');
    expect(w.track.stop).toHaveBeenCalledTimes(1);
    expect(w.contexts[0].closed).toBe(true);
  });

  it('ignores a context that fails to close', async () => {
    const mic = await openMicInput();
    world.contexts[0].close = () => Promise.reject(new Error('already closed'));
    expect(() => mic.close()).not.toThrow();
    await Promise.resolve();
  });
});
