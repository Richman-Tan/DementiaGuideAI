// @vitest-environment jsdom
// The hook around the conversation (voice/useConversation.js): what the voice
// screen is given, and how its one microphone button maps onto the
// conversation's controls. The controller is a recording fake.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, flush, cleanup } from './helpers/render.js';

const fx = vi.hoisted(() => ({ controllers: [] }));

vi.mock('../src/voice/conversationController.js', () => {
  const INITIAL_SNAPSHOT = {
    phase: 'idle',
    mic: 'off',
    micLive: false,
    heard: '',
    pending: '',
    subtitle: '',
    notice: '',
    error: '',
  };
  return {
    INITIAL_SNAPSHOT,
    createConversation: vi.fn((options) => {
      const c = { options, snapshot: INITIAL_SNAPSHOT };
      for (const m of [
        'start',
        'stop',
        'pause',
        'resume',
        'done',
        'interrupt',
        'ask',
        'repeat',
        'clearError',
        'dispose',
      ])
        c[m] = vi.fn();
      /** The conversation moves on. */
      c.update = (patch) => {
        c.snapshot = { ...c.snapshot, ...patch };
        options.onChange(c.snapshot);
      };
      fx.controllers.push(c);
      return c;
    }),
  };
});
vi.mock('../src/services/turnClient.js', () => ({ serverGenerate: 'serverGenerate' }));
vi.mock('../src/services/ttsClient.js', () => ({ tts: 'tts' }));
vi.mock('../src/voice/liveWords.js', () => ({ startLiveWords: 'startLiveWords' }));
vi.mock('../src/voice/micInput.js', () => ({ openMicInput: 'openMicInput' }));

const { useConversation, screenState } = await import('../src/voice/useConversation.js');

const controller = () => fx.controllers.at(-1);
const props = (overrides = {}) => ({
  enabled: true,
  avatar: { name: 'avatar' },
  settings: { avatarId: 'aaron' },
  messages: [],
  appendMessage: vi.fn(),
  muted: false,
  ...overrides,
});

beforeEach(() => {
  fx.controllers.length = 0;
});
afterEach(cleanup);

describe('screenState', () => {
  it.each([
    ['idle', 'idle'],
    ['paused', 'idle'],
    ['listening', 'listening'],
    ['userSpeaking', 'listening'],
    ['endOfTurnCheck', 'listening'],
    ['thinking', 'thinking'],
    ['speaking', 'speaking'],
  ])('shows %s as %s', (phase, shown) => {
    expect(screenState({ phase, subtitle: '' })).toBe(shown);
  });

  it('keeps the screen as it was while a sound over a reply is being checked', () => {
    expect(screenState({ phase: 'bargeInCheck', subtitle: 'Keep afternoons calm.' })).toBe(
      'speaking'
    );
    expect(screenState({ phase: 'bargeInCheck', subtitle: '' })).toBe('thinking');
  });
});

describe('useConversation', () => {
  it('builds the conversation with the real services, and reads the latest props when asked', async () => {
    const initial = props();
    const { rerender } = await renderHook(useConversation, { initialProps: initial });
    const { options } = controller();
    expect(options.services).toEqual({
      openMicInput: 'openMicInput',
      startLiveWords: 'startLiveWords',
      serverGenerate: 'serverGenerate',
      tts: 'tts',
    });
    expect(options.appendMessage).toBe(initial.appendMessage);
    expect(options.getAvatar()).toBe(initial.avatar);
    expect(options.getMuted()).toBe(false);

    const next = props({
      appendMessage: initial.appendMessage,
      settings: { avatarId: 'ariana' },
      messages: [{ role: 'user', text: 'Hello' }],
      muted: true,
    });
    await rerender(next);
    expect(fx.controllers).toHaveLength(1); // the same conversation
    expect(options.getSettings()).toEqual({ avatarId: 'ariana' });
    expect(options.getMessages()).toEqual([{ role: 'user', text: 'Hello' }]);
    expect(options.getMuted()).toBe(true);
  });

  it('gives the screen what it reads, following the conversation as it moves', async () => {
    const { result } = await renderHook(useConversation, { initialProps: props() });
    expect(result.current).toMatchObject({
      vState: 'idle',
      vTranscript: '',
      vDone: false,
      vSubtitle: '',
      error: null,
      notice: '',
      phase: 'idle',
      micLive: false,
    });
    await flush(() => controller().update({ phase: 'listening', micLive: true }));
    expect(result.current.micLive).toBe(true);

    await flush(() => controller().update({ phase: 'userSpeaking', heard: 'how do I' }));
    expect(result.current).toMatchObject({
      vState: 'listening',
      vTranscript: 'how do I',
      vDone: false,
    });

    await flush(() =>
      controller().update({ phase: 'thinking', heard: '', pending: 'how do I manage' })
    );
    expect(result.current).toMatchObject({
      vState: 'thinking',
      vTranscript: 'how do I manage',
      vDone: true,
    });

    await flush(() =>
      controller().update({
        phase: 'speaking',
        pending: '',
        subtitle: 'Keep afternoons calm.',
        notice: 'A notice',
        error: 'An error',
      })
    );
    expect(result.current).toMatchObject({
      vState: 'speaking',
      vSubtitle: 'Keep afternoons calm.',
      notice: 'A notice',
      error: 'An error',
      phase: 'speaking',
    });
  });

  it.each([
    ['idle', 'start'],
    ['paused', 'start'],
    ['listening', 'stop'],
    ['userSpeaking', 'done'],
    ['endOfTurnCheck', 'done'],
    ['thinking', 'interrupt'],
    ['speaking', 'interrupt'],
    ['bargeInCheck', 'interrupt'],
  ])('the microphone button, while %s, calls %s', async (phase, method) => {
    const { result } = await renderHook(useConversation, { initialProps: props() });
    await flush(() => controller().update({ phase }));
    result.current.micTap();
    expect(controller()[method]).toHaveBeenCalledTimes(1);
  });

  it('passes the other controls through', async () => {
    const { result } = await renderHook(useConversation, { initialProps: props() });
    result.current.askText('A question');
    result.current.askText();
    result.current.repeatLast();
    result.current.stop();
    result.current.clearError();
    const c = controller();
    expect(c.ask.mock.calls).toEqual([['A question'], ['']]);
    expect(c.repeat).toHaveBeenCalledTimes(1);
    expect(c.stop).toHaveBeenCalledTimes(1);
    expect(c.clearError).toHaveBeenCalledTimes(1);
  });

  it('builds nothing while it is not enabled, and its controls do nothing', async () => {
    const { result } = await renderHook(useConversation, {
      initialProps: props({ enabled: false }),
    });
    expect(fx.controllers).toHaveLength(0);
    expect(() => {
      result.current.micTap();
      result.current.askText('Hello');
      result.current.repeatLast();
      result.current.stop();
      result.current.clearError();
    }).not.toThrow();
    expect(result.current.vState).toBe('idle');
  });

  it('ends the conversation when it is switched off or the screen is left', async () => {
    const initial = props();
    const { result, rerender, unmount } = await renderHook(useConversation, {
      initialProps: initial,
    });
    const first = controller();
    await flush(() => first.update({ phase: 'speaking', subtitle: 'Hello.' }));
    await rerender({ ...initial, enabled: false });
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(result.current.vState).toBe('idle');

    await rerender({ ...initial, enabled: true });
    expect(fx.controllers).toHaveLength(2);
    await unmount();
    expect(controller().dispose).toHaveBeenCalledTimes(1);
  });
});
