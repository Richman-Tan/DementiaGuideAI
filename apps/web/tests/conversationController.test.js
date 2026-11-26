// The spoken conversation as the app runs it (voice/conversationController.js):
// the turn-taking machine driving a microphone, a recogniser, the server's
// pipeline, the speech endpoint and the avatar. Each of those is a stand-in the
// test drives by hand; the machine, its timers (on a fake clock), the sentence
// splitter and the wording are real.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createConversation, INITIAL_SNAPSHOT } from '../src/voice/conversationController.js';
import { DEFAULT_TURN_CONFIG } from '@core/voice/turnMachine.ts';

const WAIT = DEFAULT_TURN_CONFIG.endOfTurn;
const BARGE = DEFAULT_TURN_CONFIG.bargeInMs;

const ANSWER = {
  text: 'Keep afternoons calm [1].\n\nClose the curtains at dusk.',
  lead: 'Keep afternoons calm.',
  citations: [{ num: 1, title: 'Evening restlessness' }],
  sources: [{ num: 1, id: 'kb-1' }],
  safety: false,
};

/** An avatar whose playback the test starts and finishes. */
function fakeAvatar() {
  const a = { calls: [], onStart: null, playing: null };
  a.unlockAudio = () => a.calls.push('unlock');
  a.setOnAudioStart = (cb) => {
    a.onStart = cb;
  };
  a.setSpeechEmotion = () => {};
  a.setVolume = (v) => a.calls.push(`volume ${v}`);
  a.playAudio = (segment) =>
    new Promise((resolve) => {
      a.playing = { segment, resolve };
      a.calls.push(`play "${segment.text}"`);
    });
  a.stopAudio = () => {
    a.calls.push('stop');
    const p = a.playing;
    a.playing = null;
    p?.resolve();
  };
  /** The sound becomes audible. */
  a.audible = () => {
    const cb = a.onStart;
    a.onStart = null;
    cb?.();
  };
  /** The sentence finishes playing. */
  a.finish = () => {
    const p = a.playing;
    a.playing = null;
    p.resolve();
  };
  return a;
}

const flush = async () => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};
const after = async (ms) => {
  await vi.advanceTimersByTimeAsync(ms);
  await flush();
};

function setup({
  settings = {},
  muted = false,
  messages = [],
  avatar = fakeAvatar(),
  tts,
  mic,
} = {}) {
  const snapshots = [];
  const appended = [];
  const world = { avatar, micCallbacks: null, micClosed: 0, words: [], generations: [] };

  const services = {
    openMicInput: vi.fn(
      mic ??
        (async (callbacks) => {
          world.micCallbacks = callbacks;
          return { close: () => (world.micClosed += 1) };
        })
    ),
    startLiveWords: vi.fn((callbacks) => {
      const w = { ...callbacks, resets: 0, stopped: false };
      w.reset = () => (w.resets += 1);
      w.stop = () => (w.stopped = true);
      world.words.push(w);
      return w;
    }),
    serverGenerate: vi.fn(
      (opts) =>
        new Promise((resolve, reject) => {
          world.generations.push({ opts, resolve, reject });
          opts.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        })
    ),
    tts: vi.fn(tts ?? (async (text) => ({ audio: `audio:${text}`, visemeTimeline: null }))),
  };

  const conversation = createConversation({
    getAvatar: () => world.avatar,
    getSettings: () => ({
      avatarId: 'aaron',
      audioResponses: true,
      voiceSpeed: 'normal',
      ...settings,
    }),
    getMessages: () => messages,
    getMuted: () => muted,
    appendMessage: (m) => appended.push(m),
    onChange: (s) => snapshots.push(s),
    services,
  });

  const api = {
    conversation,
    services,
    world,
    appended,
    snapshots,
    get snap() {
      return conversation.snapshot;
    },
    get words() {
      return world.words.at(-1);
    },
    get generation() {
      return world.generations.at(-1);
    },
    /** Opens the microphone and waits for it to be live. */
    async start() {
      conversation.start();
      await flush();
    },
    /** The person says this and stops; the wait runs out and the turn is sent. */
    async say(text, wait = WAIT.baseMs) {
      world.micCallbacks.onSpeechStart();
      api.words.onText(text);
      world.micCallbacks.onSpeechEnd();
      await after(wait);
    },
    /** The server streams this as the part to be spoken. */
    async lead(text) {
      api.generation.opts.onLeadToken(text);
      await flush();
    },
    async answer(result = ANSWER) {
      api.generation.resolve(result);
      await flush();
    },
  };
  return api;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a spoken turn', () => {
  it('opens the microphone and the recogniser, and shows the words as they are heard', async () => {
    const s = setup();
    expect(s.snap).toBe(INITIAL_SNAPSHOT);
    await s.start();
    expect(s.world.avatar.calls).toEqual(['unlock']);
    expect(s.services.openMicInput).toHaveBeenCalledTimes(1);
    expect(s.services.startLiveWords).toHaveBeenCalledTimes(1);
    expect(s.snap).toMatchObject({ phase: 'listening', mic: 'on', micLive: true });

    s.world.micCallbacks.onSpeechStart();
    s.words.onText('how do I manage');
    expect(s.snap).toMatchObject({ phase: 'userSpeaking', heard: 'how do I manage' });
  });

  it('sends the question to the server once the person has finished, as a spoken turn', async () => {
    const earlier = [{ role: 'user', text: 'Hello' }];
    const s = setup({ messages: earlier, settings: { avatarId: 'ariana' } });
    await s.start();
    await s.say('how do I manage sundowning', WAIT.questionMs);

    expect(s.snap).toMatchObject({
      phase: 'thinking',
      pending: 'how do I manage sundowning',
      heard: '',
    });
    expect(s.services.serverGenerate).toHaveBeenCalledTimes(1);
    expect(s.generation.opts).toMatchObject({
      question: 'how do I manage sundowning',
      modality: 'voice',
      history: earlier,
      settings: { avatarId: 'ariana' },
    });
    expect(s.generation.opts.signal.aborted).toBe(false);
    // Not recorded yet: nothing of the answer has been heard.
    expect(s.appended).toEqual([]);
  });

  it('speaks the lead a sentence at a time, and records the question when the answer is first heard', async () => {
    const s = setup();
    await s.start();
    await s.say('how do I manage sundowning', WAIT.questionMs);

    await s.lead('Keep afternoons **calm**. Close the ');
    expect(s.services.tts).toHaveBeenCalledTimes(1);
    expect(s.services.tts.mock.calls[0][0]).toBe('Keep afternoons calm.'); // no Markdown in speech
    expect(s.services.tts.mock.calls[0][1]).toMatchObject({ speechRate: 0.78 });
    expect(s.world.avatar.calls).toContain('play "Keep afternoons calm."');
    expect(s.snap).toMatchObject({ phase: 'thinking', subtitle: 'Keep afternoons calm.' });
    expect(s.appended).toEqual([]);

    s.world.avatar.audible();
    expect(s.snap).toMatchObject({ phase: 'speaking', pending: '' });
    expect(s.appended).toEqual([{ role: 'user', text: 'how do I manage sundowning' }]);

    await s.lead('curtains at dusk.');
    await s.answer();
    s.world.avatar.finish();
    await flush();
    expect(s.world.avatar.calls).toContain('play "Close the curtains at dusk."');
    s.world.avatar.audible(); // a second sentence starting changes nothing
    expect(s.appended).toHaveLength(1);

    s.world.avatar.finish();
    await flush();
    expect(s.appended).toEqual([
      { role: 'user', text: 'how do I manage sundowning' },
      {
        role: 'aria',
        text: ANSWER.text,
        lead: ANSWER.lead,
        citations: ANSWER.citations,
        sources: ANSWER.sources,
        safety: false,
      },
    ]);
    expect(s.snap).toMatchObject({ phase: 'listening', subtitle: '', pending: '' });
  });

  it('speaks a one-sentence lead as soon as it is complete, not when the whole answer has arrived', async () => {
    const s = setup();
    await s.start();
    await s.say('how do I manage sundowning', WAIT.questionMs);
    // Nothing follows the sentence to mark its end, so it is not spoken yet.
    await s.lead('Keep afternoons calm.');
    expect(s.services.tts).not.toHaveBeenCalled();
    // The server says the spoken part is over; the rest is still on its way.
    s.generation.opts.onLeadEnd();
    await flush();
    expect(s.services.tts).toHaveBeenCalledTimes(1);
    expect(s.world.avatar.calls).toContain('play "Keep afternoons calm."');
    s.world.avatar.audible();
    expect(s.snap.phase).toBe('speaking');

    await s.answer();
    s.world.avatar.finish();
    await flush();
    expect(s.services.tts).toHaveBeenCalledTimes(1); // and not said twice
    expect(s.appended).toHaveLength(2);
  });

  it('has nothing more to say when the lead ended on a complete sentence', async () => {
    const s = setup();
    await s.start();
    await s.say('how do I manage sundowning', WAIT.questionMs);
    await s.lead('Keep afternoons calm. ');
    s.generation.opts.onLeadEnd();
    await flush();
    expect(s.services.tts).toHaveBeenCalledTimes(1);
  });

  it('says nothing for a piece of the lead with no words in it', async () => {
    const s = setup();
    await s.start();
    await s.say('how do I manage sundowning', WAIT.questionMs);
    // The splitter's own boundary mark, stray in the model's output, comes back
    // as an empty sentence.
    await s.lead('\x1FKeep afternoons calm. ');
    expect(s.services.tts.mock.calls.map(([text]) => text)).toEqual(['Keep afternoons calm.']);
  });

  it('starts the next stretch of listening with a clean transcript', async () => {
    const s = setup();
    await s.start();
    await s.say('thank you', WAIT.baseMs);
    expect(s.words.resets).toBe(1); // on sending
    await s.lead('You are welcome.');
    await s.answer({ ...ANSWER, text: 'You are welcome.', lead: 'You are welcome.' });
    s.world.avatar.audible();
    s.world.avatar.finish();
    await flush();
    expect(s.words.resets).toBe(2); // and on listening again
  });

  it('raises the help callout the server asked for, and fills in what a reply left out', async () => {
    const s = setup();
    await s.start();
    await s.say('she has collapsed', WAIT.baseMs);
    await s.lead('Call 111 now.');
    await s.answer({ text: 'Call 111 now.', lead: 'Call 111 now.', safety: true });
    s.world.avatar.audible();
    s.world.avatar.finish();
    await flush();
    expect(s.appended.at(-1)).toEqual({
      role: 'aria',
      text: 'Call 111 now.',
      lead: 'Call 111 now.',
      citations: [],
      sources: null,
      safety: true,
    });
  });

  it('says an answer that has nothing marked for speaking, such as a declined one', async () => {
    const s = setup();
    await s.start();
    await s.say('a question', WAIT.baseMs);
    await s.answer({
      text: 'I was not able to answer that.',
      lead: '',
      citations: [],
      safety: true,
    });
    expect(s.world.avatar.calls).toContain('play "I was not able to answer that."');
  });

  it('sends "I’m done" without waiting out the pause', async () => {
    const s = setup();
    await s.start();
    s.world.micCallbacks.onSpeechStart();
    s.words.onText('she is very tired and');
    s.conversation.done();
    expect(s.generation.opts.question).toBe('she is very tired and');
  });
});

describe('talking over the avatar', () => {
  /** A question asked and the first sentence of the answer playing. */
  async function midAnswer(options) {
    const s = setup(options);
    await s.start();
    await s.say('how do I manage sundowning', WAIT.questionMs);
    await s.lead('Keep afternoons calm. Close the curtains at dusk. ');
    s.world.avatar.audible();
    return s;
  }

  it('lowers the voice at the first sound and restores it after a short one', async () => {
    const s = await midAnswer();
    s.world.micCallbacks.onSpeechStart();
    expect(s.world.avatar.calls.at(-1)).toBe('volume 0.25');
    expect(s.words.resets).toBe(2); // the words are counted from the sound
    s.world.micCallbacks.onSpeechEnd();
    expect(s.world.avatar.calls.at(-1)).toBe('volume 1');
    expect(s.snap.phase).toBe('speaking');
    expect(s.generation.opts.signal.aborted).toBe(false);
  });

  it('stops and listens when the person keeps talking, and records only what was heard', async () => {
    const s = await midAnswer();
    s.world.avatar.finish(); // the first sentence was heard in full
    await flush();
    s.world.avatar.audible(); // the second has begun

    s.world.micCallbacks.onSpeechStart();
    s.words.onText('sorry can I');
    await after(BARGE);

    expect(s.generation.opts.signal.aborted).toBe(true);
    expect(s.world.avatar.calls.slice(-2)).toEqual(['volume 1', 'stop']);
    expect(s.snap).toMatchObject({ phase: 'userSpeaking', subtitle: '', heard: 'sorry can I' });
    expect(s.appended).toEqual([
      { role: 'user', text: 'how do I manage sundowning' },
      {
        role: 'aria',
        text: 'Keep afternoons calm. Close the curtains at dusk.…',
        citations: [],
        safety: false,
        interrupted: true,
      },
    ]);

    // What they said while interrupting is the start of their next question.
    s.words.onText('sorry can I ask about her tablets');
    s.world.micCallbacks.onSpeechEnd();
    await after(WAIT.baseMs);
    expect(s.generation.opts.question).toBe('sorry can I ask about her tablets');
  });

  it('does not stop for its own words coming back through the microphone', async () => {
    const s = await midAnswer();
    s.world.micCallbacks.onSpeechStart();
    s.words.onText('keep afternoons calm');
    await after(BARGE);
    expect(s.snap.phase).toBe('speaking');
    expect(s.generation.opts.signal.aborted).toBe(false);
    expect(s.world.avatar.calls.at(-1)).toBe('volume 1');

    // The second time it says so, and stops listening while it speaks.
    s.world.micCallbacks.onSpeechEnd();
    s.world.micCallbacks.onSpeechStart();
    s.words.onText('keep afternoons calm');
    await after(BARGE);
    expect(s.snap.notice).toMatch(/I kept hearing my own voice/);
  });

  it('plays nothing if it is stopped while the speech is still being fetched', async () => {
    let deliver;
    const s = setup({ tts: () => new Promise((resolve) => (deliver = resolve)) });
    await s.start();
    await s.say('how do I manage sundowning', WAIT.questionMs);
    await s.lead('Keep afternoons calm. ');
    s.conversation.interrupt();
    deliver({ audio: 'audio:late', visemeTimeline: null });
    await flush();
    expect(s.world.avatar.calls.some((c) => c.startsWith('play'))).toBe(false);
    expect(s.snap).toMatchObject({ phase: 'listening', subtitle: '' });
  });

  it('carries on when the avatar cannot change its volume, and says so in the log', async () => {
    const avatar = fakeAvatar();
    avatar.setVolume = () => {
      throw new Error('no audio context');
    };
    const s = await midAnswer({ avatar });
    s.world.micCallbacks.onSpeechStart();
    s.words.onText('sorry can I');
    await after(BARGE);
    expect(console.warn).toHaveBeenCalledWith('[conversation]', 'no audio context');
    expect(s.snap.phase).toBe('userSpeaking'); // still stopped to listen
    expect(s.generation.opts.signal.aborted).toBe(true);
  });

  it('logs a port failure that is not an Error', async () => {
    const avatar = fakeAvatar();
    avatar.setVolume = () => {
      throw 'volume unavailable';
    };
    const s = await midAnswer({ avatar });
    s.world.micCallbacks.onSpeechStart();
    expect(console.warn).toHaveBeenCalledWith('[conversation]', 'volume unavailable');
  });

  it('stops on the stop control and records the question with what was heard of the answer', async () => {
    const s = await midAnswer();
    s.conversation.interrupt();
    expect(s.world.avatar.calls.at(-1)).toBe('stop');
    expect(s.snap.phase).toBe('listening');
    expect(s.appended.map((m) => m.role)).toEqual(['user', 'aria']);
    expect(s.appended[1]).toMatchObject({ text: 'Keep afternoons calm.…', interrupted: true });
  });

  it('records just the question when it is stopped before anything was heard', async () => {
    const s = setup();
    await s.start();
    await s.say('how do I manage sundowning', WAIT.questionMs);
    s.conversation.interrupt();
    expect(s.appended).toEqual([{ role: 'user', text: 'how do I manage sundowning' }]);
    // A late report from the audio that was being fetched changes nothing.
    await s.lead('Keep afternoons calm. ');
    s.world.avatar.audible();
    expect(s.appended).toHaveLength(1);
    expect(s.snap.phase).toBe('listening');
  });
});

describe('carrying on before the answer is heard', () => {
  it('drops the unheard answer and asks the whole question once', async () => {
    const s = setup();
    await s.start();
    await s.say('what should I do', WAIT.questionMs);
    const first = s.generation;

    s.world.micCallbacks.onSpeechStart();
    await after(BARGE);
    expect(first.opts.signal.aborted).toBe(true);
    expect(s.appended).toEqual([]); // the half question is not recorded
    expect(s.snap).toMatchObject({ phase: 'userSpeaking', pending: '', heard: 'what should I do' });

    s.words.onText('when she refuses to eat');
    expect(s.snap.heard).toBe('what should I do when she refuses to eat');
    s.world.micCallbacks.onSpeechEnd();
    await after(WAIT.questionMs);
    expect(s.generation).not.toBe(first);
    expect(s.generation.opts.question).toBe('what should I do when she refuses to eat');

    await s.lead('Offer small portions.');
    await s.answer({ ...ANSWER, text: 'Offer small portions.', lead: 'Offer small portions.' });
    s.world.avatar.audible();
    expect(s.appended).toEqual([
      { role: 'user', text: 'what should I do when she refuses to eat' },
    ]);
  });
});

describe('without sound', () => {
  it.each([
    ['audio responses are off', { settings: { audioResponses: false } }],
    ['the avatar is muted', { muted: true }],
  ])('shows captions for as long as they take to read when %s', async (_name, options) => {
    const s = setup(options);
    await s.start();
    await s.say('how do I manage sundowning', WAIT.questionMs);
    await s.lead('Keep afternoons calm. Close the curtains at dusk.');
    await s.answer();
    expect(s.services.tts).not.toHaveBeenCalled();
    expect(s.snap).toMatchObject({ phase: 'speaking', subtitle: 'Keep afternoons calm.' });
    expect(s.appended).toEqual([{ role: 'user', text: 'how do I manage sundowning' }]);

    await after(1400);
    expect(s.snap.subtitle).toBe('Close the curtains at dusk.');
    // The longer sentence stays up longer: 55 ms a character.
    await after(1400);
    expect(s.appended).toHaveLength(1);
    await after(100);
    expect(s.appended).toHaveLength(2);
    expect(s.snap.phase).toBe('listening');
  });

  it('can be spoken over, which ends the caption at once', async () => {
    const s = setup({ settings: { audioResponses: false } });
    await s.start();
    await s.say('how do I manage sundowning', WAIT.questionMs);
    await s.lead('Keep afternoons calm. ');
    s.world.micCallbacks.onSpeechStart();
    await after(BARGE);
    expect(s.snap).toMatchObject({ phase: 'userSpeaking', subtitle: '' });
    expect(s.appended.at(-1)).toMatchObject({ text: 'Keep afternoons calm.…', interrupted: true });
  });

  it('carries on in captions, and says so once, when speech cannot be produced', async () => {
    const refused = Object.assign(new Error('limit'), {
      name: 'TurnRequestError',
      status: 429,
      code: 'demo_limit',
    });
    const s = setup({ tts: async () => Promise.reject(refused) });
    await s.start();
    await s.say('how do I manage sundowning', WAIT.questionMs);
    await s.lead('Keep afternoons calm. Close the curtains at dusk.');
    await s.answer();
    expect(s.services.tts).toHaveBeenCalledTimes(1); // not asked again for the second sentence
    expect(s.snap.notice).toBe('I can’t speak just now, so my answers will appear as text.');
    expect(s.snap).toMatchObject({ phase: 'speaking', subtitle: 'Keep afternoons calm.' });
    await after(3000);
    expect(s.appended.map((m) => m.role)).toEqual(['user', 'aria']);
  });

  it('speaks without an avatar to speak through, as captions', async () => {
    const s = setup({ avatar: null });
    s.world.avatar = null;
    s.conversation.ask('How do I manage sundowning?');
    await flush();
    await s.lead('Keep afternoons calm.');
    await s.answer();
    expect(s.snap).toMatchObject({ phase: 'speaking', subtitle: 'Keep afternoons calm.' });
    s.conversation.interrupt();
    expect(s.snap.phase).toBe('idle');
  });
});

describe('a typed question', () => {
  it('is answered aloud with the microphone closed, and leaves it closed', async () => {
    const s = setup();
    s.conversation.ask('How do I manage sundowning?');
    await flush();
    expect(s.world.avatar.calls).toEqual(['unlock']);
    expect(s.services.openMicInput).not.toHaveBeenCalled();
    expect(s.generation.opts.question).toBe('How do I manage sundowning?');
    await s.lead('Keep afternoons calm.');
    await s.answer();
    s.world.avatar.audible();
    s.world.avatar.finish();
    await flush();
    expect(s.appended.map((m) => m.role)).toEqual(['user', 'aria']);
    expect(s.snap.phase).toBe('idle');
  });

  it('replaces an answer that is being spoken', async () => {
    const s = setup();
    await s.start();
    await s.say('how do I manage sundowning', WAIT.questionMs);
    const first = s.generation;
    await s.lead('Keep afternoons calm. ');
    s.world.avatar.audible();
    s.conversation.ask('What about her tablets?');
    expect(first.opts.signal.aborted).toBe(true);
    expect(s.generation.opts.question).toBe('What about her tablets?');
    expect(s.appended.map((m) => m.text)).toEqual([
      'how do I manage sundowning',
      'Keep afternoons calm.…',
    ]);
  });
});

describe('saying the last answer again', () => {
  const HISTORY = [
    { role: 'user', text: 'How do I manage sundowning?' },
    {
      role: 'aria',
      text: 'Keep afternoons **calm** [1].\n\nClose the curtains.',
      lead: 'Keep afternoons calm.',
    },
  ];

  it('speaks the part that was spoken before, without asking the server or recording anything', async () => {
    const s = setup({ messages: HISTORY });
    s.conversation.repeat();
    await flush();
    expect(s.services.serverGenerate).not.toHaveBeenCalled();
    expect(s.world.avatar.calls).toEqual(['unlock', 'play "Keep afternoons calm."']);
    expect(s.snap).toMatchObject({ phase: 'thinking', pending: '' });
    s.world.avatar.audible();
    expect(s.snap.phase).toBe('speaking');
    s.world.avatar.finish();
    await flush();
    expect(s.snap).toMatchObject({ phase: 'idle', subtitle: '' });
    expect(s.appended).toEqual([]);
  });

  it('says the whole answer, without its markers, when no spoken part was kept', async () => {
    const s = setup({
      messages: [{ role: 'aria', text: 'Keep afternoons **calm** [1]. Close the curtains [2].' }],
    });
    s.conversation.repeat();
    await flush();
    expect(s.world.avatar.calls).toContain('play "Keep afternoons calm."');
    s.world.avatar.finish();
    await flush();
    expect(s.world.avatar.calls).toContain('play "Close the curtains."');
  });

  it('can be spoken over like any other reply, and still records nothing', async () => {
    const s = setup({ messages: HISTORY });
    await s.start();
    s.conversation.repeat();
    await flush();
    s.world.avatar.audible();
    s.world.micCallbacks.onSpeechStart();
    await after(BARGE);
    expect(s.world.avatar.calls.at(-1)).toBe('stop');
    expect(s.snap.phase).toBe('userSpeaking');
    expect(s.appended).toEqual([]);
  });

  it('does nothing when there is no answer to repeat', () => {
    const s = setup({
      messages: [
        { role: 'user', text: 'Hello' },
        { role: 'aria', text: '' },
      ],
    });
    s.conversation.repeat();
    expect(s.snap).toBe(INITIAL_SNAPSHOT);
    expect(s.world.avatar.calls).toEqual([]);
  });
});

describe('when something fails', () => {
  it('says why the turn failed, records nothing, and keeps listening', async () => {
    const s = setup();
    await s.start();
    await s.say('how do I manage sundowning', WAIT.questionMs);
    s.generation.reject(
      Object.assign(new Error('limit'), {
        name: 'TurnRequestError',
        status: 429,
        code: 'demo_limit',
      })
    );
    await flush();
    expect(s.snap).toMatchObject({
      phase: 'listening',
      pending: '',
      error: 'The live demo has reached today’s limit. It resets around midday NZ time.',
    });
    expect(s.appended).toEqual([]);
    s.conversation.clearError();
    expect(s.snap.error).toBe('');
  });

  it('has its own wording for a failure with no known cause, and stops what was playing', async () => {
    const s = setup();
    await s.start();
    await s.say('how do I manage sundowning', WAIT.questionMs);
    await s.lead('Keep afternoons calm. ');
    s.world.avatar.audible();
    s.generation.reject(new Error('connection lost'));
    await flush();
    expect(s.snap.error).toBe('I couldn’t answer just now. Please try again.');
    expect(s.world.avatar.calls.at(-1)).toBe('stop');
    expect(s.snap.phase).toBe('listening');
  });

  it('explains a blocked microphone by the avatar’s name, and ends the conversation', async () => {
    const denied = Object.assign(new Error('Microphone permission denied'), {
      code: 'permission-denied',
    });
    const s = setup({ settings: { avatarId: 'ariana' }, mic: async () => Promise.reject(denied) });
    await s.start();
    expect(s.snap.error).toMatch(/^Microphone access is blocked\. .* to talk with Ariana, or type/);
    expect(s.snap).toMatchObject({ phase: 'idle', mic: 'off' });
    expect(s.services.startLiveWords).not.toHaveBeenCalled();
  });

  it('explains any other microphone or recogniser failure, and closes the microphone', async () => {
    const s = setup();
    await s.start();
    s.words.onError(new Error('speech recognition error: network'));
    expect(s.snap.error).toMatch(/^Something went wrong with the microphone/);
    expect(s.snap.phase).toBe('idle');
    expect(s.world.micClosed).toBe(1);
    expect(s.words.stopped).toBe(true);

    const broken = setup({ mic: async () => Promise.reject('no audio device') });
    await broken.start();
    expect(broken.snap.error).toMatch(/^Something went wrong with the microphone/);
  });

  it('closes a microphone that finishes opening after the conversation was stopped', async () => {
    let open;
    const closed = vi.fn();
    const s = setup({ mic: () => new Promise((resolve) => (open = resolve)) });
    s.conversation.start();
    // Asked for, and not yet live: the screen must not say it is listening.
    expect(s.snap).toMatchObject({ phase: 'listening', micLive: false });
    s.conversation.stop();
    open({ close: closed });
    await flush();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(s.services.startLiveWords).not.toHaveBeenCalled();
  });
});

describe('the controls', () => {
  it('says so when nothing could be made out, and when it stops listening', async () => {
    const s = setup();
    await s.start();
    s.world.micCallbacks.onSpeechStart();
    s.world.micCallbacks.onSpeechEnd();
    await after(WAIT.baseMs + DEFAULT_TURN_CONFIG.transcriptWaitMs);
    expect(s.snap.notice).toBe('I didn’t catch that. Could you say it again?');
    s.conversation.clearNotice();
    expect(s.snap.notice).toBe('');

    await after(DEFAULT_TURN_CONFIG.listenTimeoutMs);
    expect(s.snap.notice).toMatch(/^I’ve stopped listening/);
    expect(s.snap).toMatchObject({ phase: 'idle', mic: 'off' });
    expect(s.world.micClosed).toBe(1);
  });

  it('pauses and resumes: the microphone closes and opens again', async () => {
    const s = setup();
    await s.start();
    s.conversation.pause();
    expect(s.snap).toMatchObject({ phase: 'paused', mic: 'paused', micLive: false });
    expect(s.world.micClosed).toBe(1);
    s.conversation.resume();
    await flush();
    expect(s.snap.phase).toBe('listening');
    expect(s.services.openMicInput).toHaveBeenCalledTimes(2);
    expect(s.world.avatar.calls.filter((c) => c === 'unlock')).toHaveLength(2);
  });

  it('ends everything when it is disposed of', async () => {
    const s = setup();
    await s.start();
    await s.say('how do I manage sundowning', WAIT.questionMs);
    await s.lead('Keep afternoons calm. ');
    s.world.avatar.audible();
    s.conversation.dispose();
    expect(s.generation.opts.signal.aborted).toBe(true);
    expect(s.world.avatar.calls.at(-1)).toBe('stop');
    expect(s.world.micClosed).toBe(1);
    expect(s.words.stopped).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses the turn settings it is given', async () => {
    const s = setup();
    // Not part of setup(): a conversation built with its own timings.
    const fast = createConversation({
      getAvatar: () => s.world.avatar,
      getSettings: () => ({ avatarId: 'aaron', audioResponses: true }),
      getMessages: () => [],
      getMuted: () => false,
      appendMessage: () => {},
      onChange: () => {},
      services: {
        ...s.services,
        turnConfig: {
          ...DEFAULT_TURN_CONFIG,
          endOfTurn: { baseMs: 10, midClauseMs: 10, questionMs: 10 },
        },
      },
    });
    fast.start();
    await flush();
    s.world.micCallbacks.onSpeechStart();
    s.words.onText('hello there');
    s.world.micCallbacks.onSpeechEnd();
    await after(10);
    expect(s.generation.opts.question).toBe('hello there');
    fast.dispose();
  });
});
