// Runs the turn-taking machine for an app.
//
// The machine (turnMachine.ts) only computes: state and event in, state and
// effects out. This is the part that holds the state, keeps the timers, and
// hands each effect to the app through a small set of ports. An app supplies
// the ports (microphone, transcript, reply, volume) and reports what happens
// (speech started, words heard, the reply became audible); everything about
// who has the floor is decided here and in the machine.
//
// It still touches no audio and no network itself, and the clock and timers
// can be replaced, so it is tested with fakes.
import { looksLikeEcho } from './turnHeuristics.ts';
import { DEFAULT_TURN_CONFIG, initialTurnState, step } from './turnMachine.ts';
import type {
  Effect,
  StopReason,
  TimerName,
  TurnConfig,
  TurnEvent,
  TurnState,
} from './turnMachine.ts';

/** What the runtime asks of the app. None of these may block; a failure is reported through `onError`. */
export interface TurnPorts {
  openMic(): void;
  closeMic(): void;
  /** Start the transcript afresh: `heard` should then carry only what is said from now on. */
  resetTranscript(): void;
  /**
   * Send this turn and produce its reply. The app reports `replyStart(turnId)`
   * when the reply becomes audible and `replyEnd(turnId)` when it finishes or
   * fails. `replaces` names an earlier turn whose question this one replaces.
   */
  commitTurn(turn: { turnId: number; text: string; replaces: number | null }): void;
  /** Stop generating and playing the reply to this turn. */
  stopReply(turnId: number, reason: StopReason): void;
  /** Lower the assistant's volume, or restore it. */
  duck(on: boolean): void;
  /** Something the person should be told. */
  notify(kind: Extract<Effect, { type: 'notify' }>['kind']): void;
  /** What the assistant is saying at the moment, for telling its echo from the person. Optional. */
  spokenText?(): string;
}

export interface TurnRuntimeOptions {
  ports: TurnPorts;
  config?: TurnConfig;
  /** Called after every change of state. */
  onChange?(state: TurnState, previous: TurnState): void;
  /** Called when a port throws. The conversation carries on. */
  onError?(error: unknown, effect: Effect): void;
  /** A clock in milliseconds. */
  now?(): number;
  /** Runs `fn` after `ms` and returns a function that cancels it. */
  schedule?(fn: () => void, ms: number): () => void;
}

export interface TurnRuntime {
  readonly state: TurnState;
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  /** The microphone picked up the start of speech. */
  speechStart(): void;
  /** Speech stopped. */
  speechEnd(): void;
  /** Everything heard since the transcript was last reset. */
  heard(text: string): void;
  /** The "I'm done" control. */
  userDone(): void;
  /** A typed question. */
  submitText(text: string): void;
  /** The stop-talking control. */
  interrupt(): void;
  /** The reply to this turn became audible (or visible, with audio off). */
  replyStart(turnId: number): void;
  /** The reply to this turn finished or failed. */
  replyEnd(turnId: number): void;
  /** Ends the conversation and cancels every timer. The runtime does nothing afterwards. */
  dispose(): void;
}

const defaultSchedule = (fn: () => void, ms: number) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

export function createTurnRuntime({
  ports,
  config = DEFAULT_TURN_CONFIG,
  onChange,
  onError,
  now = () => Date.now(),
  schedule = defaultSchedule,
}: TurnRuntimeOptions): TurnRuntime {
  let state = initialTurnState();
  let disposed = false;
  const timers = new Map<TimerName, () => void>();
  // Events are handled one at a time, in the order they arrive. A port may
  // report something back while it is being called (a reply that fails at
  // once, say); that event waits its turn instead of running inside this one.
  const queue: TurnEvent[] = [];
  let draining = false;

  const cancelTimer = (timer: TimerName) => {
    timers.get(timer)?.();
    timers.delete(timer);
  };

  const perform = (effect: Effect) => {
    switch (effect.type) {
      case 'startTimer': {
        cancelTimer(effect.timer);
        const { timer, token } = effect;
        timers.set(
          timer,
          schedule(() => {
            timers.delete(timer);
            dispatch({ type: 'timer', timer, token, at: now() });
          }, effect.ms)
        );
        return;
      }
      case 'cancelTimer':
        return cancelTimer(effect.timer);
      case 'openMic':
        return ports.openMic();
      case 'closeMic':
        return ports.closeMic();
      case 'resetTranscript':
        return ports.resetTranscript();
      case 'commitTurn':
        return ports.commitTurn({
          turnId: effect.turnId,
          text: effect.text,
          replaces: effect.replaces,
        });
      case 'stopReply':
        return ports.stopReply(effect.turnId, effect.reason);
      case 'duck':
        return ports.duck(effect.on);
      case 'notify':
        return ports.notify(effect.kind);
    }
  };

  const dispatch = (event: TurnEvent) => {
    if (disposed) return;
    queue.push(event);
    if (draining) return;
    draining = true;
    try {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const previous = state;
        const result = step(state, next, config);
        state = result.state;
        for (const effect of result.effects) {
          try {
            perform(effect);
          } catch (error) {
            onError?.(error, effect);
            // A turn that could not be sent has no reply coming: say it ended,
            // or the conversation would wait on it for ever.
            if (effect.type === 'commitTurn')
              queue.push({ type: 'replyEnd', turnId: effect.turnId });
          }
        }
        if (state !== previous) onChange?.(state, previous);
      }
    } finally {
      draining = false;
    }
  };

  return {
    get state() {
      return state;
    },
    start: () => dispatch({ type: 'start' }),
    stop: () => dispatch({ type: 'stop' }),
    pause: () => dispatch({ type: 'pause' }),
    resume: () => dispatch({ type: 'resume' }),
    speechStart: () => dispatch({ type: 'speechStart' }),
    speechEnd: () => dispatch({ type: 'speechEnd', at: now() }),
    heard(text) {
      // Only while a sound is being checked against a reply does it matter
      // whether the words are the assistant's own.
      const checking = state.phase === 'bargeInCheck' && ports.spokenText !== undefined;
      const echo = checking ? looksLikeEcho(text, (ports.spokenText as () => string)()) : false;
      dispatch({ type: 'heard', text, at: now(), ...(echo ? { echo } : {}) });
    },
    userDone: () => dispatch({ type: 'userDone' }),
    submitText: (text) => dispatch({ type: 'textSubmitted', text }),
    interrupt: () => dispatch({ type: 'interrupt' }),
    replyStart: (turnId) => dispatch({ type: 'replyStart', turnId }),
    replyEnd: (turnId) => dispatch({ type: 'replyEnd', turnId }),
    dispose() {
      if (disposed) return;
      dispatch({ type: 'stop' });
      disposed = true;
      for (const timer of [...timers.keys()]) cancelTimer(timer);
    },
  };
}
