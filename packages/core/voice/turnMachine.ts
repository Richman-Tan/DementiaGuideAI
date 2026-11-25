// Who has the floor in a spoken conversation.
//
// The microphone stays open. The person speaks, pauses, and the assistant
// answers; if the person starts talking while the assistant is speaking, the
// assistant stops and listens. This module decides those moments. It is a pure
// function: given the state and one event, it returns the next state and a
// list of effects for the app to carry out. It reads no clock, starts no timer
// and touches no audio, which is what lets a whole conversation be tested as a
// scripted timeline.
//
// The app feeds it events: speech starting and stopping (from voice-activity
// detection), the words heard so far (from speech-to-text), the reply becoming
// audible and ending, timers firing, and the controls on screen. It carries out
// the effects: open or close the microphone, start a timer, send the turn,
// stop the reply, lower the assistant's volume.
//
// Every reply belongs to a numbered turn, and events about a reply carry that
// number. An event from a turn that has been superseded is ignored, so a reply
// that was cut off can never act on the conversation that replaced it.
import { endOfTurnWaitMs } from './turnHeuristics.ts';
import type { EndOfTurnConfig } from './turnHeuristics.ts';

export type Phase =
  /** No conversation: the microphone is closed. A typed question can still run a turn. */
  | 'idle'
  /** The microphone is open and nobody is speaking. */
  | 'listening'
  /** The person is speaking. */
  | 'userSpeaking'
  /** The person has stopped; waiting to see whether they have finished. */
  | 'endOfTurnCheck'
  /** The turn has been sent and the reply is not yet audible. */
  | 'thinking'
  /** The assistant is speaking. */
  | 'speaking'
  /** A sound began while a reply was in flight; waiting to see whether it is the person talking. */
  | 'bargeInCheck'
  /** The conversation is on hold: microphone closed until it is resumed. */
  | 'paused';

export type TimerName =
  'endOfTurn' | 'transcriptWait' | 'bargeIn' | 'listenTimeout' | 'utteranceCap';

export type StopReason =
  /** The person spoke over the reply. What was heard of it is kept. */
  | 'bargeIn'
  /** The person carried on before the reply was audible: the turn is re-sent with the rest. */
  | 'resumed'
  /** A typed question replaced it. */
  | 'superseded'
  /** The stop control, or the conversation ending. */
  | 'stopped'
  | 'paused';

export type TurnEvent =
  /** Open the microphone and start the conversation. */
  | { type: 'start' }
  /** End the conversation. */
  | { type: 'stop' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'speechStart' }
  | { type: 'speechEnd'; at: number }
  /**
   * Everything heard since the transcript was last reset. `echo` says the words
   * match what the assistant is saying (see looksLikeEcho).
   */
  | { type: 'heard'; text: string; at: number; echo?: boolean }
  /** The "I'm done" control: send what has been said without waiting. */
  | { type: 'userDone' }
  /** A typed question. */
  | { type: 'textSubmitted'; text: string }
  /** The stop-talking control. */
  | { type: 'interrupt' }
  /** The reply to this turn became audible (or, with audio off, visible). */
  | { type: 'replyStart'; turnId: number }
  /** The reply to this turn finished, or failed. */
  | { type: 'replyEnd'; turnId: number }
  | { type: 'timer'; timer: TimerName; token: number; at: number };

export type Effect =
  | { type: 'openMic' }
  | { type: 'closeMic' }
  /** Start (or restart) the named timer; send back a `timer` event with this token when it fires. */
  | { type: 'startTimer'; timer: TimerName; ms: number; token: number }
  | { type: 'cancelTimer'; timer: TimerName }
  /** Start the transcript afresh: later `heard` events carry only what is said from now on. */
  | { type: 'resetTranscript' }
  /**
   * Send this turn. `replaces` names an earlier turn the person carried on from
   * before its reply was audible: its question is replaced, not added to.
   */
  | { type: 'commitTurn'; turnId: number; text: string; replaces: number | null }
  /** Stop generating and playing the reply to this turn. */
  | { type: 'stopReply'; turnId: number; reason: StopReason }
  /** Lower the assistant's volume, or restore it. */
  | { type: 'duck'; on: boolean }
  /** Something the person should be told, so nothing happens silently. */
  | { type: 'notify'; kind: 'didNotCatch' | 'listeningTimedOut' | 'strictTurns' };

export interface TurnConfig {
  endOfTurn: EndOfTurnConfig;
  /** How long to wait for words after speech that produced none. */
  transcriptWaitMs: number;
  /** How long a sound must last, over a reply, to count as the person talking. */
  bargeInMs: number;
  /** After this many interruptions that turned out to be the assistant's own voice, stop listening while it speaks. */
  maxFalseTriggers: number;
  /** Close the microphone after this long with nobody speaking. */
  listenTimeoutMs: number;
  /** The longest one stretch of speech may run before it is treated as ended. */
  utteranceCapMs: number;
}

// Starting values. The end-of-turn waits follow the 1.2 s the app already used
// for hands-free listening; all of them are to be tuned against recordings.
export const DEFAULT_TURN_CONFIG: TurnConfig = {
  endOfTurn: { baseMs: 1200, midClauseMs: 2200, questionMs: 700 },
  transcriptWaitMs: 1500,
  bargeInMs: 400,
  maxFalseTriggers: 2,
  listenTimeoutMs: 90_000,
  utteranceCapMs: 45_000,
};

export interface TurnState {
  phase: Phase;
  /** Whether the open-microphone conversation is off, on, or on hold. */
  mic: 'off' | 'on' | 'paused';
  /** The number of the latest turn sent. */
  turn: number;
  /** The words of the latest turn sent. */
  sent: string;
  /** What has been heard since the transcript was last reset. */
  heard: string;
  /** Words carried over from a turn the person resumed before its reply was audible. */
  carried: string;
  /** The turn those carried words came from. */
  replaces: number | null;
  /** When speech last stopped, while the end of the turn is being decided. */
  speechEndedAt: number | null;
  /** During a barge-in check: whether the reply had become audible. */
  replyAudible: boolean;
  /** During a barge-in check: the words heard match the assistant's own. */
  echoSuspected: boolean;
  /** How many times the assistant has interrupted itself. */
  falseTriggers: number;
  /** When true, speech is not listened for while the assistant speaks. */
  strictTurns: boolean;
  /** The live token of each running timer. */
  timers: Partial<Record<TimerName, number>>;
  /** The last timer token handed out. */
  lastToken: number;
}

export const initialTurnState = (): TurnState => ({
  phase: 'idle',
  mic: 'off',
  turn: 0,
  sent: '',
  heard: '',
  carried: '',
  replaces: null,
  speechEndedAt: null,
  replyAudible: false,
  echoSuspected: false,
  falseTriggers: 0,
  strictTurns: false,
  timers: {},
  lastToken: 0,
});

export interface Step {
  state: TurnState;
  effects: Effect[];
}

const ALL_TIMERS: TimerName[] = [
  'endOfTurn',
  'transcriptWait',
  'bargeIn',
  'listenTimeout',
  'utteranceCap',
];

const replyInFlight = (state: TurnState) =>
  state.phase === 'thinking' || state.phase === 'speaking' || state.phase === 'bargeInCheck';

const joined = (carried: string, heard: string) =>
  [carried.trim(), heard.trim()].filter(Boolean).join(' ');

/**
 * One event applied to the state. An event that means nothing in the current
 * phase returns the same state and no effects.
 */
export function step(
  previous: TurnState,
  event: TurnEvent,
  config: TurnConfig = DEFAULT_TURN_CONFIG
): Step {
  let state = previous;
  const effects: Effect[] = [];
  const set = (patch: Partial<TurnState>) => {
    state = { ...state, ...patch };
  };

  const startTimer = (timer: TimerName, ms: number) => {
    const token = state.lastToken + 1;
    set({ lastToken: token, timers: { ...state.timers, [timer]: token } });
    effects.push({ type: 'startTimer', timer, ms, token });
  };
  const cancelTimer = (timer: TimerName) => {
    if (state.timers[timer] === undefined) return;
    const { [timer]: _cancelled, ...timers } = state.timers;
    set({ timers });
    effects.push({ type: 'cancelTimer', timer });
  };
  const cancelTimers = () => ALL_TIMERS.forEach(cancelTimer);

  /** Stops the reply in flight, if there is one, and restores the volume if it was lowered. */
  const stopReply = (reason: StopReason) => {
    if (!replyInFlight(state)) return;
    if (state.phase === 'bargeInCheck' && state.replyAudible)
      effects.push({ type: 'duck', on: false });
    effects.push({ type: 'stopReply', turnId: state.turn, reason });
  };

  const forget = {
    heard: '',
    carried: '',
    replaces: null,
    speechEndedAt: null,
    echoSuspected: false,
  };

  /** Back to waiting for the person to speak. */
  const listen = () => {
    set({ phase: 'listening', ...forget });
    effects.push({ type: 'resetTranscript' });
    startTimer('listenTimeout', config.listenTimeoutMs);
  };
  /** Where the conversation rests when no turn is in progress. */
  const rest = () => {
    if (state.mic === 'on') listen();
    else set({ phase: state.mic === 'paused' ? 'paused' : 'idle', ...forget });
  };

  const hearSpeech = () => {
    set({ phase: 'userSpeaking', speechEndedAt: null });
    startTimer('utteranceCap', config.utteranceCapMs);
  };

  const send = (text: string, replaces: number | null) => {
    cancelTimers();
    const turnId = state.turn + 1;
    set({ phase: 'thinking', turn: turnId, sent: text, ...forget });
    effects.push({ type: 'commitTurn', turnId, text, replaces }, { type: 'resetTranscript' });
  };

  /** Speech has stopped at `at`: wait as long as the words so far call for. */
  const checkEndOfTurn = (at: number) => {
    cancelTimer('utteranceCap');
    set({ phase: 'endOfTurnCheck', speechEndedAt: at });
    startTimer('endOfTurn', endOfTurnWaitMs(joined(state.carried, state.heard), config.endOfTurn));
  };

  /** The wait is over, or the person said they were done: send what there is, or wait for the words. */
  const finishTurn = () => {
    const text = joined(state.carried, state.heard);
    if (text) {
      send(text, state.replaces);
      return;
    }
    cancelTimer('endOfTurn');
    cancelTimer('utteranceCap');
    set({ phase: 'endOfTurnCheck' });
    startTimer('transcriptWait', config.transcriptWaitMs);
  };

  switch (event.type) {
    case 'start': {
      if (state.mic === 'on') break;
      set({ mic: 'on' });
      effects.push({ type: 'openMic' });
      // A typed turn may be in flight; it carries on, and can now be spoken over.
      if (!replyInFlight(state)) listen();
      break;
    }

    case 'stop': {
      if (state.mic === 'off' && state.phase === 'idle') break;
      stopReply('stopped');
      cancelTimers();
      if (state.mic === 'on') effects.push({ type: 'closeMic' });
      set({ phase: 'idle', mic: 'off', ...forget });
      break;
    }

    case 'pause': {
      if (state.mic !== 'on') break;
      stopReply('paused');
      cancelTimers();
      effects.push({ type: 'closeMic' });
      set({ phase: 'paused', mic: 'paused', ...forget });
      break;
    }

    case 'resume': {
      if (state.mic !== 'paused') break;
      set({ mic: 'on' });
      effects.push({ type: 'openMic' });
      if (!replyInFlight(state)) listen();
      break;
    }

    case 'speechStart': {
      if (state.mic !== 'on') break;
      if (state.phase === 'listening') {
        cancelTimer('listenTimeout');
        hearSpeech();
      } else if (state.phase === 'endOfTurnCheck') {
        // They had not finished.
        cancelTimer('endOfTurn');
        cancelTimer('transcriptWait');
        hearSpeech();
      } else if (state.phase === 'thinking') {
        set({ phase: 'bargeInCheck', replyAudible: false, echoSuspected: false });
        startTimer('bargeIn', config.bargeInMs);
      } else if (state.phase === 'speaking' && !state.strictTurns) {
        set({ phase: 'bargeInCheck', replyAudible: true, echoSuspected: false });
        effects.push({ type: 'duck', on: true });
        startTimer('bargeIn', config.bargeInMs);
      }
      break;
    }

    case 'speechEnd': {
      if (state.phase === 'userSpeaking') {
        checkEndOfTurn(event.at);
      } else if (state.phase === 'bargeInCheck') {
        // Too short to be someone talking: a cough, or "mm-hm". The reply carries on.
        cancelTimer('bargeIn');
        if (state.replyAudible) effects.push({ type: 'duck', on: false });
        set({
          phase: state.replyAudible ? 'speaking' : 'thinking',
          heard: '',
          echoSuspected: false,
        });
        effects.push({ type: 'resetTranscript' });
      }
      break;
    }

    case 'heard': {
      if (state.phase === 'listening' || state.phase === 'userSpeaking') {
        set({ heard: event.text });
      } else if (state.phase === 'bargeInCheck') {
        set({ heard: event.text, echoSuspected: event.echo === true });
      } else if (state.phase === 'endOfTurnCheck') {
        set({ heard: event.text });
        const text = joined(state.carried, state.heard);
        if (state.timers.transcriptWait !== undefined) {
          // These are the words that were being waited for.
          if (text) send(text, state.replaces);
        } else {
          // The words changed after speech stopped, so the wait they call for may have too.
          const wait = endOfTurnWaitMs(text, config.endOfTurn);
          const remaining = (state.speechEndedAt as number) + wait - event.at;
          if (remaining <= 0) finishTurn();
          else startTimer('endOfTurn', remaining);
        }
      }
      break;
    }

    case 'userDone': {
      if (state.phase === 'userSpeaking' || state.phase === 'endOfTurnCheck') finishTurn();
      break;
    }

    case 'textSubmitted': {
      const text = event.text.trim();
      if (!text) break;
      stopReply('superseded');
      send(text, null);
      break;
    }

    case 'interrupt': {
      if (!replyInFlight(state)) break;
      stopReply('stopped');
      cancelTimers();
      rest();
      break;
    }

    case 'replyStart': {
      if (event.turnId !== state.turn) break;
      if (state.phase === 'thinking') {
        set({ phase: 'speaking' });
      } else if (state.phase === 'bargeInCheck' && !state.replyAudible) {
        // The reply became audible while a sound was being checked.
        set({ replyAudible: true });
        effects.push({ type: 'duck', on: true });
      }
      break;
    }

    case 'replyEnd': {
      if (event.turnId !== state.turn) break;
      if (state.phase === 'thinking' || state.phase === 'speaking') {
        rest();
      } else if (state.phase === 'bargeInCheck') {
        // The reply is over, so the sound is not interrupting anything: it is
        // the start of whatever the person says next.
        cancelTimer('bargeIn');
        if (state.replyAudible) effects.push({ type: 'duck', on: false });
        set({ carried: '', replaces: null, echoSuspected: false });
        hearSpeech();
      }
      break;
    }

    case 'timer': {
      if (state.timers[event.timer] !== event.token) break; // cancelled or replaced
      const { [event.timer]: _fired, ...timers } = state.timers;
      set({ timers });

      if (event.timer === 'endOfTurn') {
        finishTurn();
      } else if (event.timer === 'transcriptWait') {
        // Something was said and no words came of it. Say so, and keep listening.
        effects.push({ type: 'notify', kind: 'didNotCatch' });
        listen();
      } else if (event.timer === 'utteranceCap') {
        checkEndOfTurn(event.at);
      } else if (event.timer === 'listenTimeout') {
        effects.push({ type: 'closeMic' }, { type: 'notify', kind: 'listeningTimedOut' });
        set({ phase: 'idle', mic: 'off', ...forget });
      } else if (!state.replyAudible) {
        // bargeIn, before the reply was audible: the person had more to say.
        // Stop the reply nobody heard, and send the turn again with the rest.
        effects.push({ type: 'stopReply', turnId: state.turn, reason: 'resumed' });
        set({ carried: state.sent, replaces: state.turn, echoSuspected: false });
        hearSpeech();
      } else if (state.echoSuspected) {
        // bargeIn, and the words are the assistant's own: it heard itself.
        const falseTriggers = state.falseTriggers + 1;
        const strictTurns = falseTriggers >= config.maxFalseTriggers;
        effects.push({ type: 'duck', on: false }, { type: 'resetTranscript' });
        if (strictTurns && !state.strictTurns)
          effects.push({ type: 'notify', kind: 'strictTurns' });
        set({ phase: 'speaking', heard: '', echoSuspected: false, falseTriggers, strictTurns });
      } else {
        // bargeIn: the person is talking over the reply. Stop and listen.
        effects.push(
          { type: 'duck', on: false },
          { type: 'stopReply', turnId: state.turn, reason: 'bargeIn' }
        );
        set({ carried: '', replaces: null, echoSuspected: false });
        hearSpeech();
      }
      break;
    }
  }

  return { state, effects };
}
