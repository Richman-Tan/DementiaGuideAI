// @vitest-environment jsdom
// The web voice loop (voice/useVoiceConversation.js): mic → STT → (speculative)
// RAG + streamed LLM → sentence queue → TTS (REST or the ElevenLabs WebSocket
// stream with its viseme clock) → avatar playback with synced subtitles, and
// the study events each turn emits. Every provider is a recording fake; the
// sentence splitter, sentiment, study store and credential copy are real.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, flush, settle, cleanup } from './helpers/render.js';
import { saveStudy } from '../src/study/studyStore.js';
import { saveKeys } from '../src/state/keysStore.js';
import { mapSettingsToRag } from '../src/state/mapSettingsToRag.js';
import { MODALITY_SPOKEN, MODALITY_TYPED } from '@core/study/studyConfig.mjs';
import { ELEVEN_STREAM_SAMPLE_RATE } from '@core/voice/voiceConfig';

const fx = vi.hoisted(() => ({ profile: null, streams: [], accumulators: [], specs: [], timers: [] }));

vi.mock('../src/avatar/effectiveProfile.js', () => ({ useEffectiveAvatarProfile: () => fx.profile }));
vi.mock('../src/services/openaiClient.js', () => ({
  openaiClient: { chatStream: vi.fn(), search: vi.fn(async () => ['searched']) },
  mapSourcesToCitations: vi.fn((sources) => (sources || []).map((s) => ({ num: s.num, title: s.title }))),
}));
vi.mock('../src/services/ttsClient.js', () => ({ tts: vi.fn() }));
vi.mock('../src/services/ttsModeWeb.js', () => ({ selectTtsMode: vi.fn(async () => 'rest'), markTtsDegraded: vi.fn() }));
vi.mock('../src/services/sttWeb.js', () => ({ startSttSession: vi.fn() }));
vi.mock('../src/study/latency.js', () => ({
  createTurnTimer: vi.fn(() => {
    const t = { marks: [] };
    t.mark = vi.fn((name) => t.marks.push(name));
    t.finish = vi.fn();
    fx.timers.push(t);
    return t;
  }),
}));
vi.mock('../src/study/events.js', () => ({ emit: vi.fn(), newUuid: vi.fn(() => 'turn-uuid') }));
vi.mock('@core/tts/elevenLabsStreamService', () => ({
  createElevenLabsStream: vi.fn((opts) => {
    const s = { opts, open: vi.fn(async () => {}), flush: vi.fn(), end: vi.fn(), abort: vi.fn() };
    // The real stream reports each piece of text as it goes out.
    s.sendText = vi.fn((text) => opts.onTextSent(text));
    fx.streams.push(s);
    return s;
  }),
}));
vi.mock('@core/lipsync/streamingVisemeAccumulator', () => ({
  createStreamingVisemeAccumulator: vi.fn((opts) => {
    const a = {
      opts,
      push: vi.fn((alignment) => ({ frames: alignment.frames, charTimes: alignment.charTimes })),
      flush: vi.fn(() => ({ frames: ['tail-frame'] })),
    };
    fx.accumulators.push(a);
    return a;
  }),
}));
vi.mock('@core/voice/speculativeRetrieval', () => ({
  createSpeculativeRag: vi.fn(({ search }) => {
    const s = { search, onPartial: vi.fn(), resolve: vi.fn(async () => ({ status: 'miss' })), cancel: vi.fn() };
    fx.specs.push(s);
    return s;
  }),
}));

const { useVoiceConversation } = await import('../src/voice/useVoiceConversation.js');
const { openaiClient, mapSourcesToCitations } = await import('../src/services/openaiClient.js');
const { tts } = await import('../src/services/ttsClient.js');
const { selectTtsMode, markTtsDegraded } = await import('../src/services/ttsModeWeb.js');
const { startSttSession } = await import('../src/services/sttWeb.js');
const { emit } = await import('../src/study/events.js');
const { createTurnTimer } = await import('../src/study/latency.js');

// ─── fakes ───────────────────────────────────────────────────────────────────
const deferred = () => { let resolve; let reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

function fakeAvatar({ streaming = false } = {}) {
  const a = { supportsStreamingAudio: streaming };
  a.playAudio = vi.fn(async () => {});
  a.stopAudio = vi.fn();
  a.setSpeechEmotion = vi.fn();
  a.unlockAudio = vi.fn();
  a.setOnAudioStart = vi.fn((cb) => { a.onStart = cb; });
  a.startStreamingPlayback = vi.fn();
  a.appendAudioChunk = vi.fn();
  a.endStreamingPlayback = vi.fn(async () => {});
  return a;
}

// chatStream that yields `pieces`, reporting `sources` at the end. A piece
// that is a promise is awaited first (to pause the stream mid-answer).
function answer(pieces, { sources = [] } = {}) {
  return async function* (q, history, cbs) {
    cbs.onRagDone();
    cbs.onLlmSend();
    for (const p of pieces) yield await p;
    cbs.onSources(sources);
  };
}

function fakeSession(transcript = 'how do I help') {
  return { stop: vi.fn(async () => ({ transcript, source: 'live' })), cancel: vi.fn() };
}

const SETTINGS = { audioResponses: true, voiceSpeed: 'normal', avatarId: 'aaron', handsFree: false, fasterVoice: false, responseStyle: 'balanced' };
let current;
async function mountVoice(over = {}) {
  const props = { enabled: true, avatar: fakeAvatar(), settings: SETTINGS, messages: [], appendMessage: vi.fn(), muted: false, ...over };
  const r = await renderHook((p) => useVoiceConversation(p), { initialProps: props });
  current = { ...r, props };
  return current;
}

const tick = (ms = 0) => flush(() => vi.advanceTimersByTimeAsync(ms));
// Run a hook action to completion, letting every fake timer it schedules fire.
async function run(action) {
  let p;
  await flush(() => { p = action(); });
  for (let i = 0; i < 40; i++) await tick(2000);
  await flush(() => p);
}
const spoken = (text) => ({ audio: `data:${text}`, visemeTimeline: { frames: [text] } });

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  fx.profile = { id: 'aaron', name: 'Aaron', elevenVoiceId: 'voice-aaron', openaiVoice: 'onyx', visemeWeights: null };
  fx.streams.length = 0;
  fx.accumulators.length = 0;
  fx.specs.length = 0;
  fx.timers.length = 0;
  vi.clearAllMocks();
  openaiClient.chatStream.mockImplementation(answer(['Rest helps. ', 'Try a routine.']));
  tts.mockImplementation(async (text) => spoken(text));
  selectTtsMode.mockResolvedValue('rest');
  startSttSession.mockImplementation(async () => fakeSession());
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── typed turns, REST audio ─────────────────────────────────────────────────
describe('a typed question with REST audio', () => {
  it('speaks each sentence in order, then records the answer and the turn', async () => {
    saveStudy({ sessionId: 'sess', accessCode: 'study-access-code-0001', armOrder: 'AB', stageIndex: 0, step: 'task', taskId: 't3', consentTranscripts: true });
    const sources = [{ id: 's1', num: 1, title: 'Sleep' }, { num: 2, title: 'Routine' }, { title: 'x' }];
    openaiClient.chatStream.mockImplementation(answer(['Rest helps. ', 'Try a routine.'], { sources }));
    const history = [
      { role: 'user', text: 'Earlier question' },
      { role: 'aria', text: 'Earlier answer' },
      { role: 'aria', text: '', streaming: false },
      { role: 'aria', text: 'half', streaming: true },
    ];
    const { result, props } = await mountVoice({ messages: history });
    await run(() => result.current.askText('  How do I help him sleep?  '));

    const [q, hist, cbs, opts] = openaiClient.chatStream.mock.calls[0];
    expect(q).toBe('How do I help him sleep?');
    expect(hist).toEqual([{ role: 'user', content: 'Earlier question' }, { role: 'assistant', content: 'Earlier answer' }]);
    expect(typeof cbs.onSources).toBe('function');
    expect(opts).toEqual({ ...mapSettingsToRag(SETTINGS), skipThrottle: true, preRetrievedChunks: null });

    const ttsOpts = { speechRate: 0.78, visemeWeights: null, elevenVoiceId: 'voice-aaron', openaiVoice: 'onyx' };
    expect(tts.mock.calls).toEqual([['Rest helps.', ttsOpts], ['Try a routine.', ttsOpts]]);
    expect(props.avatar.playAudio.mock.calls.map(([seg]) => seg.text)).toEqual(['Rest helps.', 'Try a routine.']);
    expect(props.avatar.playAudio.mock.calls[0][0]).toMatchObject({ audio: 'data:Rest helps.', visemeTimeline: { frames: ['Rest helps.'] }, emotion: expect.any(String) });
    expect(props.avatar.setSpeechEmotion).toHaveBeenCalledTimes(2);

    expect(props.appendMessage.mock.calls).toEqual([
      [{ role: 'user', text: 'How do I help him sleep?' }],
      [{ role: 'aria', text: 'Rest helps. Try a routine.', citations: mapSourcesToCitations(sources), sources, safety: false, turnId: 'turn-uuid' }],
    ]);
    const timer = fx.timers[0];
    expect(createTurnTimer).toHaveBeenCalledWith('A', 't3');
    expect(timer.marks).toEqual(expect.arrayContaining(['ragDone', 'llmSend', 'firstToken', 'firstSentence', 'ttsRequest', 'ttsResponse', 'firstAudio']));
    expect(timer.finish).toHaveBeenCalledWith({ modality: MODALITY_TYPED, streaming: false, aborted: false });
    expect(emit).toHaveBeenCalledWith('turn_start', { arm: 'A', taskId: 't3', modality: MODALITY_TYPED, chars: 24, avatar: 'aaron' });
    expect(emit).toHaveBeenCalledWith('turn', {
      arm: 'A', taskId: 't3', turnId: 'turn-uuid', modality: MODALITY_TYPED, avatar: 'aaron',
      question: 'How do I help him sleep?', answer: 'Rest helps. Try a routine.', sourceIds: ['s1', 2, null], aborted: false,
    });
    expect(result.current).toMatchObject({ vState: 'idle', vSubtitle: '', error: null });
  });

  it('shows "thinking", then "speaking" with the current sentence as subtitle', async () => {
    const play = deferred();
    const { result, props } = await mountVoice();
    props.avatar.playAudio.mockReturnValueOnce(play.promise);
    let p;
    await flush(() => { p = result.current.askText('Q'); });
    await tick();
    expect(result.current.vState).toBe('speaking');
    expect(result.current.vSubtitle).toBe('Rest helps.');
    await flush(() => play.resolve());
    for (let i = 0; i < 5; i++) await tick(100);
    await flush(() => p);
    expect(result.current.vState).toBe('idle');
  });

  it('caps a very long question at 1000 characters', async () => {
    const { result, props } = await mountVoice();
    await run(() => result.current.askText('x'.repeat(1200)));
    expect(openaiClient.chatStream.mock.calls[0][0]).toHaveLength(1000);
    expect(props.appendMessage.mock.calls[0][0].text).toHaveLength(1000);
  });

  it('a profile without its own voices passes nulls to TTS', async () => {
    fx.profile = { id: 'aria', name: 'Aria', visemeWeights: { aa: 0.6 } };
    const { result } = await mountVoice({ settings: { ...SETTINGS, voiceSpeed: 'slower' } });
    await run(() => result.current.askText('Q'));
    expect(tts.mock.calls[0][1]).toEqual({ speechRate: 0.65, visemeWeights: { aa: 0.6 }, elevenVoiceId: null, openaiVoice: null });
  });

  it('ignores blank input, and questions while listening or thinking', async () => {
    const { result } = await mountVoice();
    await run(() => result.current.askText('   '));
    await run(() => result.current.askText(undefined));
    expect(openaiClient.chatStream).not.toHaveBeenCalled();

    const gate = deferred();
    openaiClient.chatStream.mockImplementation(answer([gate.promise]));
    let p;
    await flush(() => { p = result.current.askText('first'); });
    expect(result.current.vState).toBe('thinking');
    await run(() => result.current.askText('second'));
    expect(openaiClient.chatStream).toHaveBeenCalledTimes(1);
    await flush(() => gate.resolve('Done.'));
    await run(() => p);

    await flush(() => result.current.micTap()); // listening
    await run(() => result.current.askText('third'));
    expect(openaiClient.chatStream).toHaveBeenCalledTimes(1);
  });

  it('a question while speaking interrupts the current answer (barge-in)', async () => {
    const play = deferred();
    const { result, props } = await mountVoice();
    props.avatar.playAudio.mockReturnValueOnce(play.promise);
    let first;
    await flush(() => { first = result.current.askText('first'); });
    await tick();
    expect(result.current.vState).toBe('speaking');
    let second;
    await flush(() => { second = result.current.askText('second'); });
    expect(props.avatar.stopAudio).toHaveBeenCalled();
    await flush(() => play.resolve());
    await run(() => Promise.all([first, second]));
    expect(openaiClient.chatStream.mock.calls.map((c) => c[0])).toEqual(['first', 'second']);
  });
});

describe('audio off', () => {
  it('muted: no TTS; subtitles are paced by reading speed', async () => {
    const { result, props } = await mountVoice({ muted: true });
    let p;
    await flush(() => { p = result.current.askText('Q'); });
    await tick();
    expect(result.current.vSubtitle).toBe('Rest helps.');
    await tick(1399); // min 1.4 s per subtitle
    expect(result.current.vSubtitle).toBe('Rest helps.');
    await tick(1);
    await tick(50);
    expect(result.current.vSubtitle).toBe('Try a routine.');
    await run(() => p);
    expect(tts).not.toHaveBeenCalled();
    expect(props.avatar.playAudio).not.toHaveBeenCalled();
    expect(props.avatar.setSpeechEmotion).toHaveBeenCalledWith('neutral');
    expect(result.current.vState).toBe('idle');
  });

  it('a long subtitle stays up for 55 ms per character', async () => {
    openaiClient.chatStream.mockImplementation(answer(['y'.repeat(40) + '.']));
    const { result } = await mountVoice({ settings: { ...SETTINGS, audioResponses: false } });
    let p;
    await flush(() => { p = result.current.askText('Q'); });
    await tick();
    await tick(41 * 55 - 1);
    expect(result.current.vState).toBe('speaking');
    await tick(1);
    await flush(() => p);
    expect(result.current.vState).toBe('idle');
  });

  it('with no avatar mounted, audio still flows through the queue without playback', async () => {
    const { result } = await mountVoice({ avatar: null });
    await run(() => result.current.askText('Q'));
    expect(tts).toHaveBeenCalledTimes(2);
    expect(result.current.vState).toBe('idle');
  });
});

// ─── streaming TTS ───────────────────────────────────────────────────────────
describe('streaming TTS (ElevenLabs WebSocket)', () => {
  beforeEach(() => {
    saveKeys({ openai: '', eleven: 'el-key', azure: '' });
    selectTtsMode.mockResolvedValue('eleven-stream');
  });
  const streamingProps = () => ({ avatar: fakeAvatar({ streaming: true }), settings: { ...SETTINGS, fasterVoice: true } });
  const chunk = (charTimes, frames = ['v']) => ({ pcmBase64: 'pcm', durationSec: 0.5, alignment: { charTimes, frames } });

  it('only streams with Faster voice on, a streaming-capable avatar and the stream mode', async () => {
    const a = await mountVoice({ avatar: fakeAvatar({ streaming: true }) }); // fasterVoice off
    await run(() => a.result.current.askText('Q'));
    const b = await mountVoice({ avatar: fakeAvatar({ streaming: false }), settings: { ...SETTINGS, fasterVoice: true } });
    await run(() => b.result.current.askText('Q'));
    expect(selectTtsMode).not.toHaveBeenCalled();
    selectTtsMode.mockResolvedValue('rest');
    const c = await mountVoice(streamingProps());
    await run(() => c.result.current.askText('Q'));
    expect(selectTtsMode).toHaveBeenCalledTimes(1);
    expect(fx.streams).toHaveLength(0);
  });

  it('opens the socket alongside the LLM, streams text, plays PCM with visemes and syncs subtitles', async () => {
    const { result, props } = await mountVoice(streamingProps());
    const { avatar } = props;
    let p;
    await flush(() => { p = result.current.askText('Q'); });
    await settle();
    const s = fx.streams[0];
    expect(s.opts).toMatchObject({ apiKey: 'el-key', voiceId: 'voice-aaron', speechRate: 0.78 });
    expect(s.open).toHaveBeenCalled();
    expect(fx.accumulators[0].opts).toEqual({ visemeWeights: null });
    expect(s.sendText.mock.calls.map((c) => c[0])).toEqual(['Rest helps. ', 'Try a routine.']);
    expect(s.flush).toHaveBeenCalledTimes(2); // one per sentence
    expect(s.end).toHaveBeenCalled();
    expect(tts).not.toHaveBeenCalled();

    // First audio for the first 12 characters ("Rest helps. ").
    await flush(() => s.opts.onAudioChunk(chunk(Array.from({ length: 12 }, (_, i) => i * 0.05), ['v1'])));
    const sessionId = avatar.startStreamingPlayback.mock.calls[0][0];
    expect(sessionId).toMatch(/^s_\d+$/);
    expect(avatar.startStreamingPlayback).toHaveBeenCalledWith(sessionId, ELEVEN_STREAM_SAMPLE_RATE, expect.any(String));
    expect(avatar.appendAudioChunk).toHaveBeenCalledWith(sessionId, 'pcm', ['v1']);
    expect(result.current.vState).toBe('thinking'); // not audible yet

    await flush(() => avatar.onStart()); // the engine starts playing
    expect(result.current.vState).toBe('speaking');
    await tick();
    expect(result.current.vSubtitle).toBe('Rest helps.');
    expect(fx.timers[0].marks).toContain('firstAudio');

    // The rest of the alignment arrives; the second subtitle is timed to it.
    await flush(() => s.opts.onAudioChunk(chunk(Array.from({ length: 14 }, (_, i) => 1 + i * 0.05), ['v2'])));
    await tick(999);
    expect(result.current.vSubtitle).toBe('Rest helps.');
    await tick(1);
    expect(result.current.vSubtitle).toBe('Try a routine.');
    expect(avatar.startStreamingPlayback).toHaveBeenCalledTimes(1);

    await flush(() => s.opts.onFinal());
    expect(avatar.appendAudioChunk).toHaveBeenLastCalledWith(sessionId, '', ['tail-frame']);
    await run(() => p);
    expect(avatar.endStreamingPlayback).toHaveBeenCalledWith(sessionId);
    expect(fx.timers[0].finish).toHaveBeenCalledWith({ modality: MODALITY_TYPED, streaming: true, aborted: false });
    expect(result.current.vState).toBe('idle');
  });

  it('uses the stream’s default voice when the profile has none, and skips an empty final flush', async () => {
    fx.profile = { id: 'x', name: 'X', visemeWeights: null };
    const { result, props } = await mountVoice(streamingProps());
    let p;
    await flush(() => { p = result.current.askText('Q'); });
    await settle();
    const s = fx.streams[0];
    expect(s.opts.voiceId).toBe('nPczCjzI2devNBz1zQrb');
    fx.accumulators[0].flush.mockReturnValueOnce({ frames: [] });
    await flush(() => s.opts.onFinal());
    await run(() => p);
    expect(props.avatar.appendAudioChunk).not.toHaveBeenCalled();
    expect(props.avatar.endStreamingPlayback).not.toHaveBeenCalled(); // no audio ever started
  });

  it('a mid-stream failure replays the unspoken sentences over REST, once, and degrades the session', async () => {
    const { result, props } = await mountVoice(streamingProps());
    const { avatar } = props;
    let p;
    await flush(() => { p = result.current.askText('Q'); });
    await settle();
    const s = fx.streams[0];
    await flush(() => s.opts.onAudioChunk(chunk(Array.from({ length: 12 }, (_, i) => i * 0.01))));
    await flush(() => avatar.onStart());
    await tick(); // "Rest helps." is on screen
    s.abort.mockImplementationOnce(() => { throw new Error('already closed'); });
    await flush(() => s.opts.onError(new Error('ws 1006')));
    await flush(() => s.opts.onError(new Error('again'))); // ignored
    await flush(() => s.opts.onAudioChunk(chunk([9]))); // late audio ignored
    await run(() => p);

    expect(markTtsDegraded).toHaveBeenCalledTimes(1);
    expect(markTtsDegraded).toHaveBeenCalledWith('ws 1006');
    expect(avatar.stopAudio).toHaveBeenCalled();
    // Replays from the sentence that was on screen.
    expect(tts.mock.calls.map((c) => c[0])).toEqual(['Rest helps.', 'Try a routine.']);
    expect(avatar.playAudio).toHaveBeenCalledTimes(2);
    expect(avatar.appendAudioChunk).toHaveBeenCalledTimes(1);
    expect(avatar.endStreamingPlayback).not.toHaveBeenCalled();
    expect(fx.timers[0].finish).toHaveBeenCalledWith({ modality: MODALITY_TYPED, streaming: false, aborted: false });
  });

  it('a socket that fails to open falls back before any sentence, and later text goes to REST', async () => {
    const gate = deferred();
    openaiClient.chatStream.mockImplementation(answer(['Rest helps. ', gate.promise]));
    const { result } = await mountVoice(streamingProps());
    let p;
    await flush(() => { p = result.current.askText('Q'); });
    await settle();
    const s = fx.streams[0];
    await flush(() => s.opts.onError('handshake refused')); // as open().catch would
    await flush(() => gate.resolve('Try a routine.'));
    await run(() => p);
    expect(markTtsDegraded).toHaveBeenCalledWith('handshake refused');
    expect(s.sendText).toHaveBeenCalledTimes(1); // nothing sent after the failure
    expect(tts.mock.calls.map((c) => c[0])).toEqual(['Rest helps.', 'Try a routine.']);
  });

  it('open() rejecting is treated as a stream failure', async () => {
    const { result } = await mountVoice(streamingProps());
    const { createElevenLabsStream } = await import('@core/tts/elevenLabsStreamService');
    createElevenLabsStream.mockImplementationOnce((opts) => {
      const s = { opts, open: vi.fn(() => Promise.reject(new Error('401 from socket'))), sendText: vi.fn(), flush: vi.fn(), end: vi.fn(), abort: vi.fn() };
      fx.streams.push(s);
      return s;
    });
    await run(() => result.current.askText('Q'));
    expect(markTtsDegraded).toHaveBeenCalledWith('401 from socket');
    expect(tts).toHaveBeenCalledTimes(2);
  });

  it('subtitle timers that fire after the stream failed change nothing', async () => {
    const pending = deferred();
    tts.mockReturnValueOnce(pending.promise);
    const { result, props } = await mountVoice(streamingProps());
    let p;
    await flush(() => { p = result.current.askText('Q'); });
    await settle();
    const s = fx.streams[0];
    await flush(() => s.opts.onAudioChunk(chunk([0, 0.01])));
    await flush(() => s.opts.onError(new Error('ws closed')));
    // The engine reports audio start late, after the failure: its subtitle
    // timers must not overwrite the REST replay.
    await flush(() => props.avatar.onStart());
    await tick();
    expect(result.current.vSubtitle).toBe('');
    await flush(() => pending.resolve(spoken('Rest helps.')));
    await run(() => p);
    expect(result.current.vState).toBe('idle');
  });

  it('stopping mid-stream aborts the socket and ends the turn without waiting for audio', async () => {
    const { result, props } = await mountVoice(streamingProps());
    let p;
    await flush(() => { p = result.current.askText('Q'); });
    await settle();
    const s = fx.streams[0];
    await flush(() => s.opts.onAudioChunk(chunk([0, 0.01])));
    await flush(() => props.avatar.onStart());
    expect(result.current.vState).toBe('speaking');
    await flush(() => result.current.micTap()); // barge-in
    expect(s.abort).toHaveBeenCalled();
    expect(result.current.vState).toBe('idle');
    // A late chunk, audio-start or failure after the stop is ignored.
    await flush(() => s.opts.onAudioChunk(chunk([0.5])));
    await flush(() => props.avatar.onStart());
    await flush(() => s.opts.onError(new Error('closed by us')));
    await tick();
    await run(() => p);
    expect(markTtsDegraded).not.toHaveBeenCalled();
    expect(props.avatar.endStreamingPlayback).not.toHaveBeenCalled();
    expect(fx.timers[0].finish).toHaveBeenCalledWith({ modality: MODALITY_TYPED, streaming: true, aborted: true });
    expect(props.appendMessage.mock.calls[1][0].text).toBe('Rest helps. Try a routine.');
  });

  it('an abort that throws while closing the socket is tolerated', async () => {
    const { result } = await mountVoice(streamingProps());
    let p;
    await flush(() => { p = result.current.askText('Q'); });
    await settle();
    fx.streams[0].abort.mockImplementation(() => { throw new Error('closed'); });
    await flush(() => result.current.stop());
    await flush(() => fx.streams[0].opts.onFinal());
    await run(() => p);
    expect(result.current.vState).toBe('idle');
  });
});

// ─── interruptions and failures ──────────────────────────────────────────────
describe('interrupting a REST answer', () => {
  it('stopping during playback skips the rest of the queue and the rest of the stream', async () => {
    const play = deferred();
    const more = deferred();
    openaiClient.chatStream.mockImplementation(answer(['One. ', 'Two. ', more.promise]));
    const { result, props } = await mountVoice();
    props.avatar.playAudio.mockReturnValueOnce(play.promise);
    let p;
    await flush(() => { p = result.current.askText('Q'); });
    await tick();
    expect(result.current.vSubtitle).toBe('One.');
    await flush(() => result.current.micTap()); // speaking → stop
    expect(result.current).toMatchObject({ vState: 'idle', vSubtitle: '' });
    await flush(() => play.resolve());
    await flush(() => more.resolve('Three.'));
    await run(() => p);
    expect(props.avatar.playAudio).toHaveBeenCalledTimes(1);
    const final = props.appendMessage.mock.calls[1][0];
    expect(final.text).toBe('One. Two. '); // the stream was abandoned
    expect(emit).toHaveBeenCalledWith('turn', expect.objectContaining({ aborted: true }));
  });

  it('stopping while a segment’s audio is still being fetched drops it', async () => {
    const audio = deferred();
    tts.mockReturnValueOnce(audio.promise);
    const { result, props } = await mountVoice();
    let p;
    await flush(() => { p = result.current.askText('Q'); });
    await tick();
    expect(result.current.vState).toBe('speaking');
    await flush(() => result.current.stop());
    await flush(() => audio.resolve(spoken('Rest helps.')));
    await run(() => p);
    expect(props.avatar.playAudio).not.toHaveBeenCalled();
  });

  it('a segment queued behind the one playing is skipped once stopped', async () => {
    const play = deferred();
    const { result, props } = await mountVoice();
    props.avatar.playAudio.mockReturnValueOnce(play.promise);
    let p;
    await flush(() => { p = result.current.askText('Q'); });
    await tick();
    await settle(); // both sentences queued
    await flush(() => result.current.stop());
    await flush(() => play.resolve());
    await run(() => p);
    expect(props.avatar.playAudio).toHaveBeenCalledTimes(1);
  });
});

describe('turn failures', () => {
  it('an LLM failure keeps the partial answer, records the turn and shows the error', async () => {
    openaiClient.chatStream.mockImplementation(async function* (q, h, cbs) {
      cbs.onRagDone();
      yield 'Partial. ';
      throw new Error('The answer was cut off — please try again.');
    });
    const { result, props } = await mountVoice();
    await run(() => result.current.askText('Q'));
    expect(result.current.error).toBe('The answer was cut off — please try again.');
    expect(result.current.vState).toBe('idle');
    expect(props.appendMessage.mock.calls[1][0].text).toBe('Partial. ');
    const turn = emit.mock.calls.find(([kind]) => kind === 'turn')[1];
    expect(turn).toMatchObject({ modality: MODALITY_TYPED, aborted: false, sourceIds: [] });
    expect(turn).not.toHaveProperty('answer'); // no study consent outside a session
    expect(console.error).toHaveBeenCalledWith('[useVoiceConversation] processQuery error:', expect.any(Error));
  });

  it('credential failures get the shared copy; errors with no message get a generic line', async () => {
    saveStudy({ sessionId: 'sess', accessCode: 'study-access-code-0001' });
    openaiClient.chatStream.mockImplementation(async function* () { throw Object.assign(new Error('x'), { name: 'StudyLimitError' }); });
    const { result } = await mountVoice();
    await run(() => result.current.askText('Q'));
    expect(result.current.error).toMatch(/Today’s limit for this access code has been reached/);
    await flush(() => result.current.clearError());
    expect(result.current.error).toBeNull();

    openaiClient.chatStream.mockImplementation(async function* () { throw {}; });
    await run(() => result.current.askText('Q'));
    expect(result.current.error).toBe('Something went wrong. Please try again.');
  });

  it('a TTS failure ends the turn with its message', async () => {
    tts.mockRejectedValue(new Error('TTS error: quota'));
    const { result } = await mountVoice();
    await run(() => result.current.askText('Q'));
    expect(result.current.error).toBe('TTS error: quota');
    expect(result.current.vState).toBe('idle');
  });
});

// ─── recording ───────────────────────────────────────────────────────────────
describe('recording and transcription', () => {
  it('mic tap → listening with live partials feeding speculative retrieval', async () => {
    const { result, props } = await mountVoice();
    await flush(() => result.current.micTap());
    expect(props.avatar.unlockAudio).toHaveBeenCalled();
    expect(result.current.vState).toBe('listening');
    const opts = startSttSession.mock.calls[0][0];
    expect(opts.handsFree).toBe(false);
    await flush(() => opts.onPartial('how do I help'));
    expect(result.current.vTranscript).toBe('how do I help');
    const spec = fx.specs[0];
    expect(spec.onPartial).toHaveBeenCalledWith('how do I help');
    await flush(() => opts.onPartial('z'.repeat(1100)));
    expect(spec.onPartial).toHaveBeenLastCalledWith('z'.repeat(1000));
    expect(await spec.search('query')).toEqual(['searched']);
    expect(openaiClient.search).toHaveBeenCalledWith('query');
  });

  it('second tap → transcribes, reuses a speculative hit, and answers as a spoken turn', async () => {
    const { result, props } = await mountVoice();
    await flush(() => result.current.micTap());
    fx.specs[0].resolve.mockResolvedValueOnce({ status: 'hit', chunks: ['pre-1', 'pre-2'] });
    await run(() => result.current.micTap());
    expect(fx.specs[0].resolve).toHaveBeenCalledWith('how do I help');
    expect(result.current.vTranscript).toBe('how do I help');
    expect(result.current.vDone).toBe(true);
    expect(openaiClient.chatStream.mock.calls[0][0]).toBe('how do I help');
    expect(openaiClient.chatStream.mock.calls[0][3].preRetrievedChunks).toEqual(['pre-1', 'pre-2']);
    expect(createTurnTimer).toHaveBeenCalledTimes(1); // the STT timer is the turn timer
    expect(fx.timers[0].marks[0]).toBe('sttDone');
    expect(emit).toHaveBeenCalledWith('turn_start', expect.objectContaining({ modality: MODALITY_SPOKEN }));
    expect(props.appendMessage.mock.calls[0][0]).toEqual({ role: 'user', text: 'how do I help' });
    expect(result.current.vState).toBe('idle');
  });

  it('a speculative miss retrieves normally', async () => {
    const { result } = await mountVoice();
    await flush(() => result.current.micTap());
    await run(() => result.current.micTap());
    expect(openaiClient.chatStream.mock.calls[0][3].preRetrievedChunks).toBeNull();
  });

  it('nothing heard → a gentle retry prompt and a study event, no turn', async () => {
    startSttSession.mockImplementation(async () => fakeSession(''));
    const { result } = await mountVoice();
    await flush(() => result.current.micTap());
    await run(() => result.current.micTap());
    expect(emit).toHaveBeenCalledWith('stt_empty', { arm: null, taskId: null });
    expect(fx.specs[0].cancel).toHaveBeenCalled();
    expect(result.current.error).toBe("I didn't catch that — try again a little closer to the microphone.");
    expect(result.current.vState).toBe('idle');
    expect(openaiClient.chatStream).not.toHaveBeenCalled();
  });

  it('a transcription failure is shown and the screen returns to idle', async () => {
    startSttSession.mockImplementation(async () => ({ stop: vi.fn(async () => { throw new Error('Whisper error: 500'); }), cancel: vi.fn() }));
    const { result } = await mountVoice();
    await flush(() => result.current.micTap());
    await run(() => result.current.micTap());
    expect(result.current.error).toBe('Whisper error: 500');
    expect(result.current.vState).toBe('idle');
    startSttSession.mockImplementation(async () => ({ stop: vi.fn(async () => { throw {}; }), cancel: vi.fn() }));
    await flush(() => result.current.micTap());
    await run(() => result.current.micTap());
    expect(result.current.error).toBe('Could not transcribe audio. Please try again.');
  });

  it('hands-free: end of speech transcribes, and listening re-arms after the answer', async () => {
    const { result } = await mountVoice({ settings: { ...SETTINGS, handsFree: true } });
    await flush(() => result.current.micTap());
    const opts = startSttSession.mock.calls[0][0];
    expect(opts.handsFree).toBe(true);
    await flush(() => {
      opts.onEndOfSpeech({ reason: 'silence' });
      opts.onEndOfSpeech({ reason: 'silence' }); // a duplicate before the state updates: no second stop
    });
    for (let i = 0; i < 40; i++) await tick(2000);
    expect(openaiClient.chatStream).toHaveBeenCalledTimes(1);
    expect(startSttSession).toHaveBeenCalledTimes(2);
    expect(result.current.vState).toBe('listening');
  });

  it('hands-free: an interrupted answer does not re-arm listening', async () => {
    const play = deferred();
    const { result, props } = await mountVoice({ settings: { ...SETTINGS, handsFree: true } });
    props.avatar.playAudio.mockReturnValueOnce(play.promise);
    await flush(() => result.current.micTap());
    let p;
    await flush(() => { p = result.current.micTap(); });
    await tick();
    expect(result.current.vState).toBe('speaking');
    await flush(() => result.current.micTap()); // stop
    await flush(() => play.resolve());
    await run(() => p);
    expect(startSttSession).toHaveBeenCalledTimes(1);
  });

  it('hands-free: no speech at all within the lead window gives up quietly', async () => {
    const session = fakeSession();
    startSttSession.mockResolvedValue(session);
    const { result } = await mountVoice({ settings: { ...SETTINGS, handsFree: true } });
    await flush(() => result.current.micTap());
    await flush(() => startSttSession.mock.calls[0][0].onEndOfSpeech({ reason: 'lead-silence' }));
    expect(session.cancel).toHaveBeenCalled();
    expect(result.current.vState).toBe('idle');
    expect(session.stop).not.toHaveBeenCalled();
  });

  it('an end-of-speech signal after listening has stopped is ignored', async () => {
    const session = fakeSession();
    startSttSession.mockResolvedValue(session);
    const { result } = await mountVoice();
    await flush(() => result.current.micTap());
    await flush(() => result.current.stop());
    await flush(() => startSttSession.mock.calls[0][0].onEndOfSpeech({ reason: 'silence' }));
    expect(session.stop).not.toHaveBeenCalled();
    expect(result.current.vState).toBe('idle');
  });

  it('a recognizer error mid-session ends listening with copy that offers typing', async () => {
    saveStudy({ sessionId: 'sess', accessCode: 'study-access-code-0001', armOrder: 'AB', stageIndex: 0, step: 'task', taskId: 't1' });
    const session = fakeSession();
    startSttSession.mockResolvedValue(session);
    const { result } = await mountVoice();
    await flush(() => result.current.micTap());
    await flush(() => startSttSession.mock.calls[0][0].onError(new Error('speech recognition error: network')));
    expect(session.cancel).toHaveBeenCalled();
    expect(fx.specs[0].cancel).toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith('stt_error', { arm: 'A', taskId: 't1', reason: 'speech recognition error: network' });
    expect(result.current.error).toMatch(/Something went wrong with the microphone/);
    expect(result.current.vState).toBe('idle');
    // A revoked permission is reported as a denial; a bare value is stringified.
    await flush(() => result.current.micTap());
    await flush(() => startSttSession.mock.calls[1][0].onError(Object.assign(new Error('denied'), { code: 'permission-denied' })));
    expect(emit).toHaveBeenLastCalledWith('mic_denied', expect.objectContaining({ reason: 'denied' }));
    await flush(() => result.current.micTap());
    await flush(() => startSttSession.mock.calls[2][0].onError('aborted'));
    expect(emit).toHaveBeenLastCalledWith('stt_error', expect.objectContaining({ reason: 'aborted' }));
  });

  it('a blocked microphone at start names the avatar and points to typing', async () => {
    startSttSession.mockRejectedValue(Object.assign(new Error('Microphone permission denied'), { code: 'permission-denied' }));
    const { result } = await mountVoice();
    await flush(() => result.current.micTap());
    expect(emit).toHaveBeenCalledWith('mic_denied', { arm: null, taskId: null, reason: 'Microphone permission denied' });
    expect(result.current.error).toBe('Microphone access is blocked — allow it in your browser settings to talk with Aaron, or type your question below.');
    expect(result.current.vState).toBe('idle');
  });

  it('any other start failure is shown as-is, or generically when it has no message', async () => {
    startSttSession.mockRejectedValueOnce(new Error('Requested device not found'));
    const { result } = await mountVoice();
    await flush(() => result.current.micTap());
    expect(result.current.error).toBe('Requested device not found');
    expect(emit).toHaveBeenCalledWith('stt_error', expect.objectContaining({ reason: 'Requested device not found' }));
    startSttSession.mockRejectedValueOnce({});
    await flush(() => result.current.micTap());
    expect(result.current.error).toBe('Could not start listening.');
  });

  it('a double tap that lands before "listening" renders replaces the first session instead of leaking it', async () => {
    const first = fakeSession();
    const second = fakeSession();
    startSttSession.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const { result } = await mountVoice();
    await flush(async () => {
      await result.current.micTap();
      await result.current.micTap();
    });
    expect(first.cancel).toHaveBeenCalled();
    expect(fx.specs[0].cancel).toHaveBeenCalled();
    expect(second.cancel).not.toHaveBeenCalled();
    expect(result.current.vState).toBe('listening');
  });

  it('tapping while thinking does nothing', async () => {
    const gate = deferred();
    openaiClient.chatStream.mockImplementation(answer([gate.promise]));
    const { result } = await mountVoice();
    let p;
    await flush(() => { p = result.current.askText('Q'); });
    expect(result.current.vState).toBe('thinking');
    await flush(() => result.current.micTap());
    expect(startSttSession).not.toHaveBeenCalled();
    expect(result.current.vState).toBe('thinking');
    await flush(() => gate.resolve('Ok.'));
    await run(() => p);
  });
});

// ─── repeat, stop, unmount ───────────────────────────────────────────────────
describe('repeatLast', () => {
  const msgs = [{ role: 'user', text: 'Q' }, { role: 'aria', text: 'Old answer [1].' }, { role: 'aria', text: 'Keep calm [1] and rest [2].' }];

  it('re-speaks the last answer without citation markers', async () => {
    const { result, props } = await mountVoice({ messages: msgs });
    await run(() => result.current.repeatLast());
    expect(props.avatar.unlockAudio).toHaveBeenCalled();
    expect(tts).toHaveBeenCalledWith('Keep calm and rest.', { speechRate: 0.78, visemeWeights: null, elevenVoiceId: 'voice-aaron', openaiVoice: 'onyx' });
    expect(props.avatar.playAudio).toHaveBeenCalledWith({ ...spoken('Keep calm and rest.'), emotion: expect.any(String) });
    expect(result.current).toMatchObject({ vState: 'idle', vSubtitle: '' });
  });

  it('with audio off, shows the answer as a paced subtitle', async () => {
    const { result } = await mountVoice({ messages: msgs, muted: true });
    let p;
    await flush(() => { p = result.current.repeatLast(); });
    expect(result.current).toMatchObject({ vState: 'speaking', vSubtitle: 'Keep calm and rest.' });
    await tick(1399);
    expect(result.current.vState).toBe('speaking');
    await tick(1);
    await flush(() => p);
    expect(result.current.vState).toBe('idle');
    expect(tts).not.toHaveBeenCalled();
  });

  it('does nothing with no answer to repeat, or when not idle', async () => {
    const a = await mountVoice({ messages: [{ role: 'user', text: 'Q' }] });
    await run(() => a.result.current.repeatLast());
    const b = await mountVoice({ messages: [{ role: 'aria', text: '' }] });
    await run(() => b.result.current.repeatLast());
    const c = await mountVoice({ messages: msgs });
    await flush(() => c.result.current.micTap()); // listening
    await run(() => c.result.current.repeatLast());
    expect(tts).not.toHaveBeenCalled();
    expect(c.result.current.vState).toBe('listening');
  });

  it('a playback failure is shown', async () => {
    tts.mockRejectedValueOnce(new Error('TTS error: 500'));
    const { result } = await mountVoice({ messages: msgs });
    await run(() => result.current.repeatLast());
    expect(result.current.error).toBe('TTS error: 500');
    tts.mockRejectedValueOnce({});
    await run(() => result.current.repeatLast());
    expect(result.current.error).toBe('Could not play that back.');
    expect(result.current.vState).toBe('idle');
  });
});

describe('stop and unmount', () => {
  it('stop() cancels listening, retrieval and audio, and clears the screen', async () => {
    const session = fakeSession();
    startSttSession.mockResolvedValue(session);
    const { result, props } = await mountVoice();
    await flush(() => result.current.micTap());
    await flush(() => startSttSession.mock.calls[0][0].onPartial('half a'));
    await flush(() => result.current.stop());
    expect(session.cancel).toHaveBeenCalled();
    expect(fx.specs[0].cancel).toHaveBeenCalled();
    expect(props.avatar.stopAudio).toHaveBeenCalled();
    expect(result.current).toMatchObject({ vState: 'idle', vTranscript: '', vSubtitle: '' });
    await flush(() => result.current.stop()); // idempotent
  });

  it('leaving the screen cancels everything in flight', async () => {
    const session = fakeSession();
    startSttSession.mockResolvedValue(session);
    const { result, props, unmount } = await mountVoice();
    await flush(() => result.current.micTap());
    await unmount();
    expect(session.cancel).toHaveBeenCalled();
    expect(fx.specs[0].cancel).toHaveBeenCalled();
    expect(props.avatar.stopAudio).toHaveBeenCalled();
  });

  it('leaving with an open stream aborts it', async () => {
    saveKeys({ openai: '', eleven: 'el-key', azure: '' });
    selectTtsMode.mockResolvedValue('eleven-stream');
    const { result, unmount } = await mountVoice({ avatar: fakeAvatar({ streaming: true }), settings: { ...SETTINGS, fasterVoice: true } });
    await flush(() => { result.current.askText('Q'); });
    await settle();
    await unmount();
    expect(fx.streams[0].abort).toHaveBeenCalled();
  });

  it('a disabled hook does no cleanup work on unmount', async () => {
    const { props, unmount } = await mountVoice({ enabled: false, avatar: fakeAvatar() });
    await unmount();
    expect(props.avatar.stopAudio).not.toHaveBeenCalled();
  });

  it('unmounting with no avatar is safe', async () => {
    const { unmount } = await mountVoice({ avatar: undefined });
    await expect(unmount()).resolves.toBeUndefined();
  });
});
