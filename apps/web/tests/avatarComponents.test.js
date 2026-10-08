// @vitest-environment jsdom
// The avatar's on-screen states: the Unity download/prepare/failed progress
// card, the shared Three.js canvas mount with its bust fallback, the Unity
// canvas mount, the landing card and the Home hero tile. The Unity bridge, the
// Unity controller and the Three.js controller are fakes (their runtimes are
// excluded from coverage); SettingsProvider and the profile resolver are real.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { h, render, renderHook, flush, settle, cleanup } from './helpers/render.js';
import { SettingsProvider } from '../src/state/SettingsContext.jsx';

const fake = vi.hoisted(() => ({
  availability: true,
  probe: null,
  mount: null,
  load: { phase: 'idle', pct: 0 },
  subs: new Set(),
  canvas: null,
  park: null,
  boot: null,
  unityAvatar: null,
  getUnityAvatar: null,
  three: null,
  getThreeAvatar: null,
}));

vi.mock('../src/avatar/unity/unityBridge.js', () => ({
  getUnityAvailability: () => fake.availability,
  probeUnity: () => fake.probe(),
  mountUnity: () => fake.mount(),
  getUnityLoadState: () => fake.load,
  onUnityLoadProgress: (cb) => { fake.subs.add(cb); cb(fake.load); return () => fake.subs.delete(cb); },
  getUnityCanvas: () => fake.canvas,
  parkUnityCanvas: (...a) => fake.park(...a),
  ensureUnityBoot: (...a) => fake.boot(...a),
}));
vi.mock('../src/avatar/unity/UnityAvatarController.js', () => ({ getUnityAvatar: (...a) => fake.getUnityAvatar(...a) }));
vi.mock('../src/avatar/three/controller.js', () => ({ getThreeAvatar: (...a) => fake.getThreeAvatar(...a) }));

const { AvatarLoadProgress } = await import('../src/avatar/AvatarLoadProgress.jsx');
const { AvatarBust, ThreeAvatarMount, AvatarStageCard, AvatarHomeStage } = await import('../src/avatar/AvatarStage.jsx');
const { UnityAvatarMount } = await import('../src/avatar/unity/UnityAvatarStage.jsx');
const { useUnityLoadState } = await import('../src/avatar/unity/useUnityLoadState.js');

const broadcast = async (state) => {
  await flush(() => { fake.load = state; for (const cb of fake.subs) cb(state); });
};
const withSettings = (child) => h(SettingsProvider, null, child);
const setAvatar = (avatarId, extra = {}) => localStorage.setItem('dg_settings', JSON.stringify({ avatarId, avatarMigratedToUnity: true, ...extra }));
const deferred = () => { let resolve; let reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

function threeController({ loaded = false, failed = false } = {}) {
  const c = { host: document.createElement('div'), loaded, failed, listeners: new Set(), setAvatarState: vi.fn() };
  c.host.className = 'three-host';
  c.off = vi.fn();
  c.onStatusChange = (fn) => { c.listeners.add(fn); return () => { c.listeners.delete(fn); c.off(); }; };
  c.emit = (patch) => { Object.assign(c, patch); for (const fn of c.listeners) fn(c); };
  return c;
}

beforeEach(() => {
  localStorage.clear();
  fake.availability = true;
  fake.probe = vi.fn(async () => true);
  fake.mount = vi.fn(async () => {});
  fake.load = { phase: 'idle', pct: 0 };
  fake.subs.clear();
  fake.canvas = document.createElement('canvas');
  fake.park = vi.fn();
  fake.boot = vi.fn();
  fake.unityAvatar = { setAvatarState: vi.fn() };
  fake.getUnityAvatar = vi.fn(() => fake.unityAvatar);
  fake.three = threeController();
  fake.getThreeAvatar = vi.fn(() => fake.three);
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
    expect(container.textContent).toContain('Downloading… 42% — Aaron is a large one-time download (about 230 MB), saved for your next visit.');
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
    const button = container.querySelector('button');
    expect(button.textContent).toBe('Try again');
    await flush(() => button.click());
    expect(fake.boot).toHaveBeenCalledTimes(1);
    const compact = await show({ phase: 'failed', compact: true });
    expect(compact.container.textContent).not.toContain('a brief drop in connection');
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

  it('the landing card captions the effective avatar, or a supplied caption', async () => {
    const a = await render(withSettings(h(AvatarStageCard)));
    expect(a.container.textContent).toBe('avatar stage · Aaron (3D, lip-synced)');
    fake.availability = false; // no Unity build → Aria
    const b = await render(withSettings(h(AvatarStageCard)));
    expect(b.container.textContent).toBe('avatar stage · Aria (3D, lip-synced)');
    const c = await render(withSettings(h(AvatarStageCard, { caption: 'Meet your guide', maxWidth: 200 })));
    expect(c.container.textContent).toBe('Meet your guide');
    expect(c.container.firstChild.style.maxWidth).toBe('200px');
  });
});

describe('ThreeAvatarMount', () => {
  const bust = h('span', { className: 'bust' }, 'bust');
  const mountThree = (props = {}) => render(withSettings(h(ThreeAvatarMount, props, bust)));

  it('reparents the shared canvas host and shows the bust until the model loads', async () => {
    setAvatar('aria');
    const { container } = await mountThree();
    const host = container.querySelector('.three-host');
    expect(host).not.toBeNull();
    expect(host.parentElement.style.opacity).toBe('0');
    expect(container.querySelector('.bust')).not.toBeNull();
    expect(fake.three.setAvatarState).not.toHaveBeenCalled();
    await flush(() => fake.three.emit({ loaded: true }));
    expect(host.parentElement.style.opacity).toBe('1');
    expect(container.querySelector('.bust')).toBeNull();
    expect(fake.three.setAvatarState).toHaveBeenCalledWith('idle');
  });

  it('forwards conversational state once ready, and unsubscribes on unmount', async () => {
    setAvatar('zhenja');
    fake.three = threeController({ loaded: true });
    const r = await render(withSettings(h(ThreeAvatarMount, { state: 'listening' }, bust)));
    expect(fake.three.setAvatarState).toHaveBeenLastCalledWith('listening');
    await r.rerender(withSettings(h(ThreeAvatarMount, { state: 'speaking' }, bust)));
    expect(fake.three.setAvatarState).toHaveBeenLastCalledWith('speaking');
    await r.unmount();
    expect(fake.three.off).toHaveBeenCalled();
  });

  it('a failed model keeps the bust', async () => {
    setAvatar('aria');
    fake.three = threeController({ loaded: true, failed: true });
    const { container } = await mountThree();
    expect(container.querySelector('.bust')).not.toBeNull();
    await flush(() => fake.three.emit({ failed: true }));
    expect(container.querySelector('.bust')).not.toBeNull();
  });

  it('no controller, or the avatar switched off, shows the bust and mounts nothing', async () => {
    setAvatar('aria');
    fake.getThreeAvatar.mockReturnValueOnce(null);
    const a = await mountThree();
    expect(a.container.querySelector('.bust')).not.toBeNull();
    expect(a.container.querySelector('.three-host')).toBeNull();
    await a.unmount();
    fake.getThreeAvatar.mockClear();
    setAvatar('aria', { showAvatar: false });
    const b = await mountThree();
    expect(b.container.querySelector('.bust')).not.toBeNull();
    expect(fake.getThreeAvatar).not.toHaveBeenCalled();
  });

  it('a Unity profile hands over to the Unity mount', async () => {
    setAvatar('ariana');
    const { container } = await render(withSettings(h(ThreeAvatarMount, { state: 'thinking' }, bust)));
    await settle();
    expect(container.querySelector('canvas')).toBe(fake.canvas);
    expect(fake.getUnityAvatar).toHaveBeenCalledWith('ariana');
    expect(fake.unityAvatar.setAvatarState).toHaveBeenCalledWith('thinking');
    expect(fake.getThreeAvatar).not.toHaveBeenCalled();
  });
});

describe('AvatarHomeStage', () => {
  it('Unity: a portrait column with the Unity canvas and a name tag', async () => {
    setAvatar('aaron');
    const { container } = await render(withSettings(h(AvatarHomeStage)));
    await settle();
    expect(container.querySelector('canvas')).toBe(fake.canvas);
    expect(container.textContent).toContain('Aaron');
    expect([...container.querySelectorAll('div')].some((d) => d.style.aspectRatio === '3 / 4')).toBe(true);
  });

  it('Three.js: the shared canvas in its "waiting" pose', async () => {
    setAvatar('zhenja');
    fake.three = threeController({ loaded: true });
    const { container } = await render(withSettings(h(AvatarHomeStage)));
    expect(container.textContent).toBe('Zhenja');
    expect(fake.three.setAvatarState).toHaveBeenCalledWith('waiting');
  });
});

describe('UnityAvatarMount', () => {
  const child = h('span', { className: 'bust' }, 'bust');
  const mountUnity = (props = {}) => render(h(UnityAvatarMount, { characterId: 'ariana', name: 'Ariana', ...props }, child));

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
    await r.unmount();
    expect(fake.park).toHaveBeenCalled();
  });

  it('no build installed: the bust plus a plain note, and no boot attempt', async () => {
    fake.probe = vi.fn(async () => false);
    const { container } = await mountUnity();
    await settle();
    expect(container.querySelector('.bust')).not.toBeNull();
    expect(container.textContent).toContain('Unity build not installed');
    expect(fake.mount).not.toHaveBeenCalled();
  });

  it('shows download progress instead of the bust while the build loads', async () => {
    fake.mount = vi.fn(() => new Promise(() => {}));
    fake.load = { phase: 'downloading', pct: 0.5 };
    const { container } = await mountUnity({ name: undefined, compact: true });
    expect(container.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('50');
    expect(container.textContent).toContain('Getting your avatar ready… 50%');
    expect(container.querySelector('.bust')).toBeNull();
    await broadcast({ phase: 'preparing', pct: 1 });
    expect(container.textContent).toContain('Almost there — preparing your avatar…');
  });

  it('a failed boot is logged and leaves the retry card up', async () => {
    fake.mount = vi.fn(async () => { throw new Error('wasm compile failed'); });
    fake.load = { phase: 'failed', pct: 0.9 };
    const { container } = await mountUnity();
    await settle();
    expect(console.warn).toHaveBeenCalledWith('[unity] mount failed:', 'wasm compile failed');
    expect(container.querySelector('button').textContent).toBe('Try again');
    expect(fake.getUnityAvatar).not.toHaveBeenCalled();
  });

  it('a non-Error boot failure is logged as-is', async () => {
    fake.mount = vi.fn(async () => { throw 'gone'; });
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
