// Server-side conversations (state/conversationStore.js): the localStorage
// cache, the per-(user, study arm) thread lookup, message load/append, the
// "Clear history" delete that the privacy policy promises, and the one-time
// import of pre-backend history. Supabase is replaced by a recording fake
// query builder; each awaited query takes the next queued result.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const calls = [];
  const results = [];
  function from(table) {
    const chain = { table, ops: [] };
    calls.push(chain);
    const proxy = new Proxy(
      {},
      {
        get(_, prop) {
          if (prop === 'then') {
            const r = results.length ? results.shift() : { data: null, error: null };
            return (resolve, reject) => Promise.resolve(r).then(resolve, reject);
          }
          return (...args) => {
            chain.ops.push([prop, ...args]);
            return proxy;
          };
        },
      }
    );
    return proxy;
  }
  return { calls, results, supabase: { from: (t) => from(t) } };
});
vi.mock('../src/services/supabase.js', () => ({
  supabase: fake.supabase,
  supabaseConfigured: true,
}));

const store = await import('../src/state/conversationStore.js');

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}
const blocked = () => ({
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
});

const queue = (...rs) => fake.results.push(...rs);
const ops = (i) => fake.calls[i].ops;

beforeEach(() => {
  fake.calls.length = 0;
  fake.results.length = 0;
  vi.stubGlobal('localStorage', memoryStorage());
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('cache (dg_history)', () => {
  it('round-trips and keeps only the last 100 messages', () => {
    expect(store.loadCached()).toBeNull();
    const msgs = Array.from({ length: 120 }, (_, i) => ({ role: 'user', text: `m${i}` }));
    store.saveCached(msgs);
    const back = store.loadCached();
    expect(back).toHaveLength(100);
    expect(back[0].text).toBe('m20');
    store.clearCached();
    expect(store.loadCached()).toBeNull();
  });

  it('anything but an array, or corrupt JSON, reads as no cache', () => {
    localStorage.setItem('dg_history', '{"role":"user"}');
    expect(store.loadCached()).toBeNull();
    localStorage.setItem('dg_history', '[oops');
    expect(store.loadCached()).toBeNull();
  });

  it('blocked storage is tolerated', () => {
    vi.stubGlobal('localStorage', blocked());
    expect(store.loadCached()).toBeNull();
    expect(() => store.saveCached([{ text: 'x' }])).not.toThrow();
    expect(() => store.clearCached()).not.toThrow();
  });
});

describe('getOrCreateConversation', () => {
  it('needs a user id, and never touches the server without one', async () => {
    expect(await store.getOrCreateConversation(null)).toBeNull();
    expect(fake.calls).toHaveLength(0);
  });

  it('reuses the most recent non-study thread (matched with IS NULL, not = NULL)', async () => {
    queue({ data: [{ id: 'conv-1' }], error: null });
    expect(await store.getOrCreateConversation('u1')).toBe('conv-1');
    expect(fake.calls[0].table).toBe('conversations');
    expect(ops(0)).toEqual([
      ['select', 'id'],
      ['eq', 'user_id', 'u1'],
      ['order', 'updated_at', { ascending: false }],
      ['limit', 1],
      ['is', 'study_arm', null],
    ]);
  });

  it('scopes the lookup to a study arm when given one', async () => {
    queue({ data: [{ id: 'conv-b' }], error: null });
    await store.getOrCreateConversation('u1', { studyArm: 'B' });
    expect(ops(0).at(-1)).toEqual(['eq', 'study_arm', 'B']);
  });

  it('creates a thread when none exists', async () => {
    queue({ data: [], error: null }, { data: { id: 'new-conv' }, error: null });
    expect(await store.getOrCreateConversation('u1', { surface: 'voice', studyArm: 'A' })).toBe(
      'new-conv'
    );
    expect(ops(1)).toEqual([
      ['insert', { user_id: 'u1', surface: 'voice', study_arm: 'A' }],
      ['select', 'id'],
      ['single'],
    ]);
  });

  it('a failed lookup or create yields null with a warning', async () => {
    queue({ data: null, error: { message: 'timeout' } });
    expect(await store.getOrCreateConversation('u1')).toBeNull();
    expect(console.warn).toHaveBeenLastCalledWith('[conversations] lookup failed: timeout');
    queue({ data: null, error: null }, { data: null, error: { message: 'rls' } });
    expect(await store.getOrCreateConversation('u1')).toBeNull();
    expect(console.warn).toHaveBeenLastCalledWith('[conversations] create failed: rls');
  });
});

describe('loadMessages', () => {
  it('returns nothing without a conversation id', async () => {
    expect(await store.loadMessages(null)).toEqual([]);
    expect(fake.calls).toHaveLength(0);
  });

  it('maps rows to screen messages with a 12-hour clock', async () => {
    const at = (h, m) => new Date(2026, 9, 8, h, m).toISOString();
    queue({
      data: [
        { role: 'user', content: 'Q', citations: null, created_at: at(0, 5) },
        { role: 'assistant', content: 'A', citations: [{ num: 1 }], created_at: at(13, 30) },
        { role: 'assistant', content: 'B', citations: [], created_at: at(12, 0) },
      ],
      error: null,
    });
    expect(await store.loadMessages('c1')).toEqual([
      { role: 'user', text: 'Q', citations: [], time: '12:05 am' },
      { role: 'aria', text: 'A', citations: [{ num: 1 }], time: '1:30 pm' },
      { role: 'aria', text: 'B', citations: [], time: '12:00 pm' },
    ]);
    expect(ops(0)).toEqual([
      ['select', 'role, content, citations, created_at'],
      ['eq', 'conversation_id', 'c1'],
      ['order', 'created_at', { ascending: true }],
    ]);
  });

  it('a load error or a null result is an empty thread', async () => {
    queue({ data: null, error: { message: 'down' } });
    expect(await store.loadMessages('c1')).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith('[conversations] load failed: down');
    queue({ data: null, error: null });
    expect(await store.loadMessages('c1')).toEqual([]);
  });
});

describe('appendMessage', () => {
  it('does nothing without a conversation', async () => {
    await store.appendMessage(null, { role: 'user', text: 'x' });
    expect(fake.calls).toHaveLength(0);
  });

  it('inserts the message, then bumps the thread’s updated_at', async () => {
    await store.appendMessage('c1', { role: 'aria', text: 'Answer', citations: [{ num: 1 }] });
    expect(fake.calls[0].table).toBe('messages');
    expect(ops(0)).toEqual([
      [
        'insert',
        { conversation_id: 'c1', role: 'assistant', content: 'Answer', citations: [{ num: 1 }] },
      ],
    ]);
    expect(fake.calls[1].table).toBe('conversations');
    const [[update, patch], eq] = ops(1);
    expect(update).toBe('update');
    expect(Number.isNaN(Date.parse(patch.updated_at))).toBe(false);
    expect(eq).toEqual(['eq', 'id', 'c1']);
  });

  it('defaults missing text and citations, and keeps the user role', async () => {
    await store.appendMessage('c1', { role: 'user' });
    expect(ops(0)[0][1]).toEqual({
      conversation_id: 'c1',
      role: 'user',
      content: '',
      citations: [],
    });
  });

  it('a failed insert warns and skips the timestamp update', async () => {
    queue({ error: { message: 'rls' } });
    await store.appendMessage('c1', { role: 'user', text: 'x' });
    expect(console.warn).toHaveBeenCalledWith('[conversations] append failed: rls');
    expect(fake.calls).toHaveLength(1);
  });
});

describe('deleteAllConversations', () => {
  it('with no server, clearing the device cache is the whole job', async () => {
    store.saveCached([{ text: 'x' }]);
    expect(await store.deleteAllConversations(null)).toEqual({ deleted: true, scope: 'device' });
    expect(store.loadCached()).toBeNull();
    expect(fake.calls).toHaveLength(0);
  });

  it('deletes every thread the user owns, then clears the cache', async () => {
    store.saveCached([{ text: 'x' }]);
    expect(await store.deleteAllConversations('u1')).toEqual({ deleted: true, scope: 'server' });
    expect(ops(0)).toEqual([['delete'], ['eq', 'user_id', 'u1']]);
    expect(store.loadCached()).toBeNull();
  });

  it('a failed delete keeps the cache so the screen does not pretend it worked', async () => {
    store.saveCached([{ text: 'x' }]);
    queue({ error: { message: 'offline' } });
    expect(await store.deleteAllConversations('u1')).toEqual({
      deleted: false,
      scope: 'server',
      message: 'offline',
    });
    expect(store.loadCached()).toEqual([{ text: 'x' }]);
  });
});

describe('startNewConversation', () => {
  it('needs a user', async () => {
    expect(await store.startNewConversation(undefined)).toBeNull();
  });

  it('inserts a fresh thread for the surface and arm', async () => {
    queue({ data: { id: 'fresh' }, error: null });
    expect(await store.startNewConversation('u1', { studyArm: 'B' })).toBe('fresh');
    expect(ops(0)[0]).toEqual(['insert', { user_id: 'u1', surface: 'chat', study_arm: 'B' }]);
  });

  it('returns null with a warning when the insert fails', async () => {
    queue({ data: null, error: { message: 'nope' } });
    expect(await store.startNewConversation('u1')).toBeNull();
    expect(console.warn).toHaveBeenCalledWith('[conversations] new failed: nope');
  });
});

describe('migrateLegacyHistory', () => {
  it('needs a user and a conversation', async () => {
    await store.migrateLegacyHistory(null, 'c1');
    await store.migrateLegacyHistory('u1', null);
    expect(localStorage.getItem('dg_history_migrated')).toBeNull();
  });

  it('imports finished messages once, then never again', async () => {
    store.saveCached([
      { role: 'user', text: 'Q1' },
      { role: 'aria', text: 'A1', citations: [{ num: 1 }] },
      { role: 'aria', text: '', streaming: false },
      { role: 'aria', text: 'partial', streaming: true },
    ]);
    await store.migrateLegacyHistory('u1', 'c1');
    expect(fake.calls).toHaveLength(1);
    expect(ops(0)).toEqual([
      [
        'insert',
        [
          { conversation_id: 'c1', role: 'user', content: 'Q1', citations: [] },
          { conversation_id: 'c1', role: 'assistant', content: 'A1', citations: [{ num: 1 }] },
        ],
      ],
    ]);
    expect(localStorage.getItem('dg_history_migrated')).toBe('1');
    await store.migrateLegacyHistory('u1', 'c1');
    expect(fake.calls).toHaveLength(1);
  });

  it('sets the flag even when there is nothing (or nothing finished) to import', async () => {
    await store.migrateLegacyHistory('u1', 'c1');
    expect(localStorage.getItem('dg_history_migrated')).toBe('1');
    localStorage.removeItem('dg_history_migrated');
    store.saveCached([{ role: 'aria', text: 'x', streaming: true }]);
    await store.migrateLegacyHistory('u1', 'c1');
    expect(fake.calls).toHaveLength(0);
  });

  it('a failed import warns; blocked storage skips migration silently', async () => {
    store.saveCached([{ role: 'user', text: 'Q' }]);
    queue({ error: { message: 'too big' } });
    await store.migrateLegacyHistory('u1', 'c1');
    expect(console.warn).toHaveBeenCalledWith('[conversations] legacy migration failed: too big');
    vi.stubGlobal('localStorage', blocked());
    await expect(store.migrateLegacyHistory('u1', 'c2')).resolves.toBeUndefined();
  });
});
