// The turn-taking machine, tested as conversations: each test is a timeline of
// what the microphone, the recogniser and the person did, in milliseconds, and
// the assertions are what the app was told to do and when.
import { DEFAULT_TURN_CONFIG, initialTurnState, step } from './turnMachine.ts';
import type { Effect, TimerName, TurnConfig, TurnEvent, TurnState } from './turnMachine.ts';

type Scripted =
  | Exclude<TurnEvent, { type: 'speechEnd' | 'heard' | 'timer' }>
  | { type: 'speechEnd' }
  | { type: 'heard'; text: string; echo?: boolean };

const describeEffect = (effect: Effect): string | null => {
  switch (effect.type) {
    case 'openMic':
      return 'mic on';
    case 'closeMic':
      return 'mic off';
    case 'commitTurn':
      return `send #${effect.turnId} "${effect.text}"${effect.replaces ? ` replacing #${effect.replaces}` : ''}`;
    case 'stopReply':
      return `stop #${effect.turnId} (${effect.reason})`;
    case 'duck':
      return effect.on ? 'duck' : 'unduck';
    case 'notify':
      return `notify ${effect.kind}`;
    default:
      return null; // timers are run by the simulator; transcript resets are checked on their own
  }
};

/** Runs the machine against a virtual clock, firing the timers it asks for. */
function conversation(config: TurnConfig = DEFAULT_TURN_CONFIG) {
  let state: TurnState = initialTurnState();
  let now = 0;
  const timers = new Map<TimerName, { due: number; token: number }>();
  const log: string[] = [];
  const effects: Effect[] = [];

  const apply = (event: TurnEvent) => {
    const result = step(state, event, config);
    state = result.state;
    for (const effect of result.effects) {
      effects.push(effect);
      if (effect.type === 'startTimer') {
        timers.set(effect.timer, { due: now + effect.ms, token: effect.token });
      } else if (effect.type === 'cancelTimer') {
        timers.delete(effect.timer);
      }
      const line = describeEffect(effect);
      if (line) log.push(`${now} ${line}`);
    }
    return result;
  };

  /** Moves the clock to `t`, firing each timer that falls due on the way. */
  const advanceTo = (t: number) => {
    for (;;) {
      const [name, timer] = [...timers.entries()].sort((a, b) => a[1].due - b[1].due)[0] ?? [];
      if (!name || !timer || timer.due > t) break;
      timers.delete(name);
      now = timer.due;
      apply({ type: 'timer', timer: name, token: timer.token, at: now });
    }
    now = t;
  };

  const api = {
    /** At time `t`, this happens. */
    at(t: number, event: Scripted) {
      advanceTo(t);
      const full =
        event.type === 'speechEnd' || event.type === 'heard' ? { ...event, at: now } : event;
      apply(full as TurnEvent);
      return api;
    },
    /** Lets time pass until `t`. */
    until(t: number) {
      advanceTo(t);
      return api;
    },
    get state() {
      return state;
    },
    get phase() {
      return state.phase;
    },
    log,
    effects,
    timers,
    apply,
  };
  return api;
}

/** A conversation in which the person has asked a question and the reply is being spoken. */
function speaking(config: TurnConfig = DEFAULT_TURN_CONFIG) {
  return conversation(config)
    .at(0, { type: 'start' })
    .at(1000, { type: 'speechStart' })
    .at(2500, { type: 'heard', text: 'how do I manage sundowning' })
    .at(2600, { type: 'speechEnd' })
    .at(4000, { type: 'replyStart', turnId: 1 });
}

describe('a simple turn', () => {
  it('listens, hears a question, sends it after the wait, and listens again after the reply', () => {
    const c = conversation().at(0, { type: 'start' });
    expect(c.phase).toBe('listening');

    c.at(1000, { type: 'speechStart' });
    expect(c.phase).toBe('userSpeaking');
    c.at(2500, { type: 'heard', text: 'my mum has been very unsettled today' });
    c.at(2600, { type: 'speechEnd' });
    expect(c.phase).toBe('endOfTurnCheck');

    c.until(3799);
    expect(c.phase).toBe('endOfTurnCheck');
    c.until(3800); // 1,200 ms after she stopped
    expect(c.phase).toBe('thinking');

    c.at(4600, { type: 'replyStart', turnId: 1 });
    expect(c.phase).toBe('speaking');
    c.at(9000, { type: 'replyEnd', turnId: 1 });
    expect(c.phase).toBe('listening');

    expect(c.log).toEqual(['0 mic on', '3800 send #1 "my mum has been very unsettled today"']);
  });

  it('answers a whole question sooner than a statement', () => {
    const c = conversation()
      .at(0, { type: 'start' })
      .at(1000, { type: 'speechStart' })
      .at(2500, { type: 'heard', text: 'how do I manage sundowning' })
      .at(2600, { type: 'speechEnd' })
      .until(3300);
    expect(c.log).toContain('3300 send #1 "how do I manage sundowning"');
  });

  it('starts each listening span with a clean transcript', () => {
    const c = speaking().at(9000, { type: 'replyEnd', turnId: 1 });
    const resets = c.effects.filter((e) => e.type === 'resetTranscript');
    // On opening the microphone, on sending the turn, and on listening again.
    expect(resets).toHaveLength(3);
    expect(c.state.heard).toBe('');
  });

  it('numbers each turn', () => {
    const c = speaking()
      .at(9000, { type: 'replyEnd', turnId: 1 })
      .at(10000, { type: 'speechStart' })
      .at(11000, { type: 'heard', text: 'what about at night time' })
      .at(11100, { type: 'speechEnd' })
      .until(12000);
    expect(c.log.filter((l) => l.includes('send'))).toEqual([
      '3300 send #1 "how do I manage sundowning"',
      '11800 send #2 "what about at night time"',
    ]);
  });
});

describe('someone who pauses', () => {
  it('waits longer when the words stop mid-clause, and takes the rest as the same turn', () => {
    const c = conversation()
      .at(0, { type: 'start' })
      .at(1000, { type: 'speechStart' })
      .at(3000, { type: 'heard', text: 'my mum keeps getting up at night and' })
      .at(3100, { type: 'speechEnd' })
      .until(4800); // 1.7 s of silence: past the base wait, inside the mid-clause one
    expect(c.phase).toBe('endOfTurnCheck');

    c.at(4900, { type: 'speechStart' });
    expect(c.phase).toBe('userSpeaking');
    c.at(6500, {
      type: 'heard',
      text: 'my mum keeps getting up at night and I am worried she will fall',
    });
    c.at(6600, { type: 'speechEnd' }).until(8000);

    expect(c.log.filter((l) => l.includes('send'))).toEqual([
      '7800 send #1 "my mum keeps getting up at night and I am worried she will fall"',
    ]);
  });

  it('re-times the wait when the recogniser revises the words after speech has stopped', () => {
    // The first words look finished; the revision shows she broke off mid-clause.
    const late = conversation()
      .at(0, { type: 'start' })
      .at(1000, { type: 'speechStart' })
      .at(2000, { type: 'heard', text: 'she will not take her tablets' })
      .at(2100, { type: 'speechEnd' })
      .at(2400, { type: 'heard', text: 'she will not take her tablets because' })
      .until(3400);
    expect(late.phase).toBe('endOfTurnCheck'); // the base wait would have sent it at 3,300
    late.until(4300);
    expect(late.log).toContain('4300 send #1 "she will not take her tablets because"');

    // The other way: the revision completes a question, and the wait is already over.
    const early = conversation()
      .at(0, { type: 'start' })
      .at(1000, { type: 'speechStart' })
      .at(2000, { type: 'heard', text: 'should I call the' })
      .at(2100, { type: 'speechEnd' })
      .at(2900, { type: 'heard', text: 'should I call the doctor' });
    expect(early.log).toContain('2900 send #1 "should I call the doctor"');
  });

  it('sends at once on "I’m done", without waiting out the pause', () => {
    const c = conversation()
      .at(0, { type: 'start' })
      .at(1000, { type: 'speechStart' })
      .at(2000, { type: 'heard', text: 'I am not sure what to do about the' })
      .at(2050, { type: 'userDone' });
    expect(c.log).toContain('2050 send #1 "I am not sure what to do about the"');

    const afterPause = conversation()
      .at(0, { type: 'start' })
      .at(1000, { type: 'speechStart' })
      .at(2000, { type: 'heard', text: 'she seems very tired and' })
      .at(2100, { type: 'speechEnd' })
      .at(2300, { type: 'userDone' });
    expect(afterPause.log).toContain('2300 send #1 "she seems very tired and"');
  });

  it('treats a very long stretch of speech as ended, so the conversation cannot hang', () => {
    const c = conversation()
      .at(0, { type: 'start' })
      .at(1000, { type: 'speechStart' })
      .at(5000, { type: 'heard', text: 'well it all started last winter' })
      .until(46000); // the 45 s cap
    expect(c.phase).toBe('endOfTurnCheck');
    c.until(47200);
    expect(c.log).toContain('47200 send #1 "well it all started last winter"');
  });
});

describe('speech that produced no words', () => {
  it('waits for the recogniser, and sends as soon as the words arrive', () => {
    const c = conversation()
      .at(0, { type: 'start' })
      .at(1000, { type: 'speechStart' })
      .at(2000, { type: 'speechEnd' })
      .until(3200);
    expect(c.phase).toBe('endOfTurnCheck');
    expect(c.log).toEqual(['0 mic on']);
    c.at(3500, { type: 'heard', text: '' }); // still nothing
    expect(c.phase).toBe('endOfTurnCheck');
    c.at(3900, { type: 'heard', text: 'is she in pain' });
    expect(c.log).toContain('3900 send #1 "is she in pain"');
  });

  it('says it did not catch that, and keeps listening, when no words ever come', () => {
    const c = conversation()
      .at(0, { type: 'start' })
      .at(1000, { type: 'speechStart' })
      .at(2000, { type: 'speechEnd' })
      .until(4700); // 1.2 s wait, then 1.5 s for the words
    expect(c.log).toEqual(['0 mic on', '4700 notify didNotCatch']);
    expect(c.phase).toBe('listening');
  });

  it('waits for the words after "I’m done" too', () => {
    const c = conversation()
      .at(0, { type: 'start' })
      .at(1000, { type: 'speechStart' })
      .at(1500, { type: 'userDone' });
    expect(c.phase).toBe('endOfTurnCheck');
    c.at(1800, { type: 'heard', text: 'thank you' });
    expect(c.log).toContain('1800 send #1 "thank you"');
  });
});

describe('talking over the assistant', () => {
  it('lowers the volume at the first sound, and stops to listen once the person keeps talking', () => {
    const c = speaking().at(6000, { type: 'speechStart' });
    expect(c.phase).toBe('bargeInCheck');
    expect(c.log).toContain('6000 duck');

    c.at(6300, { type: 'heard', text: 'sorry can I' }).until(6400);
    expect(c.phase).toBe('userSpeaking');
    expect(c.log.slice(-2)).toEqual(['6400 unduck', '6400 stop #1 (bargeIn)']);

    // What they said while interrupting is the start of their next turn.
    c.at(8000, { type: 'heard', text: 'sorry can I ask about her tablets instead' })
      .at(8100, { type: 'speechEnd' })
      .until(9400);
    expect(c.log).toContain('9300 send #2 "sorry can I ask about her tablets instead"');
  });

  it('ignores the stopped reply from then on', () => {
    const c = speaking().at(6000, { type: 'speechStart' }).until(6400);
    const before = c.state;
    c.at(6500, { type: 'replyEnd', turnId: 1 }); // the old reply winding down
    expect(c.state).toBe(before);
    expect(c.phase).toBe('userSpeaking');
  });

  it('carries on speaking after a short sound: a cough, or "mm-hm"', () => {
    const c = speaking().at(6000, { type: 'speechStart' }).at(6250, { type: 'speechEnd' });
    expect(c.phase).toBe('speaking');
    expect(c.log.slice(-2)).toEqual(['6000 duck', '6250 unduck']);
    c.until(7000);
    expect(c.log.some((l) => l.includes('stop'))).toBe(false);
    // The sound's words are thrown away.
    expect(c.effects.at(-1)).toEqual({ type: 'resetTranscript' });
  });

  it('listens to whatever is said next when the reply ends during the check', () => {
    const c = speaking()
      .at(6000, { type: 'speechStart' })
      .at(6200, { type: 'replyEnd', turnId: 1 });
    expect(c.phase).toBe('userSpeaking');
    expect(c.log.at(-1)).toBe('6200 unduck');
    c.at(7000, { type: 'heard', text: 'thank you that helps' })
      .at(7100, { type: 'speechEnd' })
      .until(8400);
    expect(c.log).toContain('8300 send #2 "thank you that helps"');
  });

  it('stops on the stop control, and goes back to listening', () => {
    const c = speaking().at(6000, { type: 'interrupt' });
    expect(c.log.at(-1)).toBe('6000 stop #1 (stopped)');
    expect(c.phase).toBe('listening');
    // Nothing to stop once it has stopped.
    const before = c.state;
    c.at(6100, { type: 'interrupt' });
    expect(c.state).toBe(before);
  });

  it('restores the volume when the stop control is used during a check', () => {
    const c = speaking().at(6000, { type: 'speechStart' }).at(6100, { type: 'interrupt' });
    expect(c.log.slice(-2)).toEqual(['6100 unduck', '6100 stop #1 (stopped)']);
    expect(c.timers.has('bargeIn')).toBe(false);
  });
});

describe('the assistant hearing itself', () => {
  const echo = { type: 'heard', text: 'close the curtains before dusk', echo: true } as const;

  it('does not interrupt itself when the words heard are its own', () => {
    const c = speaking().at(6000, { type: 'speechStart' }).at(6300, echo).until(6400);
    expect(c.phase).toBe('speaking');
    expect(c.log.at(-1)).toBe('6400 unduck');
    expect(c.log.some((l) => l.includes('stop'))).toBe(false);
    expect(c.state.falseTriggers).toBe(1);
  });

  it('goes by the latest words: an echo followed by the person speaking is an interruption', () => {
    const c = speaking()
      .at(6000, { type: 'speechStart' })
      .at(6200, echo)
      .at(6350, { type: 'heard', text: 'close the curtains before dusk no wait' })
      .until(6400);
    expect(c.log.at(-1)).toBe('6400 stop #1 (bargeIn)');
  });

  it('after the second time, stops listening while it speaks and says so once', () => {
    const c = speaking().at(6000, { type: 'speechStart' }).at(6300, echo).until(6400);
    c.at(6500, { type: 'speechEnd' }); // nothing is being checked now
    c.at(7000, { type: 'speechStart' }).at(7300, echo).until(7400);
    expect(c.state.strictTurns).toBe(true);
    expect(c.log.at(-1)).toBe('7400 notify strictTurns');

    // Sound is no longer acted on while it speaks.
    const before = c.state;
    c.at(8000, { type: 'speechStart' });
    expect(c.state).toBe(before);
    c.at(8200, { type: 'heard', text: 'anything' });
    expect(c.state).toBe(before);

    // The stop control still works, and the person is heard as usual afterwards.
    c.at(9000, { type: 'interrupt' });
    expect(c.phase).toBe('listening');
    c.at(10000, { type: 'speechStart' });
    expect(c.phase).toBe('userSpeaking');
    expect(c.log.filter((l) => l.includes('strictTurns'))).toHaveLength(1);
  });
});

describe('carrying on before the reply is heard', () => {
  /** The question has been sent and nothing is audible yet. */
  const thinking = () =>
    conversation()
      .at(0, { type: 'start' })
      .at(1000, { type: 'speechStart' })
      .at(2000, { type: 'heard', text: 'what should I do' })
      .at(2100, { type: 'speechEnd' })
      .until(2800);

  it('stops the unheard reply and sends the turn again with the rest of what they said', () => {
    const c = thinking();
    expect(c.log.at(-1)).toBe('2800 send #1 "what should I do"');

    c.at(3000, { type: 'speechStart' });
    expect(c.phase).toBe('bargeInCheck');
    expect(c.log.some((l) => l.includes('duck'))).toBe(false); // nothing is playing
    c.until(3400);
    expect(c.log.at(-1)).toBe('3400 stop #1 (resumed)');
    expect(c.phase).toBe('userSpeaking');

    c.at(5000, { type: 'heard', text: 'when she refuses to eat' })
      .at(5100, { type: 'speechEnd' })
      .until(6400);
    // Together the two parts make a whole question, so the shorter wait applies.
    expect(c.log.at(-1)).toBe(
      '5800 send #2 "what should I do when she refuses to eat" replacing #1'
    );
  });

  it('sends the original question again if the rest produced no words', () => {
    const c = thinking().at(3000, { type: 'speechStart' }).until(3400);
    c.at(3600, { type: 'speechEnd' }).until(4400);
    expect(c.log.at(-1)).toBe('4300 send #2 "what should I do" replacing #1');
  });

  it('lets a short sound pass without stopping anything', () => {
    const c = thinking().at(3000, { type: 'speechStart' }).at(3200, { type: 'speechEnd' });
    expect(c.phase).toBe('thinking');
    expect(c.log.some((l) => l.includes('stop'))).toBe(false);
    c.at(3600, { type: 'replyStart', turnId: 1 });
    expect(c.phase).toBe('speaking');
  });

  it('treats it as talking over the reply if the reply becomes audible first', () => {
    const c = thinking()
      .at(3000, { type: 'speechStart' })
      .at(3200, { type: 'replyStart', turnId: 1 });
    expect(c.log.at(-1)).toBe('3200 duck');
    c.until(3400);
    expect(c.log.slice(-2)).toEqual(['3400 unduck', '3400 stop #1 (bargeIn)']);
    c.at(5000, { type: 'heard', text: 'actually never mind' })
      .at(5100, { type: 'speechEnd' })
      .until(6400);
    // A new turn, not a continuation: part of the reply was heard.
    expect(c.log.at(-1)).toBe('6300 send #2 "actually never mind"');
  });

  it('goes back to listening if the reply ends without ever being heard', () => {
    const c = thinking().at(3000, { type: 'replyEnd', turnId: 1 });
    expect(c.phase).toBe('listening');
  });
});

describe('typed questions', () => {
  it('runs a turn with the microphone closed, and stays closed afterwards', () => {
    const c = conversation().at(0, {
      type: 'textSubmitted',
      text: '  How do I manage sundowning?  ',
    });
    expect(c.log).toEqual(['0 send #1 "How do I manage sundowning?"']);
    expect(c.phase).toBe('thinking');
    c.at(900, { type: 'replyStart', turnId: 1 });
    // No microphone, so sound cannot interrupt.
    const before = c.state;
    c.at(1500, { type: 'speechStart' });
    expect(c.state).toBe(before);
    c.at(5000, { type: 'replyEnd', turnId: 1 });
    expect(c.phase).toBe('idle');
    expect(c.log).toHaveLength(1);
  });

  it('ignores an empty message', () => {
    const c = conversation();
    const before = c.state;
    c.at(0, { type: 'textSubmitted', text: '   ' });
    expect(c.state).toBe(before);
  });

  it('replaces a reply that is being spoken', () => {
    const c = speaking().at(6000, { type: 'textSubmitted', text: 'What about her tablets?' });
    expect(c.log.slice(-2)).toEqual([
      '6000 stop #1 (superseded)',
      '6000 send #2 "What about her tablets?"',
    ]);
    c.at(7000, { type: 'replyStart', turnId: 2 }).at(9000, { type: 'replyEnd', turnId: 2 });
    expect(c.phase).toBe('listening');
  });

  it('takes over from speech in progress, and from a volume check', () => {
    const mid = conversation()
      .at(0, { type: 'start' })
      .at(1000, { type: 'speechStart' })
      .at(1500, { type: 'textSubmitted', text: 'Typed instead' });
    expect(mid.log.at(-1)).toBe('1500 send #1 "Typed instead"');
    expect(mid.timers.size).toBe(0);

    const checking = speaking()
      .at(6000, { type: 'speechStart' })
      .at(6100, { type: 'textSubmitted', text: 'Typed' });
    expect(checking.log.slice(-3)).toEqual([
      '6100 unduck',
      '6100 stop #1 (superseded)',
      '6100 send #2 "Typed"',
    ]);
  });

  it('lets the microphone be opened while a typed turn is answered, without restarting it', () => {
    const c = conversation()
      .at(0, { type: 'textSubmitted', text: 'A question' })
      .at(500, { type: 'replyStart', turnId: 1 })
      .at(1000, { type: 'start' });
    expect(c.phase).toBe('speaking');
    expect(c.log.at(-1)).toBe('1000 mic on');
    c.at(2000, { type: 'speechStart' });
    expect(c.phase).toBe('bargeInCheck'); // and now it can be spoken over
    c.at(2100, { type: 'speechEnd' }).at(4000, { type: 'replyEnd', turnId: 1 });
    expect(c.phase).toBe('listening');
  });
});

describe('starting, pausing and stopping', () => {
  it('ignores a second start', () => {
    const c = conversation().at(0, { type: 'start' });
    const before = c.state;
    c.at(100, { type: 'start' });
    expect(c.state).toBe(before);
  });

  it('holds the conversation on pause: stops the reply, closes the microphone, and resumes listening', () => {
    const c = speaking().at(6000, { type: 'pause' });
    expect(c.log.slice(-2)).toEqual(['6000 stop #1 (paused)', '6000 mic off']);
    expect(c.phase).toBe('paused');
    expect(c.timers.size).toBe(0);

    // Sound means nothing while paused, and pausing twice changes nothing.
    const before = c.state;
    c.at(6500, { type: 'speechStart' }).at(6600, { type: 'pause' });
    expect(c.state).toBe(before);

    c.at(8000, { type: 'resume' });
    expect(c.log.at(-1)).toBe('8000 mic on');
    expect(c.phase).toBe('listening');
  });

  it('only resumes what was paused', () => {
    const c = conversation();
    const before = c.state;
    c.at(0, { type: 'resume' }).at(10, { type: 'pause' });
    expect(c.state).toBe(before);
  });

  it('answers a typed question while paused and stays paused', () => {
    const c = conversation()
      .at(0, { type: 'start' })
      .at(100, { type: 'pause' })
      .at(500, { type: 'textSubmitted', text: 'A typed question' })
      .at(900, { type: 'replyStart', turnId: 1 });
    expect(c.phase).toBe('speaking');
    c.at(3000, { type: 'replyEnd', turnId: 1 });
    expect(c.phase).toBe('paused');
  });

  it('resumes into a typed turn that is still being answered', () => {
    const c = conversation()
      .at(0, { type: 'start' })
      .at(100, { type: 'pause' })
      .at(500, { type: 'textSubmitted', text: 'A typed question' })
      .at(700, { type: 'resume' });
    expect(c.phase).toBe('thinking');
    expect(c.state.mic).toBe('on');
  });

  it('treats start while paused as resuming', () => {
    const c = conversation()
      .at(0, { type: 'start' })
      .at(100, { type: 'pause' })
      .at(200, { type: 'start' });
    expect(c.phase).toBe('listening');
  });

  it('ends everything on stop', () => {
    const c = speaking().at(6000, { type: 'speechStart' }).at(6100, { type: 'stop' });
    expect(c.log.slice(-3)).toEqual(['6100 unduck', '6100 stop #1 (stopped)', '6100 mic off']);
    expect(c.phase).toBe('idle');
    expect(c.state.mic).toBe('off');
    expect(c.timers.size).toBe(0);
    // Stopping again does nothing.
    const before = c.state;
    c.at(6200, { type: 'stop' });
    expect(c.state).toBe(before);
  });

  it('stops a typed turn without touching a microphone that was never opened', () => {
    const c = conversation()
      .at(0, { type: 'textSubmitted', text: 'A question' })
      .at(500, { type: 'stop' });
    expect(c.log).toEqual(['0 send #1 "A question"', '500 stop #1 (stopped)']);
  });

  it('ends a paused conversation without closing the microphone twice', () => {
    const c = conversation()
      .at(0, { type: 'start' })
      .at(100, { type: 'pause' })
      .at(200, { type: 'stop' });
    expect(c.log).toEqual(['0 mic on', '100 mic off']);
    expect(c.state.mic).toBe('off');
  });

  it('stops a typed turn on the stop control and rests where it was', () => {
    const idle = conversation()
      .at(0, { type: 'textSubmitted', text: 'A question' })
      .at(500, { type: 'interrupt' });
    expect(idle.phase).toBe('idle');
    const paused = conversation()
      .at(0, { type: 'start' })
      .at(100, { type: 'pause' })
      .at(500, { type: 'textSubmitted', text: 'A question' })
      .at(900, { type: 'interrupt' });
    expect(paused.phase).toBe('paused');
  });

  it('closes the microphone after a long silence, and says so', () => {
    const c = conversation().at(0, { type: 'start' }).until(90_000);
    expect(c.log).toEqual(['0 mic on', '90000 mic off', '90000 notify listeningTimedOut']);
    expect(c.phase).toBe('idle');
    expect(c.state.mic).toBe('off');
  });

  it('does not time out while someone is speaking or being answered', () => {
    const c = speaking().until(200_000);
    expect(c.phase).toBe('speaking');
    expect(c.log.some((l) => l.includes('listeningTimedOut'))).toBe(false);
  });
});

describe('events that no longer apply', () => {
  it('ignores a timer that was cancelled or replaced', () => {
    const c = conversation().at(0, { type: 'start' });
    const stale = c.timers.get('listenTimeout')!.token;
    c.at(1000, { type: 'speechStart' });
    const before = c.state;
    const result = c.apply({ type: 'timer', timer: 'listenTimeout', token: stale, at: 90_000 });
    expect(result.state).toBe(before);
    expect(result.effects).toEqual([]);
  });

  it('ignores reply events from a turn that has been replaced', () => {
    const c = speaking().at(6000, { type: 'textSubmitted', text: 'Another question' });
    const before = c.state;
    c.at(6100, { type: 'replyStart', turnId: 1 }).at(6200, { type: 'replyEnd', turnId: 1 });
    expect(c.state).toBe(before);
  });

  it.each<[string, Scripted]>([
    ['speech ending', { type: 'speechEnd' }],
    ['words', { type: 'heard', text: 'hello' }],
    ['"I’m done"', { type: 'userDone' }],
    ['the stop control', { type: 'interrupt' }],
    ['a reply starting', { type: 'replyStart', turnId: 0 }],
    ['a reply ending', { type: 'replyEnd', turnId: 0 }],
    ['speech starting', { type: 'speechStart' }],
    ['stop', { type: 'stop' }],
  ])('does nothing with %s before a conversation has begun', (_name, event) => {
    const c = conversation();
    const before = c.state;
    c.at(0, event);
    expect(c.state).toBe(before);
    expect(c.effects).toEqual([]);
  });

  it('ignores a reply that says it started again', () => {
    const c = speaking();
    const before = c.state;
    c.at(4500, { type: 'replyStart', turnId: 1 });
    expect(c.state).toBe(before);
  });

  it('keeps words that arrive before the microphone reports speech', () => {
    const c = conversation().at(0, { type: 'start' }).at(900, { type: 'heard', text: 'how' });
    expect(c.phase).toBe('listening');
    expect(c.state.heard).toBe('how');
  });

  it('never changes the state it was given', () => {
    const state = initialTurnState();
    const copy = JSON.parse(JSON.stringify(state)) as unknown;
    step(state, { type: 'start' });
    expect(state).toEqual(copy);
  });
});
