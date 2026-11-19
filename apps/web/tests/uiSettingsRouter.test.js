// @vitest-environment jsdom
// The app-shell state every screen sits on: the toast/confirm chrome
// (UiContext), the persisted settings with their theme side effects
// (SettingsContext), and the hash router with its onboarding guard.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { h, render, renderHook, flush, cleanup } from './helpers/render.js';
import { UiProvider, useUi } from '../src/state/UiContext.jsx';
import { SettingsProvider, useSettings, isSystemDark } from '../src/state/SettingsContext.jsx';
import { getPath, useRoute, go, navigate, useWidth } from '../src/state/router.js';

beforeEach(() => {
  localStorage.clear();
  location.hash = '';
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('UiContext', () => {
  it('shows a toast and clears it after 2.6 s; a second toast restarts the clock', async () => {
    vi.useFakeTimers();
    const { result } = await renderHook(() => useUi(), { wrapper: UiProvider });
    await flush(() => result.current.showToast('Saved'));
    expect(result.current.toast).toBe('Saved');
    await flush(() => vi.advanceTimersByTime(2000));
    await flush(() => result.current.showToast('Saved again'));
    await flush(() => vi.advanceTimersByTime(2000));
    expect(result.current.toast).toBe('Saved again'); // first timer was cancelled
    await flush(() => vi.advanceTimersByTime(600));
    expect(result.current.toast).toBe('');
  });

  it('confirm: accept runs the callback and closes; decline closes without it', async () => {
    const { result } = await renderHook(() => useUi(), { wrapper: UiProvider });
    const onYes = vi.fn();
    const opts = { title: 'Clear history?', message: 'This cannot be undone.', yesLabel: 'Clear' };
    await flush(() => result.current.askConfirm(opts, onYes));
    expect(result.current.confirm).toEqual(opts);
    await flush(() => result.current.confirmNo());
    expect(result.current.confirm).toBeNull();
    expect(onYes).not.toHaveBeenCalled();

    await flush(() => result.current.askConfirm(opts, onYes));
    await flush(() => result.current.confirmAccept());
    expect(result.current.confirm).toBeNull();
    expect(onYes).toHaveBeenCalledTimes(1);
  });

  it('accepting a confirm opened without a callback just closes it', async () => {
    const { result } = await renderHook(() => useUi(), { wrapper: UiProvider });
    await flush(() => result.current.askConfirm({ title: 'Info' }, null));
    await flush(() => result.current.confirmAccept());
    expect(result.current.confirm).toBeNull();
  });
});

describe('SettingsContext', () => {
  const mount = () => renderHook(() => useSettings(), { wrapper: SettingsProvider });

  it('starts from the defaults and applies theme, contrast and text scale to <html>', async () => {
    const { result } = await mount();
    expect(result.current.settings).toMatchObject({ onboarded: false, avatarId: 'aaron', textScale: 1, darkMode: null });
    expect(result.current.effDark).toBe(false); // jsdom has no matchMedia → light
    const d = document.documentElement;
    expect(d.dataset.theme).toBe('light');
    expect(d.dataset.hc).toBe('0');
    expect(d.style.fontSize).toBe('17px');
  });

  it('setSetting / setMany update state, persist, and re-apply the document styling', async () => {
    const { result } = await mount();
    await flush(() => result.current.setSetting('darkMode', true));
    await flush(() => result.current.setMany({ highContrast: true, textScale: 1.5 }));
    expect(result.current.settings).toMatchObject({ darkMode: true, highContrast: true, textScale: 1.5 });
    expect(JSON.parse(localStorage.getItem('dg_settings'))).toMatchObject({ darkMode: true, highContrast: true, textScale: 1.5 });
    const d = document.documentElement;
    expect(d.dataset.theme).toBe('dark');
    expect(d.dataset.hc).toBe('1');
    expect(d.style.fontSize).toBe('25.5px');
  });

  it('migrates a stored aria to aaron once, and persists the flag', async () => {
    localStorage.setItem('dg_settings', JSON.stringify({ avatarId: 'aria', onboarded: true }));
    const { result } = await mount();
    expect(result.current.settings.avatarId).toBe('aaron');
    expect(result.current.settings.onboarded).toBe(true);
    expect(JSON.parse(localStorage.getItem('dg_settings'))).toMatchObject({ avatarId: 'aaron', avatarMigratedToUnity: true });
  });

  it('keeps a post-migration aria pick', async () => {
    localStorage.setItem('dg_settings', JSON.stringify({ avatarId: 'aria', avatarMigratedToUnity: true }));
    const { result } = await mount();
    expect(result.current.settings.avatarId).toBe('aria');
  });

  it('a corrupt blob boots on the defaults', async () => {
    localStorage.setItem('dg_settings', '{broken');
    const { result } = await mount();
    expect(result.current.settings.avatarId).toBe('aaron');
    expect(result.current.settings.onboarded).toBe(false);
  });

  it('full or blocked storage never breaks the migration or a settings change', async () => {
    localStorage.setItem('dg_settings', JSON.stringify({ avatarId: 'aria' }));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    const { result } = await mount();
    expect(result.current.settings.avatarId).toBe('aaron'); // migrated in memory
    await flush(() => result.current.setSetting('concise', true));
    expect(result.current.settings.concise).toBe(true);
  });

  it('follows the system colour scheme while darkMode is null', async () => {
    expect(isSystemDark()).toBe(false);
    const matchMedia = vi.fn(() => ({ matches: true }));
    vi.stubGlobal('matchMedia', matchMedia);
    expect(isSystemDark()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
    const { result } = await mount();
    expect(result.current.effDark).toBe(true);
    await flush(() => result.current.setSetting('darkMode', false));
    expect(result.current.effDark).toBe(false);
  });
});

describe('router', () => {
  const hashTo = async (hash) => {
    await flush(() => {
      location.hash = hash;
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  };

  it('getPath reads the hash, defaulting to /', () => {
    expect(getPath()).toBe('/');
    location.hash = '#/app/chat';
    expect(getPath()).toBe('/app/chat');
    location.hash = '#';
    expect(getPath()).toBe('/');
  });

  it('useRoute follows hashchange and stops listening on unmount', async () => {
    const { result, unmount } = await renderHook(() => useRoute(true));
    expect(result.current).toBe('/');
    await hashTo('#/library');
    expect(result.current).toBe('/library');
    const remove = vi.spyOn(window, 'removeEventListener');
    await unmount();
    expect(remove).toHaveBeenCalledWith('hashchange', expect.any(Function));
  });

  it('sends a not-yet-onboarded visitor from /app to the onboarding wizard', async () => {
    location.hash = '#/app/home';
    await renderHook(() => useRoute(false));
    expect(location.hash).toBe('#/onboarding/1');
  });

  it('leaves onboarded users on /app', async () => {
    location.hash = '#/app/home';
    await renderHook(() => useRoute(true));
    expect(location.hash).toBe('#/app/home');
  });

  it('go() returns a handler and navigate() sets the hash directly', () => {
    const handler = go('#/app/voice');
    expect(location.hash).toBe('');
    handler();
    expect(location.hash).toBe('#/app/voice');
    navigate('#/settings');
    expect(location.hash).toBe('#/settings');
  });

  it('useWidth tracks window resizes', async () => {
    window.innerWidth = 1024;
    const { result, unmount } = await renderHook(() => useWidth());
    expect(result.current).toBe(1024);
    await flush(() => {
      window.innerWidth = 390;
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(390);
    const remove = vi.spyOn(window, 'removeEventListener');
    await unmount();
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});

describe('providers render their children', () => {
  it('UiProvider and SettingsProvider pass their subtree through', async () => {
    const { container, unmount } = await render(
      h(SettingsProvider, null, h(UiProvider, null, h('p', null, 'inside'))),
    );
    expect(container.textContent).toBe('inside');
    await unmount();
    expect(document.body.contains(container)).toBe(false);
  });
});
