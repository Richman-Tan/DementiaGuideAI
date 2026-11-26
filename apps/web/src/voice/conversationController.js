// The spoken conversation, as the app runs it.
//
// The turn-taking machine (packages/core/voice) decides who has the floor. This
// is what it acts through in the browser: the open microphone and the
// recogniser on one side, the server's pipeline, the speech endpoint and the
// avatar on the other. It owns one reply at a time and keeps the conversation's
// history honest: a question is recorded when its answer is first heard, and an
// answer that was cut off is recorded as far as it was heard.
//
// It is a plain object, not a React hook, so it can be tested with stand-ins for
// everything it touches. voice/useConversation.js is the hook around it.
import { createSentenceSplitter } from '@core/voice/sentenceTracker';
import { createTurnRuntime } from '@core/voice/turnRuntime.ts';
import { detectSentiment } from '@core/sentiment/detectSentiment';
import { getAvatarProfile } from '../avatar/avatarProfiles.js';
import { stripMarkdownForSpeech } from '../lib/markdown.js';
import { credentialErrorCopy } from '../services/credentialErrorCopy.js';
import { speechRateFor } from '../state/mapSettingsToRag.js';
import { sttErrorPresentation } from './sttErrorCopy.js';

/** How far the avatar's voice drops while a sound is checked. */
const DUCKED_VOLUME = 0.25;

/** With audio off, a caption stays up for about as long as it takes to read. */
const readingTimeMs = (text) => Math.max(1400, text.length * 55);

const NOTICES = {
  didNotCatch: 'I didn’t catch that. Could you say it again?',
  listeningTimedOut: 'I’ve stopped listening. Tap the microphone when you’d like to talk.',
  strictTurns:
    'I kept hearing my own voice, so I’ll finish speaking before I listen. Tap the microphone to stop me.',
  speechUnavailable: 'I can’t speak just now, so my answers will appear as text.',
};

const joined = (...parts) =>
  parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' ');

const sleep = (ms, signal) =>
  new Promise((resolve) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        resolve();
      },
      { once: true }
    );
  });

export const INITIAL_SNAPSHOT = {
  phase: 'idle',
  mic: 'off',
  micLive: false, // the microphone is open and being listened to, not just asked for
  heard: '', // what the person is saying, as it is recognised
  pending: '', // the question that has been sent and not yet answered
  subtitle: '', // the sentence the avatar is speaking
  notice: '', // something the person should be told
  error: '',
};

/**
 * @param {object} options
 * @param {() => object} options.getAvatar   the avatar to speak through
 * @param {() => object} options.getSettings
 * @param {() => object[]} options.getMessages   the conversation so far
 * @param {() => boolean} options.getMuted
 * @param {(message: object) => void} options.appendMessage
 * @param {(snapshot: object) => void} options.onChange
 * @param {object} options.services   openMicInput, startLiveWords, serverGenerate, tts
 */
export function createConversation({
  getAvatar,
  getSettings,
  getMessages,
  getMuted,
  appendMessage,
  onChange,
  services,
}) {
  let snapshot = INITIAL_SNAPSHOT;
  const set = (patch) => {
    snapshot = { ...snapshot, ...patch };
    onChange(snapshot);
  };

  // ─── The microphone ────────────────────────────────────────────────────────
  let micWanted = false;
  let mic = null;
  let words = null;

  const closeMic = () => {
    micWanted = false;
    words?.stop();
    words = null;
    mic?.close();
    mic = null;
    if (snapshot.micLive) set({ micLive: false });
  };

  const micFailed = (err) => {
    console.warn('[conversation] microphone:', err?.message ?? err);
    const copy =
      err?.code === 'permission-denied'
        ? `Microphone access is blocked. Allow it in your browser settings to talk with ${
            getAvatarProfile(getSettings().avatarId).name
          }, or type your question below.`
        : sttErrorPresentation(err).copy;
    set({ error: copy });
    runtime.stop();
  };

  const openMic = () => {
    micWanted = true;
    services
      .openMicInput({
        onSpeechStart: () => runtime.speechStart(),
        onSpeechEnd: () => runtime.speechEnd(),
      })
      .then((opened) => {
        if (!micWanted) {
          opened.close(); // closed again while it was opening
          return;
        }
        mic = opened;
        words = services.startLiveWords({
          onText: (text) => runtime.heard(text),
          onError: micFailed,
        });
        set({ micLive: true });
      })
      .catch(micFailed);
  };

  // ─── The reply ─────────────────────────────────────────────────────────────
  let reply = null;
  // Set by repeat(): the next turn says this again instead of asking the server.
  let repeating = null;

  /**
   * Records the question, once: when its answer is first heard, or when it is
   * stopped. A repeat is not a question, and records nothing.
   */
  const recordQuestion = (r) => {
    if (r.recorded || r.repeat) return;
    r.recorded = true;
    appendMessage({ role: 'user', text: r.text });
  };

  /** The reply has become audible (or, with audio off, visible). */
  const began = (r) => {
    if (r.began || r.abort.signal.aborted) return;
    r.began = true;
    recordQuestion(r);
    set({ pending: '' });
    runtime.replyStart(r.turnId);
  };

  async function run(r) {
    const settings = getSettings();
    const profile = getAvatarProfile(settings.avatarId);
    const audioOn = !!settings.audioResponses && !getMuted();
    const signal = r.abort.signal;
    const splitter = createSentenceSplitter();
    const queue = [];
    let produced = false;
    let wake = null;

    const speech = (text) => {
      if (!audioOn || r.captionsOnly) return Promise.resolve({ text, audio: null });
      return services
        .tts(text, {
          speechRate: speechRateFor(settings),
          visemeWeights: profile.visemeWeights,
          elevenVoiceId: profile.elevenVoiceId ?? null,
        })
        .then((segment) => ({ ...segment, text, emotion: detectSentiment(text) }))
        .catch((err) => {
          // No voice is not a reason to lose the answer: carry on in captions.
          console.warn('[conversation] speech:', err?.message ?? err);
          if (!r.captionsOnly && !signal.aborted) set({ notice: NOTICES.speechUnavailable });
          r.captionsOnly = true;
          return { text, audio: null };
        });
    };
    const say = (sentence) => {
      const text = stripMarkdownForSpeech(sentence).trim();
      if (!text) return;
      queue.push(speech(text));
      wake?.();
    };

    const producer = (async () => {
      try {
        if (r.repeat) {
          for (const sentence of splitter.push(`${r.repeat} `)) say(sentence);
          return null;
        }
        const result = await services.serverGenerate({
          question: r.text,
          settings,
          history: getMessages(),
          signal,
          modality: 'voice',
          onToken: () => {},
          onLeadToken: (piece) => {
            for (const sentence of splitter.push(piece)) say(sentence);
          },
          // The spoken part is complete: say its last sentence now, without
          // waiting for the rest of the answer to arrive.
          onLeadEnd: () => {
            const last = splitter.finish();
            if (last) say(last);
          },
        });
        const rest = splitter.finish();
        if (rest) say(rest);
        // An answer with nothing marked for speaking (a declined one) is still said.
        if (queue.length === 0) say(result.lead || result.text);
        return result;
      } finally {
        produced = true;
        wake?.();
      }
    })();

    const consumer = (async () => {
      for (let i = 0; ; i += 1) {
        while (i >= queue.length && !produced) {
          await new Promise((resolve) => {
            wake = resolve;
          });
        }
        if (i >= queue.length || signal.aborted) return;
        const segment = await queue[i];
        if (signal.aborted) return;
        r.current = segment.text;
        set({ subtitle: segment.text });
        const avatar = getAvatar();
        if (segment.audio && avatar) {
          avatar.setSpeechEmotion?.(segment.emotion);
          avatar.setOnAudioStart(() => began(r));
          await avatar.playAudio(segment);
        } else {
          began(r);
          await sleep(readingTimeMs(segment.text), signal);
        }
        if (signal.aborted) return;
        r.spoken.push(segment.text);
        r.current = '';
      }
    })();

    const [result] = await Promise.all([producer, consumer]);
    return result;
  }

  const startReply = ({ turnId, text }) => {
    const r = {
      turnId,
      text,
      repeat: repeating, // the words to say again, when this turn is a repeat
      abort: new AbortController(),
      spoken: [], // sentences said in full
      current: '', // the sentence being said
      began: false,
      recorded: false,
      captionsOnly: false,
    };
    repeating = null;
    reply = r;
    set({ pending: r.repeat ? '' : text, heard: '', subtitle: '', error: '', notice: '' });
    run(r).then(
      (result) => {
        if (r.abort.signal.aborted) return;
        if (result) {
          recordQuestion(r);
          appendMessage({
            role: 'aria',
            text: result.text,
            // The part that was spoken, so it can be said again.
            lead: result.lead || '',
            citations: result.citations || [],
            sources: result.sources || null,
            safety: !!result.safety,
          });
        }
        reply = null;
        set({ pending: '', subtitle: '' });
        runtime.replyEnd(turnId);
      },
      (err) => {
        if (r.abort.signal.aborted) return;
        console.warn('[conversation] turn failed:', err?.message ?? err);
        r.abort.abort(); // stops whichever half is still running
        getAvatar()?.stopAudio();
        reply = null;
        set({
          pending: '',
          subtitle: '',
          error: credentialErrorCopy(err) ?? 'I couldn’t answer just now. Please try again.',
        });
        runtime.replyEnd(turnId);
      }
    );
  };

  // The machine only stops a reply it has in flight, and that is `reply`.
  const stopReply = (_turnId, reason) => {
    const r = reply;
    reply = null;
    r.abort.abort();
    getAvatar()?.stopAudio();
    set({ pending: '', subtitle: '' });
    // They carried on before any of it was heard: the question is not recorded,
    // because the whole of it is about to be asked again. And a repeat was
    // already in the history.
    if (reason === 'resumed' || r.repeat) return;
    recordQuestion(r);
    const heard = joined(...r.spoken, r.current ? `${r.current}…` : '');
    if (heard) {
      appendMessage({ role: 'aria', text: heard, citations: [], safety: false, interrupted: true });
    }
  };

  // ─── The machine ───────────────────────────────────────────────────────────
  const runtime = createTurnRuntime({
    ...(services.turnConfig ? { config: services.turnConfig } : {}),
    ports: {
      openMic,
      closeMic,
      resetTranscript: () => words?.reset(),
      commitTurn: startReply,
      stopReply,
      duck: (on) => getAvatar()?.setVolume?.(on ? DUCKED_VOLUME : 1),
      notify: (kind) => set({ notice: NOTICES[kind] }),
      spokenText: () => (reply ? joined(...reply.spoken, reply.current) : ''),
    },
    onChange: (state) =>
      set({ phase: state.phase, mic: state.mic, heard: joined(state.carried, state.heard) }),
    onError: (err) => console.warn('[conversation]', err?.message ?? err),
  });

  // A press on the page is what lets the browser play sound; every control
  // that can lead to speech passes it on.
  const unlock = () => getAvatar()?.unlockAudio?.();

  return {
    get snapshot() {
      return snapshot;
    },
    /** Open the microphone and start the conversation. */
    start() {
      unlock();
      set({ error: '', notice: '' });
      runtime.start();
    },
    /** End the conversation. */
    stop: () => runtime.stop(),
    pause: () => runtime.pause(),
    resume() {
      unlock();
      runtime.resume();
    },
    /** "I'm done": send what has been said without waiting out the pause. */
    done: () => runtime.userDone(),
    /** Stop the avatar talking. */
    interrupt: () => runtime.interrupt(),
    /** A typed question. */
    ask(text) {
      unlock();
      runtime.submitText(text);
    },
    /** Say the last answer again. It can be spoken over like any other. */
    repeat() {
      const last = [...getMessages()].reverse().find((m) => m.role === 'aria' && m.text);
      if (!last) return;
      unlock();
      repeating = stripMarkdownForSpeech(
        (last.lead || last.text).replace(/\s*\[\d+\]/g, '')
      ).trim();
      runtime.submitText('repeat');
    },
    clearError: () => set({ error: '' }),
    clearNotice: () => set({ notice: '' }),
    dispose() {
      runtime.dispose();
      closeMic();
    },
  };
}
