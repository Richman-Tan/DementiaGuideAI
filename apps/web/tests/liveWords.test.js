// The continuous recogniser behind the conversation (voice/liveWords.js): the
// words heard since the last reset, kept going across the sessions the browser
// ends by itself. The recogniser is a fake the test drives.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { liveWordsAvailable, startLiveWords } from '../src/voice/liveWords.js';

let instances;

class FakeRecogniser {
  constructor() {
    this.started = false;
    this.aborted = false;
    instances.push(this);
  }
  start() {
    if (FakeRecogniser.startThrows) throw FakeRecogniser.startThrows;
    this.started = true;
  }
  abort() {
    if (FakeRecogniser.abortThrows) throw new Error('not started');
    this.aborted = true;
  }
  /** The browser reports these results (each a final or interim piece). */
  hear(...pieces) {
    this.onresult({ results: pieces.map((transcript) => [{ transcript }]) });
  }
}

const latest = () => instances.at(-1);

beforeEach(() => {
  instances = [];
  FakeRecogniser.startThrows = null;
  FakeRecogniser.abortThrows = false;
  vi.stubGlobal('window', { SpeechRecognition: FakeRecogniser });
});
afterEach(() => vi.unstubAllGlobals());

describe('liveWordsAvailable', () => {
  it('is true with either name the browsers use, and false without', () => {
    expect(liveWordsAvailable()).toBe(true);
    vi.stubGlobal('window', { webkitSpeechRecognition: FakeRecogniser });
    expect(liveWordsAvailable()).toBe(true);
    vi.stubGlobal('window', {});
    expect(liveWordsAvailable()).toBe(false);
    vi.stubGlobal('window', undefined);
    expect(liveWordsAvailable()).toBe(false);
  });
});

describe('startLiveWords', () => {
  it('starts a continuous recogniser for New Zealand English with interim results', () => {
    startLiveWords({ onText: vi.fn() });
    expect(instances).toHaveLength(1);
    expect(latest()).toMatchObject({
      lang: 'en-NZ',
      interimResults: true,
      continuous: true,
      started: true,
    });
    startLiveWords({ onText: vi.fn(), lang: 'en-AU' });
    expect(latest().lang).toBe('en-AU');
  });

  it('reports everything heard so far each time the recogniser has more', () => {
    const onText = vi.fn();
    startLiveWords({ onText });
    latest().hear('how do I ');
    latest().hear('how do I ', 'manage sundowning ');
    expect(onText.mock.calls).toEqual([['how do I'], ['how do I manage sundowning']]);
  });

  it('keeps listening when the browser ends a session by itself', () => {
    const onText = vi.fn();
    startLiveWords({ onText });
    const first = latest();
    first.onend();
    expect(instances).toHaveLength(2);
    expect(latest().started).toBe(true);
    latest().hear('still here');
    expect(onText).toHaveBeenCalledWith('still here');
  });

  it('forgets what was heard on reset: the old session is dropped and a new one begun when it ends', () => {
    const onText = vi.fn();
    const words = startLiveWords({ onText });
    const first = latest();
    first.hear('keep the late afternoon calm');
    words.reset();
    expect(first.aborted).toBe(true);
    // Anything the old session still reports is not passed on.
    first.hear('keep the late afternoon calm and well lit');
    first.onerror({ error: 'network' });
    expect(onText).toHaveBeenCalledTimes(1);
    expect(instances).toHaveLength(1); // the next starts when this one has ended

    first.onend();
    expect(instances).toHaveLength(2);
    latest().hear('sorry wait');
    expect(onText).toHaveBeenLastCalledWith('sorry wait');
  });

  it('ignores a second reset while the first is still taking effect', () => {
    const words = startLiveWords({ onText: vi.fn() });
    const first = latest();
    words.reset();
    words.reset();
    first.onend();
    expect(instances).toHaveLength(2);
  });

  it('stops for good on stop: no new session, no more words, and reset does nothing', () => {
    const onText = vi.fn();
    const words = startLiveWords({ onText });
    const first = latest();
    words.stop();
    expect(first.aborted).toBe(true);
    first.onend();
    first.hear('too late');
    words.reset();
    words.stop();
    expect(instances).toHaveLength(1);
    expect(onText).not.toHaveBeenCalled();
  });

  it('stops cleanly in the gap a reset leaves', () => {
    const words = startLiveWords({ onText: vi.fn() });
    const first = latest();
    words.reset();
    words.stop();
    first.onend();
    expect(instances).toHaveLength(1);
  });

  it('treats silence and its own resets as routine, not as errors', () => {
    const onError = vi.fn();
    startLiveWords({ onText: vi.fn(), onError });
    latest().onerror({ error: 'no-speech' });
    latest().onerror({ error: 'aborted' });
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports a blocked microphone as a permission error and stops', () => {
    const onError = vi.fn();
    const words = startLiveWords({ onText: vi.fn(), onError });
    latest().onerror({ error: 'not-allowed' });
    expect(onError.mock.calls[0][0]).toMatchObject({
      message: 'Microphone permission denied',
      code: 'permission-denied',
    });
    latest().onend();
    expect(instances).toHaveLength(1); // it does not start again
    words.stop(); // and stopping afterwards is harmless

    startLiveWords({ onText: vi.fn(), onError });
    latest().onerror({ error: 'service-not-allowed' });
    expect(onError.mock.calls[1][0].code).toBe('permission-denied');
  });

  it('reports any other recogniser error and carries on', () => {
    const onError = vi.fn();
    startLiveWords({ onText: vi.fn(), onError });
    latest().onerror({ error: 'network' });
    expect(onError.mock.calls[0][0].message).toBe('speech recognition error: network');
    latest().onend();
    expect(instances).toHaveLength(2);
  });

  it('copes with errors when nobody is listening for them', () => {
    startLiveWords({ onText: vi.fn() });
    expect(() => {
      latest().onerror({ error: 'network' });
      latest().onerror({ error: 'not-allowed' });
    }).not.toThrow();
  });

  it('reports a recogniser that will not start, and does not keep trying', () => {
    const onError = vi.fn();
    FakeRecogniser.startThrows = new Error('recognizer unavailable');
    startLiveWords({ onText: vi.fn(), onError });
    expect(onError.mock.calls[0][0].message).toBe('recognizer unavailable');
    latest().onend?.();
    expect(instances).toHaveLength(1);

    FakeRecogniser.startThrows = 'busy';
    startLiveWords({ onText: vi.fn(), onError });
    expect(onError.mock.calls[1][0].message).toBe('busy');
    startLiveWords({ onText: vi.fn() }); // nobody listening for it
  });

  it('survives a recogniser that refuses to be aborted', () => {
    const words = startLiveWords({ onText: vi.fn() });
    FakeRecogniser.abortThrows = true;
    expect(() => words.reset()).not.toThrow();
    expect(() => words.stop()).not.toThrow();
  });
});
