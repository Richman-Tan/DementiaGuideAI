import { createTurnRuntime } from './turnRuntime.ts';
import type { TurnPorts } from './turnRuntime.ts';
import { DEFAULT_TURN_CONFIG } from './turnMachine.ts';
import type { Phase } from './turnMachine.ts';

/** A clock and timers the test moves by hand. */
function fakeTime() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { due: number; fn: () => void }>();
  return {
    now: () => now,
    schedule(fn: () => void, ms: number) {
      const id = nextId++;
      pending.set(id, { due: now + ms, fn });
      return () => {
        pending.delete(id);
      };
    },
    advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const due = [...pending.entries()]
          .filter(([, t]) => t.due <= target)
          .sort((a, b) => a[1].due - b[1].due)[0];
        if (!due) break;
        pending.delete(due[0]);
        now = due[1].due;
        due[1].fn();
      }
      now = target;
    },
    get pending() {
      return pending.size;
    },
  };
}

function setup(overrides: Partial<TurnPorts> = {}, extra: { onError?: (e: unknown) => void } = {}) {
  const time = fakeTime();
  const calls: string[] = [];
  const phases: Phase[] = [];
  const ports: TurnPorts = {
    openMic: () => calls.push('openMic'),
    closeMic: () => calls.push('closeMic'),
    resetTranscript: () => calls.push('resetTranscript'),
    commitTurn: ({ turnId, text, replaces }) =>
      calls.push(`commit #${turnId} "${text}"${replaces ? ` replacing #${replaces}` : ''}`),
    stopReply: (turnId, reason) => calls.push(`stop #${turnId} (${reason})`),
    duck: (on) => calls.push(on ? 'duck' : 'unduck'),
    notify: (kind) => calls.push(`notify ${kind}`),
    ...overrides,
  };
  const runtime = createTurnRuntime({
    ports,
    now: time.now,
    schedule: time.schedule,
    onChange: (state) => phases.push(state.phase),
    ...extra,
  });
  return { runtime, time, calls, phases };
}

/** Asks a question by voice and lets the wait run out. */
function ask(s: ReturnType<typeof setup>, text = 'how do I manage sundowning') {
  s.runtime.speechStart();
  s.time.advance(1500);
  s.runtime.heard(text);
  s.runtime.speechEnd();
  s.time.advance(DEFAULT_TURN_CONFIG.endOfTurn.baseMs);
}

describe('createTurnRuntime', () => {
  it('carries a conversation through its ports: microphone, turn, and back to listening', () => {
    const s = setup();
    s.runtime.start();
    ask(s);
    s.runtime.replyStart(1);
    s.time.advance(4000);
    s.runtime.replyEnd(1);

    expect(s.calls).toEqual([
      'openMic',
      'resetTranscript',
      'commit #1 "how do I manage sundowning"',
      'resetTranscript',
      'resetTranscript',
    ]);
    expect(s.runtime.state.phase).toBe('listening');
    expect(s.phases.filter((p, i) => p !== s.phases[i - 1])).toEqual([
      'listening',
      'userSpeaking',
      'endOfTurnCheck',
      'thinking',
      'speaking',
      'listening',
    ]);
  });

  it('sends the turn when the wait it started runs out, not before', () => {
    const s = setup();
    s.runtime.start();
    s.runtime.speechStart();
    s.runtime.heard('my mum has been very unsettled today');
    s.runtime.speechEnd();
    s.time.advance(1199);
    expect(s.calls.some((c) => c.startsWith('commit'))).toBe(false);
    s.time.advance(1);
    expect(s.calls).toContain('commit #1 "my mum has been very unsettled today"');
  });

  it('drops a timer the machine cancelled', () => {
    const s = setup();
    s.runtime.start(); // starts the long listening timer
    s.runtime.speechStart(); // cancels it, starts the cap on one stretch of speech
    s.runtime.speechEnd(); // cancels that, starts the end-of-turn wait
    expect(s.time.pending).toBe(1);
  });

  it('stops the reply and listens when the person talks over it', () => {
    const s = setup();
    s.runtime.start();
    ask(s);
    s.runtime.replyStart(1);
    s.runtime.speechStart();
    s.time.advance(DEFAULT_TURN_CONFIG.bargeInMs);
    expect(s.calls.slice(-3)).toEqual(['duck', 'unduck', 'stop #1 (bargeIn)']);
    expect(s.runtime.state.phase).toBe('userSpeaking');
  });

  it('checks heard words against what the assistant is saying, and does not let it interrupt itself', () => {
    const s = setup({
      spokenText: () => 'Keep the late afternoon calm and close the curtains before dusk.',
    });
    s.runtime.start();
    ask(s);
    s.runtime.replyStart(1);
    s.runtime.speechStart();
    s.runtime.heard('close the curtains before dusk');
    s.time.advance(DEFAULT_TURN_CONFIG.bargeInMs);
    expect(s.runtime.state.phase).toBe('speaking');
    expect(s.calls.some((c) => c.startsWith('stop'))).toBe(false);

    // The person's own words do interrupt.
    s.runtime.speechEnd();
    s.runtime.speechStart();
    s.runtime.heard('sorry what was that');
    s.time.advance(DEFAULT_TURN_CONFIG.bargeInMs);
    expect(s.calls.at(-1)).toBe('stop #1 (bargeIn)');
  });

  it('cannot tell an echo without knowing what is being said, so it treats the sound as the person', () => {
    const s = setup(); // no spokenText port
    s.runtime.start();
    ask(s);
    s.runtime.replyStart(1);
    s.runtime.speechStart();
    s.runtime.heard('close the curtains before dusk');
    s.time.advance(DEFAULT_TURN_CONFIG.bargeInMs);
    expect(s.calls.at(-1)).toBe('stop #1 (bargeIn)');
  });

  it('runs a typed question, and the controls', () => {
    const s = setup();
    s.runtime.submitText('How do I manage sundowning?');
    expect(s.calls).toEqual(['commit #1 "How do I manage sundowning?"', 'resetTranscript']);
    s.runtime.replyStart(1);
    s.runtime.interrupt();
    expect(s.calls.at(-1)).toBe('stop #1 (stopped)');
    expect(s.runtime.state.phase).toBe('idle');

    s.runtime.start();
    s.runtime.pause();
    expect(s.runtime.state.phase).toBe('paused');
    s.runtime.resume();
    expect(s.runtime.state.phase).toBe('listening');
    s.runtime.speechStart();
    s.runtime.heard('thank you');
    s.runtime.userDone();
    expect(s.calls).toContain('commit #2 "thank you"');
    s.runtime.stop();
    expect(s.runtime.state.phase).toBe('idle');
    expect(s.time.pending).toBe(0);
  });

  it('passes notifications on', () => {
    const s = setup();
    s.runtime.start();
    s.time.advance(DEFAULT_TURN_CONFIG.listenTimeoutMs);
    expect(s.calls.slice(-2)).toEqual(['closeMic', 'notify listeningTimedOut']);
  });

  it('handles an event a port reports while it is being called, after the current one', () => {
    // The reply fails the moment the turn is sent.
    const order: string[] = [];
    const s = setup({
      commitTurn: ({ turnId }) => {
        order.push('commit');
        s.runtime.replyEnd(turnId);
        order.push('commit returned');
      },
      resetTranscript: () => order.push('reset'),
    });
    s.runtime.submitText('A question');
    // The turn's own effects finish (commit, then the reset that follows it)
    // before the reported ending is handled.
    expect(order).toEqual(['commit', 'commit returned', 'reset']);
    expect(s.runtime.state.phase).toBe('idle');
    expect(s.phases).toEqual(['thinking', 'idle']);
  });

  it('reports a port that throws, and carries on', () => {
    const errors: unknown[] = [];
    const s = setup(
      {
        duck: () => {
          throw new Error('no audio context');
        },
      },
      { onError: (error) => errors.push(error) }
    );
    s.runtime.start();
    ask(s);
    s.runtime.replyStart(1);
    s.runtime.speechStart(); // duck throws
    s.time.advance(DEFAULT_TURN_CONFIG.bargeInMs); // unduck throws; the reply is still stopped
    expect(errors).toHaveLength(2);
    expect(s.calls.at(-1)).toBe('stop #1 (bargeIn)');
    expect(s.runtime.state.phase).toBe('userSpeaking');
  });

  it('does not wait for ever on a turn that could not be sent', () => {
    const s = setup({
      commitTurn: () => {
        throw new Error('offline');
      },
    });
    s.runtime.start();
    ask(s);
    expect(s.runtime.state.phase).toBe('listening');
  });

  it('survives a throwing port with nobody listening for errors', () => {
    const s = setup({
      openMic: () => {
        throw new Error('denied');
      },
    });
    expect(() => s.runtime.start()).not.toThrow();
    expect(s.runtime.state.phase).toBe('listening');
  });

  it('ends the conversation on dispose and does nothing afterwards', () => {
    const s = setup();
    s.runtime.start();
    ask(s);
    s.runtime.replyStart(1);
    s.runtime.dispose();
    expect(s.calls.slice(-2)).toEqual(['stop #1 (stopped)', 'closeMic']);
    expect(s.time.pending).toBe(0);

    const before = s.calls.length;
    s.runtime.start();
    s.runtime.submitText('Hello');
    s.runtime.dispose();
    expect(s.calls).toHaveLength(before);
    expect(s.runtime.state.phase).toBe('idle');
  });

  it('uses the real clock and timers unless others are supplied', () => {
    jest.useFakeTimers();
    try {
      const calls: string[] = [];
      const runtime = createTurnRuntime({
        ports: {
          openMic: () => {},
          closeMic: () => {},
          resetTranscript: () => {},
          commitTurn: ({ text }) => calls.push(text),
          stopReply: () => {},
          duck: () => {},
          notify: () => {},
        },
      });
      runtime.start();
      runtime.speechStart();
      runtime.heard('is she in pain');
      runtime.speechEnd();
      jest.advanceTimersByTime(700);
      expect(calls).toEqual(['is she in pain']);
      runtime.dispose();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
