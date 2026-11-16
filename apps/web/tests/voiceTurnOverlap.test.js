// @vitest-environment jsdom
// One answer at a time. Reported in October 2026: "sometimes the avatar would
// talk overlapping with the answer to the previous question". The voice loop,
// the headless avatar and its audio engine are all REAL here — only the
// network services are fakes, and the AudioContext is a recorder that plays
// nothing — because the defect lived in how they fit together: an interrupted
// answer stayed parked on its playback promise, the next question reset the
// shared "aborted" flag, and the next sentence's end woke the old answer up to
// carry on speaking alongside the new one.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, flush, cleanup } from './helpers/render.js';

vi.mock('../src/avatar/effectiveProfile.js', () => ({
  useEffectiveAvatarProfile: () => ({ id: 'aaron', name: 'Aaron', elevenVoiceId: 'v', openaiVoice: 'onyx', visemeWeights: null }),
}));
vi.mock('../src/services/openaiClient.js', () => ({
  openaiClient: { chatStream: vi.fn(), search: vi.fn(async () => []) },
  mapSourcesToCitations: vi.fn(() => []),
}));
vi.mock('../src/services/ttsClient.js', () => ({ tts: vi.fn() }));
vi.mock('../src/services/ttsModeWeb.js', () => ({ selectTtsMode: vi.fn(async () => 'rest'), markTtsDegraded: vi.fn() }));
vi.mock('../src/services/sttWeb.js', () => ({ startSttSession: vi.fn() }));
vi.mock('../src/lib/latency.js', () => ({ createTurnTimer: vi.fn(() => ({ mark: vi.fn(), finish: vi.fn() })) }));
vi.mock('../src/avatar/unity/unityBridge.js', () => ({ sendBridgeMessage: vi.fn(() => true), setCharacter: vi.fn() }));

const { useVoiceConversation } = await import('../src/voice/useVoiceConversation.js');
const { openaiClient } = await import('../src/services/openaiClient.js');
const { tts } = await import('../src/services/ttsClient.js');
const { startSttSession } = await import('../src/services/sttWeb.js');
const { sendBridgeMessage } = await import('../src/avatar/unity/unityBridge.js');

// ─── a silent AudioContext that records what would have been heard ──────────
// Each sentence's "audio" is its own text, so a decoded buffer knows which
// sentence it is. Nothing plays until a test ends it with finish(text).
let heard;
class RecordingAudioContext {
  constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
  addEventListener() {}
  resume() { return Promise.resolve(); }
  decodeAudioData(buf) {
    return Promise.resolve({ label: new TextDecoder().decode(new Uint8Array(buf)), duration: 1 });
  }
  createAnalyser() { return { fftSize: 0, frequencyBinCount: 256, connect() {} }; }
  createBufferSource() {
    const src = {
      buffer: null,
      onended: null,
      connect() {},
      start() {
        heard.playing.add(src);
        heard.started.push(src.buffer.label);
        heard.maxAtOnce = Math.max(heard.maxAtOnce, heard.playing.size);
      },
      stop() { heard.playing.delete(src); },
    };
    return src;
  }
}

// The sentence reaches its natural end.
const finish = (label) => {
  const src = [...heard.playing].find((s) => s.buffer.label === label);
  if (!src) throw new Error(`"${label}" is not playing (playing: ${[...heard.playing].map((s) => s.buffer.label).join(', ') || 'nothing'})`);
  heard.playing.delete(src);
  src.onended?.();
};

function answer(pieces) {
  return async function* (q, history, cbs) {
    cbs.onRagDone();
    cbs.onLlmSend();
    for (const p of pieces) yield await p;
    cbs.onSources([]);
  };
}

const SETTINGS = { audioResponses: true, voiceSpeed: 'normal', avatarId: 'aaron', handsFree: false, fasterVoice: false, responseStyle: 'balanced' };
// Advance fake time in small steps so the 50 ms gap between sentences and
// every decode/playback promise in between gets to run.
const tick = async (ms = 0) => flush(() => vi.advanceTimersByTimeAsync(ms));
const ticks = async (n = 10) => { for (let i = 0; i < n; i++) await tick(60); };

let avatar;
let result;
async function mount(messages = []) {
  const r = await renderHook((p) => useVoiceConversation(p), {
    initialProps: { enabled: true, avatar, settings: SETTINGS, messages, appendMessage: vi.fn(), muted: false },
  });
  result = r.result;
}
beforeEach(async () => {
  vi.useFakeTimers();
  localStorage.clear();
  vi.clearAllMocks();
  heard = { playing: new Set(), started: [], maxAtOnce: 0 };
  vi.stubGlobal('AudioContext', RecordingAudioContext);
  vi.resetModules(); // a fresh headless avatar (module singleton) per test
  ({ getHeadlessAvatar: avatar } = await import('../src/avatar/headlessAvatar.js'));
  avatar = avatar();
  tts.mockImplementation(async (text) => ({ audio: `data:audio/mpeg;base64,${btoa(text)}`, visemeTimeline: { frames: [], totalDuration: 1 } }));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  await cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a new question never overlaps the previous answer', () => {
  it('tap to interrupt, then ask again: the old answer stays stopped', async () => {
    openaiClient.chatStream
      .mockImplementationOnce(answer(['One. ', 'Two. ', 'Three.']))
      .mockImplementationOnce(answer(['Alpha. ', 'Beta.']));
    await mount();

    await flush(() => { result.current.askText('first'); });
    await ticks();
    expect(heard.started).toEqual(['One.']);
    expect(result.current.vState).toBe('speaking');

    await flush(() => result.current.micTap()); // "Tap to interrupt"
    expect(result.current.vState).toBe('idle');
    expect(heard.playing.size).toBe(0);
    await ticks();

    await flush(() => { result.current.askText('second'); });
    await ticks();
    finish('Alpha.');
    await ticks();
    finish('Beta.');
    await ticks();

    expect(heard.started).toEqual(['One.', 'Alpha.', 'Beta.']);
    expect(heard.maxAtOnce).toBe(1);
    expect(result.current.vState).toBe('idle');
  });

  it('typing a new question while the avatar is speaking replaces the answer', async () => {
    openaiClient.chatStream
      .mockImplementationOnce(answer(['One. ', 'Two. ', 'Three.']))
      .mockImplementationOnce(answer(['Alpha. ', 'Beta.']));
    await mount();

    await flush(() => { result.current.askText('first'); });
    await ticks();
    expect(heard.started).toEqual(['One.']);

    await flush(() => { result.current.askText('second'); }); // barge-in from the message bar
    await ticks();
    finish('Alpha.');
    await ticks();
    finish('Beta.');
    await ticks();

    expect(heard.started).toEqual(['One.', 'Alpha.', 'Beta.']);
    expect(heard.maxAtOnce).toBe(1);
    expect(result.current.vState).toBe('idle');
  });

  it('a spoken question after an interruption is not talked over either', async () => {
    openaiClient.chatStream
      .mockImplementationOnce(answer(['One. ', 'Two.']))
      .mockImplementationOnce(answer(['Alpha. ', 'Beta.']));
    startSttSession.mockImplementation(async () => ({ stop: vi.fn(async () => ({ transcript: 'second', source: 'live' })), cancel: vi.fn() }));
    await mount();

    await flush(() => { result.current.askText('first'); });
    await ticks();
    await flush(() => result.current.micTap()); // interrupt
    await flush(() => result.current.micTap()); // start listening
    expect(result.current.vState).toBe('listening');
    await flush(() => { result.current.micTap(); }); // done talking — the answer follows
    await ticks();
    finish('Alpha.');
    await ticks();
    finish('Beta.');
    await ticks();

    expect(heard.started).toEqual(['One.', 'Alpha.', 'Beta.']);
    expect(heard.maxAtOnce).toBe(1);
    expect(result.current.vState).toBe('idle');
  });

  it('a repeat that was interrupted does not reset the screen in the middle of the next answer', async () => {
    openaiClient.chatStream.mockImplementationOnce(answer(['Alpha. ', 'Beta.']));
    await mount([{ role: 'aria', text: 'Earlier answer.' }]);
    await flush(() => { result.current.repeatLast(); });
    await ticks();
    expect(heard.started).toEqual(['Earlier answer.']);
    await flush(() => result.current.micTap()); // interrupt the repeat

    await flush(() => { result.current.askText('second'); });
    await ticks();
    finish('Alpha.');
    await ticks();
    // Still answering — the repeat's own ending must not report "idle" now,
    // which would let a further question start on top of this one.
    expect(result.current.vState).toBe('speaking');
    finish('Beta.');
    await ticks();
    expect(heard.started).toEqual(['Earlier answer.', 'Alpha.', 'Beta.']);
    expect(heard.maxAtOnce).toBe(1);
    expect(result.current.vState).toBe('idle');
  });
});

const segment = (text, timeline = true) => ({
  audio: `data:audio/mpeg;base64,${btoa(text)}`,
  visemeTimeline: timeline ? { frames: [], totalDuration: 1 } : null,
  emotion: 'neutral',
});

describe('a stopped or superseded turn stays silent', () => {

  it('two questions sent before the screen updates: only the second is answered aloud', async () => {
    openaiClient.chatStream
      .mockImplementationOnce(answer(['One. ', 'Two.']))
      .mockImplementationOnce(answer(['Alpha. ', 'Beta.']));
    await mount();
    await flush(() => { result.current.askText('first'); result.current.askText('second'); });
    await ticks();
    finish('Alpha.');
    await ticks();
    finish('Beta.');
    await ticks();
    expect(heard.started).toEqual(['Alpha.', 'Beta.']);
    expect(result.current.vState).toBe('idle');
  });

  it('an answer whose text failed part-way is silenced by the next question', async () => {
    openaiClient.chatStream
      .mockImplementationOnce(async function* (q, h, cbs) {
        cbs.onRagDone();
        yield 'One. ';
        yield 'Two. ';
        throw new Error('The answer was cut off — please try again.');
      })
      .mockImplementationOnce(answer(['Alpha. ', 'Beta.']));
    await mount();
    await flush(() => { result.current.askText('first'); });
    await ticks();
    // The failure ends the turn on screen while "One." is still sounding.
    expect(result.current).toMatchObject({ vState: 'idle', error: 'The answer was cut off — please try again.' });
    expect([...heard.playing].map((src) => src.buffer.label)).toEqual(['One.']);

    await flush(() => { result.current.askText('second'); });
    await ticks();
    finish('Alpha.');
    await ticks();
    finish('Beta.');
    await ticks();
    expect(heard.started).toEqual(['One.', 'Alpha.', 'Beta.']);
    expect(heard.maxAtOnce).toBe(1);
    expect(result.current.vState).toBe('idle');
  });

  it('a repeat interrupted while its audio is still on the way never plays', async () => {
    let arrive;
    tts.mockImplementationOnce(() => new Promise((r) => { arrive = r; }));
    await mount([{ role: 'aria', text: 'Earlier answer.' }]);
    await flush(() => { result.current.repeatLast(); });
    await ticks();
    expect(result.current.vState).toBe('speaking');
    await flush(() => result.current.micTap()); // interrupt before the audio arrives
    expect(result.current.vState).toBe('idle');
    await flush(() => arrive(segment('Earlier answer.')));
    await ticks();
    expect(heard.started).toEqual([]);
    expect(result.current).toMatchObject({ vState: 'idle', vSubtitle: '' });
  });

  it.each([['with a viseme timeline', true], ['with analyser lipsync', false]])(
    'a sentence stopped while it is still decoding never starts (%s)',
    async (_, timeline) => {
      const playing = avatar.playAudio(segment('Late.', timeline));
      avatar.stopAudio(); // before the decode resolves
      await flush(() => playing); // released by the stop, not by some later sentence
      await ticks();
      expect(heard.started).toEqual([]);
    },
  );
});

describe('the Unity face moves only with sound', () => {
  const sent = () => sendBridgeMessage.mock.calls.map(([m]) => m.type);

  it('a sentence stopped while it is still decoding sends Unity no lip-sync', async () => {
    const { UnityAvatarControllerImpl } = await import('../src/avatar/unity/UnityAvatarController.js');
    const unity = new UnityAvatarControllerImpl('aaron');
    const playing = unity.playAudio(segment('Late.'));
    unity.stopAudio();
    await flush(() => playing);
    await ticks();
    expect(heard.started).toEqual([]);
    expect(sent()).not.toContain('play');
  });

  it('a sentence that plays sends its lip-sync, and its end stops the mouth', async () => {
    const { UnityAvatarControllerImpl } = await import('../src/avatar/unity/UnityAvatarController.js');
    const unity = new UnityAvatarControllerImpl('aaron');
    const playing = unity.playAudio(segment('Hello.'));
    await ticks();
    expect(heard.started).toEqual(['Hello.']);
    expect(sent()).toEqual(['play']);
    finish('Hello.');
    await flush(() => playing);
    expect(sent()).toEqual(['play', 'stop']);
  });
});
