// @vitest-environment jsdom
// The avatar's on-screen states: the Unity download/prepare/failed progress
// card, the AvatarMount (Unity view, or the bust when the avatar is off), the
// Unity canvas mount, the landing card and the Home hero tile. The Unity bridge
// and the Unity controller are fakes (their runtimes are excluded from
// coverage); SettingsProvider and the profile lookup are real.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { h, render, renderHook, flush, settle, cleanup } from './helpers/render.js';
import { SettingsProvider } from '../src/state/SettingsContext.jsx';

const fake = vi.hoisted(() => ({
  probe: null,
  mount: null,
  load: { phase: 'idle', pct: 0 },
  subs: new Set(),
  canvas: null,
  park: null,
  boot: null,
  unityAvatar: null,
  getUnityAvatar: null,
}));

vi.mock('../src/avatar/unity/unityBridge.js', () => ({
  probeUnity: () => fake.probe(),
  mountUnity: () => fake.mount(),
  getUnityLoadState: () => fake.load,
  onUnityLoadProgress: (cb) => {
    fake.subs.add(cb);
    cb(fake.load);
    return () => fake.subs.delete(cb);
  },
  getUnityCanvas: () => fake.canvas,
  parkUnityCanvas: (...a) => fake.park(...a),
  ensureUnityBoot: (...a) => fake.boot(...a),
}));
vi.mock('../src/avatar/unity/UnityAvatarController.js', () => ({
  getUnityAvatar: (...a) => fake.getUnityAvatar(...a),
}));

const { AvatarLoadProgress } = await import('../src/avatar/AvatarLoadProgress.jsx');
const { AvatarBust, AvatarMount, AvatarStageCard, AvatarHomeStage } =
  await import('../src/avatar/AvatarStage.jsx');
const { UnityAvatarMount } = await import('../src/avatar/unity/UnityAvatarStage.jsx');
const { useUnityLoadState } = await import('../src/avatar/unity/useUnityLoadState.js');

const broadcast = async (state) => {
  await flush(() => {
    fake.load = state;
    for (const cb of fake.subs) cb(state);
  });
};
const withSettings = (child) => h(SettingsProvider, null, child);
const setAvatar = (avatarId, extra = {}) =>
  localStorage.setItem('dg_settings', JSON.stringify({ avatarId, ...extra }));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  localStorage.clear();
  fake.probe = vi.fn(async () => true);
  fake.mount = vi.fn(async () => {});
  fake.load = { phase: 'idle', pct: 0 };
  fake.subs.clear();
  fake.canvas = document.createElement('canvas');
  fake.park = vi.fn();
  fake.boot = vi.fn();
  fake.unityAvatar = { setAvatarState: vi.fn() };
  fake.getUnityAvatar = vi.fn(() => fake.unityAvatar);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
});

describe('AvatarLoadProgress', () => {
  const show = (props) => render(h(AvatarLoadProgress, { name: 'Aaron', pct: 0.42, ...props }));

  it('downloading: a labelled progress bar and an honest size note', async () => {
    const { container } = await show({ phase: 'downloading' });
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar.getAttribute('aria-valuenow')).toBe('42');
    expect(bar.getAttribute('aria-label')).toBe('Downloading Aaron');
    expect(bar.firstChild.style.width).toBe('42%');
    expect(container.textContent).toContain('Getting Aaron ready');
    expect(container.textContent).toContain(
      'Downloading… 42% — Aaron is a large one-time download (about 230 MB), saved for your next visit.'
    );
    expect(container.querySelector('svg').getAttribute('width')).toBe('150');
  });

  it('downloading, compact: the percentage moves into the title', async () => {
    const { container } = await show({ phase: 'downloading', compact: true });
    expect(container.textContent).toContain('Getting Aaron ready… 42%');
    expect(container.textContent).toContain('One-time download');
    expect(container.querySelector('svg').getAttribute('width')).toBe('90');
  });

  it('preparing: says so, with the reassurance hidden when compact', async () => {
    const full = await show({ phase: 'preparing' });
    expect(full.container.textContent).toContain('Almost there — preparing Aaron…');
    expect(full.container.textContent).toContain('You can keep using the app.');
    expect(full.container.firstChild.firstChild.style.animation).toMatch(/^dgShimmer/);
    const compact = await show({ phase: 'preparing', compact: true });
    expect(compact.container.textContent).not.toContain('You can keep using the app.');
  });

  it('failed: explains and offers a retry that re-runs the boot', async () => {
    const { container } = await show({ phase: 'failed' });
    expect(container.textContent).toContain("We couldn't finish loading Aaron.");
    expect(container.textContent).toContain('a brief drop in connection');
    expect(container.textContent).toContain(
      "The 3D view isn't available right now. Aaron can still talk with you."
    );
    const button = container.querySelector('button');
    expect(button.textContent).toBe('Try again');
    await flush(() => button.click());
    expect(fake.boot).toHaveBeenCalledTimes(1);
    const compact = await show({ phase: 'failed', compact: true });
    expect(compact.container.textContent).not.toContain('a brief drop in connection');
    expect(compact.container.textContent).toContain('Aaron can still talk with you.');
  });

  it('any other phase shows only the breathing bust', async () => {
    const { container } = await show({ phase: 'idle' });
    expect(container.textContent).toBe('');
    expect(container.firstChild.firstChild.style.animation).toMatch(/^dgBreathe/);
  });
});

describe('AvatarBust / AvatarStageCard', () => {
  it('the bust defaults to 170 px', async () => {
    const { container } = await render(h(AvatarBust));
    expect(container.querySelector('svg').getAttribute('width')).toBe('170');
    expect(container.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
  });

  it('the landing card captions the stored avatar, or a supplied caption', async () => {
    const a = await render(withSettings(h(AvatarStageCard)));
    expect(a.container.textContent).toBe('avatar stage · Aaron (3D, lip-synced)');
    setAvatar('ariana');
    const b = await render(withSettings(h(AvatarStageCard)));
    expect(b.container.textContent).toBe('avatar stage · Ariana (3D, lip-synced)');
    expect(fake.probe).not.toHaveBeenCalled(); // the landing card never touches /unity/
    const c = await render(
      withSettings(h(AvatarStageCard, { caption: 'Meet your guide', maxWidth: 200 }))
    );
    expect(c.container.textContent).toBe('Meet your guide');
    expect(c.container.firstChild.style.maxWidth).toBe('200px');
  });
});

describe('AvatarMount', () => {
  const bust = h('span', { className: 'bust' }, 'bust');

  it('avatar on: hands over to the Unity mount for the stored character and forwards state', async () => {
    setAvatar('ariana');
    const { container } = await render(withSettings(h(AvatarMount, { state: 'thinking' }, bust)));
    await settle();
    expect(container.querySelector('canvas')).toBe(fake.canvas);
    expect(fake.getUnityAvatar).toHaveBeenCalledWith('ariana');
    expect(fake.unityAvatar.setAvatarState).toHaveBeenCalledWith('thinking');
  });

  it('a retired stored id (aria, zhenja) shows the default character', async () => {
    setAvatar('zhenja');
    await render(withSettings(h(AvatarMount, null, bust)));
    await settle();
    expect(fake.getUnityAvatar).toHaveBeenCalledWith('aaron');
  });

  it('compact reaches the load card', async () => {
    fake.mount = vi.fn(() => new Promise(() => {}));
    fake.load = { phase: 'downloading', pct: 0.5 };
    const { container } = await render(withSettings(h(AvatarMount, { compact: true }, bust)));
    expect(container.textContent).toContain('Getting Aaron ready… 50%');
  });

  it('avatar off: just the bust — nothing is probed, mounted or parked', async () => {
    setAvatar('aaron', { showAvatar: false });
    const { container } = await render(withSettings(h(AvatarMount, { state: 'thinking' }, bust)));
    await settle();
    expect(container.querySelector('.bust')).not.toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
    expect(fake.probe).not.toHaveBeenCalled();
    expect(fake.mount).not.toHaveBeenCalled();
  });
});

describe('AvatarHomeStage', () => {
  it('a portrait column with the Unity canvas and a name tag', async () => {
    setAvatar('aaron');
    const { container } = await render(withSettings(h(AvatarHomeStage)));
    await settle();
    expect(container.querySelector('canvas')).toBe(fake.canvas);
    expect(container.textContent).toContain('Aaron');
    expect(
      [...container.querySelectorAll('div')].some((d) => d.style.aspectRatio === '3 / 4')
    ).toBe(true);
  });

  it('avatar off: the bust and the name tag, with no probe and no download', async () => {
    setAvatar('ariana', { showAvatar: false });
    const { container } = await render(withSettings(h(AvatarHomeStage)));
    await settle();
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.textContent).toBe('Ariana');
    expect(fake.probe).not.toHaveBeenCalled();
    expect(fake.mount).not.toHaveBeenCalled();
  });
});

describe('UnityAvatarMount', () => {
  const child = h('span', { className: 'bust' }, 'bust');
  const mountUnity = (props = {}) =>
    render(h(UnityAvatarMount, { characterId: 'ariana', name: 'Ariana', ...props }, child));

  it('adopts the shared canvas, boots the character and reveals it, then forwards state', async () => {
    const r = await mountUnity({ state: 'listening' });
    const canvas = r.container.querySelector('canvas');
    expect(canvas).toBe(fake.canvas);
    await settle();
    expect(fake.getUnityAvatar).toHaveBeenCalledWith('ariana');
    expect(canvas.parentElement.style.opacity).toBe('1');
    expect(r.container.querySelector('.bust')).toBeNull();
    expect(fake.unityAvatar.setAvatarState).toHaveBeenLastCalledWith('listening');
    await r.rerender(h(UnityAvatarMount, { characterId: 'ariana', state: 'speaking' }, child));
    expect(fake.unityAvatar.setAvatarState).toHaveBeenLastCalledWith('speaking');
    const host = canvas.parentElement;
    await r.unmount();
    expect(fake.park).toHaveBeenCalledWith(host); // only parks if it still holds the canvas
  });

  it('no build installed: the bust plus plain copy, and no boot attempt', async () => {
    fake.probe = vi.fn(async () => false);
    const { container } = await mountUnity();
    await settle();
    expect(container.querySelector('.bust')).not.toBeNull();
    expect(container.textContent).toContain(
      "The 3D view isn't available right now. Ariana can still talk with you."
    );
    expect(container.textContent).not.toContain('Unity build');
    expect(fake.mount).not.toHaveBeenCalled();
  });

  it('shows download progress instead of the bust while the build loads', async () => {
    fake.mount = vi.fn(() => new Promise(() => {}));
    fake.load = { phase: 'downloading', pct: 0.5 };
    const { container } = await mountUnity({ name: undefined, compact: true });
    expect(container.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).toBe(
      '50'
    );
    expect(container.textContent).toContain('Getting your avatar ready… 50%');
    expect(container.querySelector('.bust')).toBeNull();
    await broadcast({ phase: 'preparing', pct: 1 });
    expect(container.textContent).toContain('Almost there — preparing your avatar…');
  });

  it('a failed boot is logged and leaves the retry card up', async () => {
    fake.mount = vi.fn(async () => {
      throw new Error('wasm compile failed');
    });
    fake.load = { phase: 'failed', pct: 0.9 };
    const { container } = await mountUnity();
    await settle();
    expect(console.warn).toHaveBeenCalledWith('[unity] mount failed:', 'wasm compile failed');
    expect(container.querySelector('button').textContent).toBe('Try again');
    expect(fake.getUnityAvatar).not.toHaveBeenCalled();
  });

  it('a non-Error boot failure is logged as-is', async () => {
    fake.mount = vi.fn(async () => {
      throw 'gone';
    });
    await mountUnity();
    await settle();
    expect(console.warn).toHaveBeenCalledWith('[unity] mount failed:', 'gone');
  });

  it('reaching "ready" re-runs the mount for screens opened mid-boot', async () => {
    await mountUnity();
    await settle();
    expect(fake.mount).toHaveBeenCalledTimes(1);
    await broadcast({ phase: 'ready', pct: 1 });
    await settle();
    expect(fake.mount).toHaveBeenCalledTimes(2);
    expect(fake.park).toHaveBeenCalledTimes(1); // the first effect's cleanup
  });

  it('nothing lands after unmount: neither the probe result nor the boot', async () => {
    const probe = deferred();
    fake.probe = vi.fn(() => probe.promise);
    const a = await mountUnity();
    await a.unmount();
    await flush(() => probe.resolve(false));
    expect(fake.mount).not.toHaveBeenCalled();

    const boot = deferred();
    fake.probe = vi.fn(async () => true);
    fake.mount = vi.fn(() => boot.promise);
    const b = await mountUnity();
    await settle();
    await b.unmount();
    await flush(() => boot.resolve());
    expect(fake.getUnityAvatar).not.toHaveBeenCalled();
  });
});

describe('useUnityLoadState', () => {
  it('starts from the current state, follows broadcasts, and unsubscribes on unmount', async () => {
    fake.load = { phase: 'downloading', pct: 0.1 };
    const { result, unmount } = await renderHook(() => useUnityLoadState());
    expect(result.current).toEqual({ phase: 'downloading', pct: 0.1 });
    await broadcast({ phase: 'preparing', pct: 1 });
    expect(result.current).toEqual({ phase: 'preparing', pct: 1 });
    expect(fake.subs.size).toBe(1);
    await unmount();
    expect(fake.subs.size).toBe(0);
  });
});
