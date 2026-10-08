// @vitest-environment jsdom
// The conversation store shared by Chat, Voice and Home (state/ChatContext.jsx):
// what renders on first paint, which server thread a (user, study arm) writes
// to, the typed-turn loop with its study events, failure + retry, cancelling a
// turn, and "New conversation" vs "Clear history". The persistence layer,
// auth, settings, the reply generator and the latency timer are faked; the
// study store, router, credential copy and transport are the real ones.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, flush, settle, cleanup } from './helpers/render.js';
import { saveStudy, studyConversationId } from '../src/study/studyStore.js';
import { saveAccess } from '../src/state/accessStore.js';
import { MODALITY_TYPED, PROTOCOL_FEEDBACK } from '@core/study/studyConfig.mjs';

const h = vi.hoisted(() => ({
  auth: { userId: 'u1', status: 'ready' },
  settings: { avatarId: 'aaron', concise: false },
  study: { active: false },
  turn: { mark: () => {}, finish: () => {} },
}));

vi.mock('../src/state/conversationStore.js', () => ({
  loadCached: vi.fn(() => null),
  saveCached: vi.fn(),
  clearCached: vi.fn(),
  getOrCreateConversation: vi.fn(async () => 'conv-1'),
  loadMessages: vi.fn(async () => []),
  appendMessage: vi.fn(async () => {}),
  startNewConversation: vi.fn(async () => 'conv-new'),
  migrateLegacyHistory: vi.fn(async () => {}),
  deleteAllConversations: vi.fn(async () => ({ deleted: true, scope: 'server' })),
}));
vi.mock('../src/state/AuthContext.jsx', () => ({ useAuth: () => h.auth }));
vi.mock('../src/state/SettingsContext.jsx', () => ({ useSettings: () => ({ settings: h.settings }) }));
vi.mock('../src/services/chatService.js', () => ({ isMockMode: vi.fn(() => false), generateReply: vi.fn() }));
vi.mock('../src/study/StudyContext.jsx', () => ({ useStudy: () => h.study }));
vi.mock('../src/study/latency.js', () => ({ createTurnTimer: vi.fn(() => h.turn) }));
vi.mock('../src/study/events.js', () => ({ emit: vi.fn(), newUuid: vi.fn(() => 'turn-uuid') }));
vi.mock('../src/avatar/effectiveProfile.js', () => ({ resolveEffectiveProfile: vi.fn((id) => ({ id: `effective-${id}` })) }));

const { ChatProvider, useChat } = await import('../src/state/ChatContext.jsx');
const store = await import('../src/state/conversationStore.js');
const { isMockMode, generateReply } = await import('../src/services/chatService.js');
const { emit } = await import('../src/study/events.js');
const { createTurnTimer } = await import('../src/study/latency.js');

const SESSION = '11111111-2222-3333-4444-555555555555';
const startStudy = (patch = {}) => saveStudy({
  sessionId: SESSION, accessCode: 'study-access-code-0001', armOrder: 'BA', stageIndex: 0,
  step: 'task', taskId: 'task-1', consentTranscripts: true, ...patch,
});

const mount = () => renderHook(() => useChat(), { wrapper: ChatProvider });
const texts = (msgs) => msgs.map((m) => `${m.role}:${m.text}`);
const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

beforeEach(() => {
  localStorage.clear();
  location.hash = '';
  h.auth = { userId: 'u1', status: 'ready' };
  h.settings = { avatarId: 'aaron', concise: false };
  h.study = { active: false };
  h.turn = { mark: vi.fn(), finish: vi.fn() };
  vi.clearAllMocks();
  store.loadCached.mockReturnValue(null);
  store.getOrCreateConversation.mockResolvedValue('conv-1');
  store.loadMessages.mockResolvedValue([]);
  store.startNewConversation.mockResolvedValue('conv-new');
  store.deleteAllConversations.mockResolvedValue({ deleted: true, scope: 'server' });
  isMockMode.mockReturnValue(false);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('first paint', () => {
  it('renders the cache immediately', async () => {
    store.loadCached.mockReturnValue([{ role: 'user', text: 'cached question' }]);
    h.auth = { userId: null, status: 'loading' };
    const { result } = await mount();
    expect(texts(result.current.messages)).toEqual(['user:cached question']);
  });

  it('shows the demo seed outside a study, and an empty screen inside one', async () => {
    h.auth = { userId: null, status: 'loading' };
    const outside = await mount();
    expect(outside.result.current.messages).toHaveLength(4);
    await outside.unmount();
    startStudy();
    const inside = await mount();
    expect(inside.result.current.messages).toEqual([]);
  });

  it('exposes the mock flag and the drawer state', async () => {
    isMockMode.mockReturnValue(true);
    const { result } = await mount();
    expect(result.current.mock).toBe(true);
    await flush(() => result.current.setDrawer({ title: 'src' }));
    expect(result.current.drawer).toEqual({ title: 'src' });
  });
});

describe('entering a study session', () => {
  it('clears the seed when the session starts after mount', async () => {
    const { result, rerender } = await mount();
    expect(result.current.messages).toHaveLength(4);
    h.study = { active: true };
    await rerender();
    expect(result.current.messages).toEqual([]);
    expect(store.clearCached).toHaveBeenCalledTimes(1);
  });

  it('a reload mid-session keeps what the participant has accumulated', async () => {
    store.loadCached.mockReturnValue([{ role: 'user', text: 'task question' }]);
    h.study = { active: true };
    startStudy();
    const { result, rerender } = await mount();
    await rerender();
    expect(texts(result.current.messages)).toEqual(['user:task question']);
    expect(store.clearCached).not.toHaveBeenCalled();
  });
});

describe('which server thread', () => {
  it('waits for auth before touching the server', async () => {
    h.auth = { userId: 'u1', status: 'loading' };
    await mount();
    await settle();
    expect(store.getOrCreateConversation).not.toHaveBeenCalled();
    h.auth = { userId: null, status: 'ready' };
    await mount();
    await settle();
    expect(store.getOrCreateConversation).not.toHaveBeenCalled();
  });

  it('outside a study: reuses the user’s thread, migrates legacy history, adopts the server copy', async () => {
    store.loadMessages.mockResolvedValue([{ role: 'user', text: 'from server' }]);
    const { result } = await mount();
    await settle();
    expect(store.getOrCreateConversation).toHaveBeenCalledWith('u1', { surface: 'chat', studyArm: null });
    expect(store.migrateLegacyHistory).toHaveBeenCalledWith('u1', 'conv-1');
    expect(store.loadMessages).toHaveBeenCalledWith('conv-1');
    expect(texts(result.current.messages)).toEqual(['user:from server']);
    expect(store.saveCached).toHaveBeenCalledWith([{ role: 'user', text: 'from server' }]);
    expect(result.current.conversationId).toBe('conv-1');
  });

  it('an empty server copy of the same thread does not blank the cached screen', async () => {
    store.loadCached.mockReturnValue([{ role: 'user', text: 'cached' }]);
    const { result } = await mount();
    await settle();
    expect(texts(result.current.messages)).toEqual(['user:cached']);
    expect(store.saveCached).not.toHaveBeenCalled();
  });

  it('no thread (server unreachable) leaves the screen alone', async () => {
    store.getOrCreateConversation.mockResolvedValue(null);
    const { result } = await mount();
    await settle();
    expect(result.current.conversationId).toBeNull();
    expect(store.loadMessages).not.toHaveBeenCalled();
  });

  it('in a study: rejoins the session’s remembered thread for the arm, never migrating', async () => {
    startStudy({ convoIds: { B: 'conv-b' } });
    h.study = { active: true };
    const { result } = await mount();
    await settle();
    expect(store.startNewConversation).not.toHaveBeenCalled();
    expect(store.getOrCreateConversation).not.toHaveBeenCalled();
    expect(store.migrateLegacyHistory).not.toHaveBeenCalled();
    expect(store.loadMessages).toHaveBeenCalledWith('conv-b');
    expect(result.current.conversationId).toBe('conv-b');
  });

  it('in a study with no thread yet: starts a fresh one for the arm and remembers it', async () => {
    startStudy();
    h.study = { active: true };
    store.startNewConversation.mockResolvedValue('conv-b-new');
    await mount();
    await settle();
    expect(store.startNewConversation).toHaveBeenCalledWith('u1', { surface: 'chat', studyArm: 'B' });
    expect(studyConversationId('B')).toBe('conv-b-new');
  });

  it('on the feedback protocol the thread is keyed "free" and stored with no arm', async () => {
    startStudy({ protocol: PROTOCOL_FEEDBACK });
    h.study = { active: true };
    await mount();
    await settle();
    expect(store.startNewConversation).toHaveBeenCalledWith('u1', { surface: 'chat', studyArm: null });
    expect(studyConversationId('free')).toBe('conv-new');
  });

  it('a failed fresh-thread insert is not remembered', async () => {
    startStudy();
    h.study = { active: true };
    store.startNewConversation.mockResolvedValue(null);
    const { result } = await mount();
    await settle();
    expect(studyConversationId('B')).toBeNull();
    expect(result.current.conversationId).toBeNull();
  });

  it('switching arms replaces the screen even when the new thread is empty', async () => {
    startStudy({ convoIds: { B: 'conv-b' } });
    h.study = { active: true };
    store.loadMessages.mockImplementation(async (id) => (id === 'conv-b' ? [{ role: 'user', text: 'arm B question' }] : []));
    store.startNewConversation.mockResolvedValue('conv-a');
    const { result, rerender } = await mount();
    await settle();
    expect(texts(result.current.messages)).toEqual(['user:arm B question']);
    saveStudy({ stageIndex: 1 }); // arm A
    await rerender();
    await settle();
    expect(store.startNewConversation).toHaveBeenCalledWith('u1', { surface: 'chat', studyArm: 'A' });
    expect(result.current.conversationId).toBe('conv-a');
    expect(result.current.messages).toEqual([]);
  });

  it('a lookup that resolves after unmount is dropped', async () => {
    const lookup = deferred();
    store.getOrCreateConversation.mockReturnValue(lookup.promise);
    const { unmount } = await mount();
    await unmount();
    await flush(() => lookup.resolve('conv-late'));
    expect(store.loadMessages).not.toHaveBeenCalled();
  });

  it('messages that arrive after unmount are dropped', async () => {
    const load = deferred();
    store.loadMessages.mockReturnValue(load.promise);
    const { unmount } = await mount();
    await settle();
    await unmount();
    await flush(() => load.resolve([{ role: 'user', text: 'late' }]));
    expect(store.saveCached).not.toHaveBeenCalled();
  });
});

describe('a typed turn', () => {
  it('streams the reply into one bubble, then finalises, persists and records the turn', async () => {
    startStudy({ convoIds: { B: 'conv-b' } });
    h.study = { active: true };
    h.settings = { avatarId: 'ariana' };
    const scroll = vi.fn();
    const seen = [];
    generateReply.mockImplementation(async ({ onToken, onStage, question, settings, history, signal }) => {
      seen.push({ question, settings, history, signal });
      onStage('ragDone');
      onToken('Rest');
      onToken('Rest helps');
      return { text: 'Rest helps [1].', citations: [{ num: 1 }], sources: [{ id: 's1' }, { num: 2 }, {}], safety: true };
    });
    const { result } = await mount();
    await settle();
    result.current.scrollCb.current = scroll;
    await flush(() => result.current.send('  How do I rest?  '));
    await settle();

    expect(seen[0].question).toBe('How do I rest?');
    expect(seen[0].settings).toBe(h.settings);
    expect(texts(seen[0].history)).toEqual(['user:How do I rest?']);
    expect(seen[0].signal).toBeInstanceOf(AbortSignal);
    const [user, aria] = result.current.messages;
    expect(user).toMatchObject({ role: 'user', text: 'How do I rest?' });
    expect(user.time).toMatch(/^\d{1,2}:\d{2} (am|pm)$/);
    expect(aria).toMatchObject({
      role: 'aria', text: 'Rest helps [1].', citations: [{ num: 1 }], sources: [{ id: 's1' }, { num: 2 }, {}],
      safety: true, streaming: false, turnId: 'turn-uuid',
    });
    expect(result.current.typing).toBe(false);
    expect(store.appendMessage.mock.calls).toEqual([
      ['conv-b', { role: 'user', text: 'How do I rest?' }],
      ['conv-b', { role: 'aria', text: 'Rest helps [1].', citations: [{ num: 1 }] }],
    ]);
    expect(scroll).toHaveBeenCalled();

    expect(createTurnTimer).toHaveBeenCalledWith('B', 'task-1');
    expect(h.turn.mark).toHaveBeenCalledWith('ragDone');
    expect(h.turn.finish).toHaveBeenCalledWith({ arm: 'B', taskId: 'task-1', modality: MODALITY_TYPED });
    expect(emit).toHaveBeenCalledWith('turn_start', { arm: 'B', taskId: 'task-1', modality: MODALITY_TYPED, chars: 14, avatar: 'effective-ariana' });
    expect(emit).toHaveBeenCalledWith('turn', {
      arm: 'B', taskId: 'task-1', turnId: 'turn-uuid', modality: MODALITY_TYPED, avatar: 'effective-ariana',
      question: 'How do I rest?', answer: 'Rest helps [1].', sourceIds: ['s1', 2, null],
    });
  });

  it('shows the typing state until the first token, and withholds the transcript when not consented', async () => {
    startStudy({ consentTranscripts: false, convoIds: { B: 'conv-b' } });
    h.study = { active: true };
    const gen = deferred();
    let onToken;
    generateReply.mockImplementation((opts) => { onToken = opts.onToken; return gen.promise; });
    const { result } = await mount();
    await settle();
    await flush(() => result.current.send('Q'));
    expect(result.current.typing).toBe(true);
    expect(texts(result.current.messages)).toEqual(['user:Q']);
    await flush(() => onToken('Partial'));
    expect(result.current.typing).toBe(false);
    expect(result.current.messages[1]).toMatchObject({ role: 'aria', text: 'Partial', streaming: true });
    await flush(() => gen.resolve({ text: 'Done' }));
    expect(result.current.messages[1]).toMatchObject({ text: 'Done', citations: [], sources: null, safety: false });
    const turn = emit.mock.calls.find(([k]) => k === 'turn')[1];
    expect(turn).not.toHaveProperty('question');
    expect(turn).not.toHaveProperty('answer');
    expect(turn.sourceIds).toEqual([]);
  });

  it('ignores blank input and a second send while a turn is in flight', async () => {
    const gen = deferred();
    generateReply.mockReturnValue(gen.promise);
    const { result } = await mount();
    await settle();
    const before = result.current.messages.length;
    await flush(() => result.current.send('   '));
    await flush(() => result.current.send(undefined));
    expect(result.current.messages).toHaveLength(before);
    await flush(() => result.current.send('first'));
    await flush(() => result.current.send('second'));
    expect(generateReply).toHaveBeenCalledTimes(1);
    await flush(() => gen.resolve({ text: 'ok', citations: [] }));
  });

  it('a failure records the error, drops the empty bubble, and retry re-asks the same question', async () => {
    generateReply.mockRejectedValueOnce(Object.assign(new Error('socket hang up'), { name: 'TypeError' }));
    const { result } = await mount();
    await settle();
    await flush(() => result.current.send('Why?'));
    await settle();
    expect(result.current.chatError).toBe(true);
    expect(result.current.chatErrorMsg).toBe("I couldn't reach the knowledge base — try again.");
    expect(result.current.typing).toBe(false);
    expect(result.current.messages.at(-1)).toMatchObject({ role: 'user', text: 'Why?' });
    expect(emit).toHaveBeenCalledWith('turn_error', { arm: null, taskId: null, modality: MODALITY_TYPED, error: 'TypeError', message: 'socket hang up' });
    expect(console.warn).toHaveBeenCalledWith('[chat] turn failed:', 'socket hang up');

    generateReply.mockResolvedValueOnce({ text: 'Because.', citations: [] });
    await flush(() => result.current.retry());
    await settle();
    expect(generateReply).toHaveBeenCalledTimes(2);
    expect(generateReply.mock.calls[1][0].question).toBe('Why?');
    expect(result.current.chatError).toBe(false);
    expect(result.current.messages.at(-1)).toMatchObject({ role: 'aria', text: 'Because.' });
  });

  it('a refused guest code gets the credential copy', async () => {
    saveAccess('guest-access-code-0001');
    generateReply.mockRejectedValueOnce(Object.assign(new Error('nope'), { name: 'StudyAccessError' }));
    const { result } = await mount();
    await settle();
    await flush(() => result.current.send('Q'));
    await settle();
    expect(result.current.chatErrorMsg).toBe('Your access code is no longer accepted — update it in Settings.');
  });

  it('a non-Error rejection is still reported', async () => {
    generateReply.mockRejectedValueOnce('kaput');
    const { result } = await mount();
    await settle();
    await flush(() => result.current.send('Q'));
    await settle();
    expect(emit).toHaveBeenCalledWith('turn_error', expect.objectContaining({ error: 'Error', message: 'kaput' }));
  });

  it('retry does nothing when nothing failed, or while a turn is running', async () => {
    const { result } = await mount();
    await settle();
    await flush(() => result.current.retry());
    expect(generateReply).not.toHaveBeenCalled();

    const gen = deferred();
    generateReply.mockRejectedValueOnce(new Error('x')).mockReturnValueOnce(gen.promise);
    await flush(() => result.current.send('Q'));
    await settle();
    await flush(() => result.current.retry()); // starts the second attempt
    await flush(() => result.current.retry()); // busy: ignored
    expect(generateReply).toHaveBeenCalledTimes(2);
    await flush(() => gen.resolve({ text: 'ok' }));
  });

  it('askNow opens the chat screen and sends after the transition', async () => {
    vi.useFakeTimers();
    generateReply.mockResolvedValue({ text: 'ok', citations: [] });
    const { result } = await mount();
    await flush(() => result.current.askNow('From home'));
    expect(location.hash).toBe('#/app/chat');
    expect(generateReply).not.toHaveBeenCalled();
    await flush(() => vi.advanceTimersByTimeAsync(450));
    expect(generateReply.mock.calls[0][0].question).toBe('From home');
  });
});

describe('cancelling a turn', () => {
  it('New conversation aborts the turn; its late tokens and result are ignored', async () => {
    const gen = deferred();
    let opts;
    generateReply.mockImplementation((o) => { opts = o; return gen.promise; });
    const { result } = await mount();
    await settle();
    await flush(() => result.current.send('Q'));
    await flush(() => result.current.newConvo());
    expect(opts.signal.aborted).toBe(true);
    await flush(() => opts.onToken('late token'));
    await flush(() => gen.resolve({ text: 'late answer' }));
    expect(result.current.messages).toEqual([]);
    expect(store.appendMessage).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ role: 'aria' }));
  });

  it('an error from an aborted turn is not reported', async () => {
    const gen = deferred();
    generateReply.mockReturnValue(gen.promise);
    const { result } = await mount();
    await settle();
    await flush(() => result.current.send('Q'));
    await flush(() => result.current.clearHistory());
    await flush(() => gen.reject(new DOMException('aborted', 'AbortError')));
    expect(emit).not.toHaveBeenCalledWith('turn_error', expect.anything());
    expect(result.current.chatError).toBe(false);
  });

  it('unmounting aborts the in-flight turn', async () => {
    let signal;
    generateReply.mockImplementation((o) => { signal = o.signal; return new Promise(() => {}); });
    const { result, unmount } = await mount();
    await settle();
    await flush(() => result.current.send('Q'));
    await unmount();
    expect(signal.aborted).toBe(true);
  });
});

describe('newConvo / appendMessage / clearHistory', () => {
  it('newConvo empties the screen and the cache and starts a server thread', async () => {
    const { result } = await mount();
    await settle();
    await flush(() => result.current.newConvo());
    expect(result.current.messages).toEqual([]);
    expect(store.clearCached).toHaveBeenCalled();
    expect(store.startNewConversation).toHaveBeenCalledWith('u1', { surface: 'chat', studyArm: null });
    expect(result.current.conversationId).toBe('conv-new');
  });

  it('in a study, the new thread is remembered for the arm; a failed insert keeps the old id', async () => {
    startStudy({ convoIds: { B: 'conv-b' } });
    h.study = { active: true };
    const { result } = await mount();
    await settle();
    store.startNewConversation.mockResolvedValueOnce('conv-b2');
    await flush(() => result.current.newConvo());
    expect(studyConversationId('B')).toBe('conv-b2');
    store.startNewConversation.mockResolvedValueOnce(null);
    await flush(() => result.current.newConvo());
    expect(result.current.conversationId).toBe('conv-b2');
    expect(studyConversationId('B')).toBe('conv-b2');
  });

  it('appendMessage adds a timestamped voice message, caches and persists it', async () => {
    const { result } = await mount();
    await settle();
    const before = result.current.messages.length;
    await flush(() => result.current.appendMessage({ role: 'aria', text: 'Spoken answer', citations: [] }));
    const added = result.current.messages.at(-1);
    expect(result.current.messages).toHaveLength(before + 1);
    expect(added).toMatchObject({ role: 'aria', text: 'Spoken answer' });
    expect(added.time).toMatch(/(am|pm)$/);
    expect(store.saveCached).toHaveBeenLastCalledWith(result.current.messages);
    expect(store.appendMessage).toHaveBeenLastCalledWith('conv-1', { role: 'aria', text: 'Spoken answer', citations: [] });
  });

  it('clearHistory keeps the screen when the delete fails', async () => {
    store.deleteAllConversations.mockResolvedValue({ deleted: false, scope: 'server', message: 'offline' });
    const { result } = await mount();
    await settle();
    const before = result.current.messages;
    let out;
    await flush(async () => { out = await result.current.clearHistory(); });
    expect(out).toEqual({ deleted: false, scope: 'server', message: 'offline' });
    expect(result.current.messages).toBe(before);
    expect(store.startNewConversation).not.toHaveBeenCalled();
  });

  it('clearHistory empties the screen only after the delete succeeds, then starts afresh', async () => {
    startStudy({ convoIds: { B: 'conv-b' } });
    h.study = { active: true };
    store.startNewConversation.mockResolvedValue('conv-after-clear');
    const { result } = await mount();
    await settle();
    let out;
    await flush(async () => { out = await result.current.clearHistory(); });
    expect(out).toEqual({ deleted: true, scope: 'server' });
    expect(store.deleteAllConversations).toHaveBeenCalledWith('u1');
    expect(result.current.messages).toEqual([]);
    expect(result.current.conversationId).toBe('conv-after-clear');
    expect(studyConversationId('B')).toBe('conv-after-clear');
  });

  it('clearHistory with no new thread leaves no conversation id', async () => {
    store.startNewConversation.mockResolvedValue(null);
    const { result } = await mount();
    await settle();
    await flush(() => result.current.clearHistory());
    expect(result.current.conversationId).toBeNull();
  });
});
