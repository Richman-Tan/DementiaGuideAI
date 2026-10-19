// @vitest-environment jsdom
// Avatar logic that decides what the user sees and hears, with the runtimes
// faked: the Unity bridge (availability probe), the Web Audio engine and the
// generated Three.js renderer are all excluded from coverage because they need
// a real GPU / audio clock / 244 MB build, so here they are recording fakes.
// Covered: the roster, availability-aware profile resolution (and its hook),
// model asset URLs, the headless avatar, and the shared Three.js controller.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, flush, cleanup } from './helpers/render.js';

const fake = vi.hoisted(() => ({
  availability: null,
  probe: null, // () => Promise<boolean>
  engines: [],
  renderers: [],
}));

vi.mock('../src/avatar/unity/unityBridge.js', () => ({
  getUnityAvailability: () => fake.availability,
  probeUnity: () => fake.probe(),
}));
vi.mock('../src/avatar/three/audio.js', () => ({
  AvatarAudioEngine: class {
    constructor(opts) {
      this.opts = opts;
      this.ended = null;
      for (const m of ['unlock', 'playAudioWithVisemeTimeline', 'playAudioWithLipSync', 'startStreamingPlayback',
        'appendAudioChunk', 'setSpeechEmotion', 'stopAudioLipSync']) this[m] = vi.fn(async () => {});
      this.endStreamingPlayback = vi.fn(async () => 'ended');
      this.waitForEnd = vi.fn(() => new Promise((r) => { this.ended = r; }));
      fake.engines.push(this);
    }
  },
}));
vi.mock('../src/avatar/three/renderer.js', () => ({
  createAvatarRenderer: vi.fn((opts) => {
    const r = { opts };
    for (const m of ['playAudioWithVisemeTimeline', 'playAudioWithLipSync', 'startStreamingPlayback', 'appendAudioChunk',
      'endStreamingPlayback', 'setSpeechEmotion', 'setAvatarState', 'setDebugMode', 'stopAudioLipSync', 'dispose']) r[m] = vi.fn();
    fake.renderers.push(r);
    return r;
  }),
}));

const setAvatar = (avatarId, extra = {}) => localStorage.setItem('dg_settings', JSON.stringify({ avatarId, avatarMigratedToUnity: true, ...extra }));

beforeEach(() => {
  localStorage.clear();
  fake.availability = null;
  fake.probe = () => Promise.resolve(true);
  fake.engines.length = 0;
  fake.renderers.length = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
});

describe('avatar roster', () => {
  it('lists the Unity characters first, then the Three.js fallbacks, in picker order', async () => {
    const { AVATAR_PROFILES, DEFAULT_AVATAR_ID } = await import('../src/avatar/avatarProfiles.js');
    expect(Object.keys(AVATAR_PROFILES)).toEqual(['aaron', 'ariana', 'aria', 'zhenja']);
    expect(DEFAULT_AVATAR_ID).toBe('aaron');
    expect(AVATAR_PROFILES.aaron).toMatchObject({ renderer: 'unity', unityCharacterId: 'aaron', openaiVoice: 'onyx', visemeWeights: null });
    expect(AVATAR_PROFILES.aria).toMatchObject({ renderer: 'threejs', modelKey: 'aria' });
  });

  it('getAvatarProfile falls back to the default for an unknown id', async () => {
    const { getAvatarProfile, AVATAR_PROFILES } = await import('../src/avatar/avatarProfiles.js');
    expect(getAvatarProfile('zhenja')).toBe(AVATAR_PROFILES.zhenja);
    expect(getAvatarProfile('nobody')).toBe(AVATAR_PROFILES.aaron);
    expect(getAvatarProfile(undefined)).toBe(AVATAR_PROFILES.aaron);
  });
});

describe('resolveEffectiveProfile', () => {
  it('stays optimistic about Unity while the probe is pending, and keeps it when a build exists', async () => {
    const { resolveEffectiveProfile, FALLBACK_AVATAR_ID } = await import('../src/avatar/effectiveProfile.js');
    expect(FALLBACK_AVATAR_ID).toBe('aria');
    expect(resolveEffectiveProfile('ariana').id).toBe('ariana');
    fake.availability = true;
    expect(resolveEffectiveProfile('aaron').id).toBe('aaron');
  });

  it('with no Unity build, every Unity profile degrades to the Three.js fallback together', async () => {
    const { resolveEffectiveProfile } = await import('../src/avatar/effectiveProfile.js');
    fake.availability = false;
    const p = resolveEffectiveProfile('aaron');
    expect(p).toMatchObject({ id: 'aria', renderer: 'threejs', openaiVoice: 'nova' });
    expect(resolveEffectiveProfile('zhenja').id).toBe('zhenja'); // Three.js profiles are unaffected
  });

  it('the hook re-resolves once the probe lands', async () => {
    const { useEffectiveAvatarProfile } = await import('../src/avatar/effectiveProfile.js');
    let land;
    fake.probe = () => new Promise((r) => { land = r; });
    const { result } = await renderHook(() => useEffectiveAvatarProfile('aaron'));
    expect(result.current.id).toBe('aaron');
    await flush(() => { fake.availability = false; land(false); });
    expect(result.current.id).toBe('aria');
  });

  it('a probe landing after unmount does not update the dead component', async () => {
    const { useEffectiveAvatarProfile } = await import('../src/avatar/effectiveProfile.js');
    let land;
    let renders = 0;
    fake.probe = () => new Promise((r) => { land = r; });
    const { unmount } = await renderHook(() => { renders += 1; return useEffectiveAvatarProfile('aaron'); });
    const before = renders;
    await unmount();
    await flush(() => land(true));
    expect(renders).toBe(before);
  });
});

describe('model assets', () => {
  it('maps model keys to bundled GLB URLs, defaulting to Aria', async () => {
    const { MODEL_URLS, BACKDROP_URL, modelUrlFor } = await import('../src/avatar/three/assets.js');
    expect(MODEL_URLS.aria).toMatch(/characters\/aria\/model\.glb$/);
    expect(MODEL_URLS.zhenja).toMatch(/characters\/zhenja\/zhenja\.glb$/);
    expect(BACKDROP_URL).toMatch(/cozy_living_room_baked_small\.glb$/);
    expect(modelUrlFor('zhenja')).toBe(MODEL_URLS.zhenja);
    expect(modelUrlFor('missing')).toBe(MODEL_URLS.aria);
  });
});

describe('headless avatar', () => {
  async function load() {
    vi.resetModules();
    const { getHeadlessAvatar } = await import('../src/avatar/headlessAvatar.js');
    return getHeadlessAvatar;
  }

  it('is one shared instance over one audio engine, and supports streaming', async () => {
    const getHeadlessAvatar = await load();
    const a = getHeadlessAvatar();
    expect(getHeadlessAvatar()).toBe(a);
    expect(fake.engines).toHaveLength(1);
    expect(a.engine).toBe(fake.engines[0]);
    expect(a.supportsStreamingAudio).toBe(true);
  });

  it('the audio-start callback fires once per registration', async () => {
    const a = (await load())();
    const cb = vi.fn();
    a.setOnAudioStart(cb);
    fake.engines[0].opts.onAudioStart();
    fake.engines[0].opts.onAudioStart();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('plays with the viseme timeline when there is one, and resolves only at audio end', async () => {
    const a = (await load())();
    const engine = fake.engines[0];
    let done = false;
    const p = a.playAudio({ audio: 'data:a', visemeTimeline: { frames: [] }, emotion: 'calm' }).then(() => { done = true; });
    await Promise.resolve();
    await Promise.resolve();
    expect(engine.playAudioWithVisemeTimeline).toHaveBeenCalledWith('data:a', { frames: [] }, 'calm');
    expect(done).toBe(false);
    engine.ended();
    await p;
    expect(done).toBe(true);
  });

  it('falls back to analyser lipsync without a timeline', async () => {
    const a = (await load())();
    const engine = fake.engines[0];
    const p = a.playAudio({ audio: 'data:b' });
    await Promise.resolve();
    engine.ended();
    await p;
    expect(engine.playAudioWithLipSync).toHaveBeenCalledWith('data:b');
    expect(engine.playAudioWithVisemeTimeline).not.toHaveBeenCalled();
  });

  it('forwards the streaming trio, emotion, stop and unlock to the engine', async () => {
    const a = (await load())();
    const engine = fake.engines[0];
    a.unlockAudio();
    a.startStreamingPlayback('s1', 22050, 'warm');
    a.appendAudioChunk('s1', 'pcm', [1]);
    expect(await a.endStreamingPlayback('s1')).toBe('ended');
    a.setSpeechEmotion('sad');
    a.stopAudio();
    expect(a.setAvatarState('thinking')).toBeUndefined(); // no visual
    expect(engine.unlock).toHaveBeenCalled();
    expect(engine.startStreamingPlayback).toHaveBeenCalledWith('s1', 22050, 'warm');
    expect(engine.appendAudioChunk).toHaveBeenCalledWith('s1', 'pcm', [1]);
    expect(engine.endStreamingPlayback).toHaveBeenCalledWith('s1');
    expect(engine.setSpeechEmotion).toHaveBeenCalledWith('sad');
    expect(engine.stopAudioLipSync).toHaveBeenCalled();
  });
});

describe('Three.js controller', () => {
  async function load() {
    vi.resetModules();
    const mod = await import('../src/avatar/three/controller.js');
    const assets = await import('../src/avatar/three/assets.js');
    return { ...mod, assets };
  }
  const started = (c) => vi.waitFor(() => expect(c.renderer).not.toBeNull());

  it('there is no Three.js controller for a Unity profile with a build available', async () => {
    const { getThreeAvatar, peekThreeAvatar } = await load();
    fake.availability = true;
    setAvatar('aaron');
    expect(getThreeAvatar()).toBeNull();
    expect(peekThreeAvatar()).toBeNull();
  });

  it('mounts the selected model into a stable host element', async () => {
    const { getThreeAvatar, peekThreeAvatar, assets } = await load();
    setAvatar('zhenja');
    const c = getThreeAvatar();
    expect(peekThreeAvatar()).toBe(c);
    expect(c.host.tagName).toBe('DIV');
    expect(c.host.style.position).toBe('absolute');
    expect(c).toMatchObject({ loaded: false, failed: false, supportsStreamingAudio: true });
    await started(c);
    const { opts } = fake.renderers[0];
    expect(opts.container).toBe(c.host);
    expect(opts.modelUrl).toBe(assets.MODEL_URLS.zhenja);
    expect(opts.backdropUrl).toBe(assets.BACKDROP_URL);
    expect(opts.debug).toBe(false);
  });

  it('a Unity profile with no build mounts the fallback model', async () => {
    const { getThreeAvatar, assets } = await load();
    fake.availability = false;
    setAvatar('aaron');
    const c = getThreeAvatar();
    expect(c.profile.id).toBe('aria');
    await started(c);
    expect(fake.renderers[0].opts.modelUrl).toBe(assets.MODEL_URLS.aria);
  });

  it('reuses the controller for the same profile and replaces it (disposing the old) on a change', async () => {
    const { getThreeAvatar } = await load();
    setAvatar('aria');
    const first = getThreeAvatar();
    await started(first);
    expect(getThreeAvatar()).toBe(first);
    setAvatar('zhenja');
    const second = getThreeAvatar();
    expect(second).not.toBe(first);
    expect(fake.renderers[0].dispose).toHaveBeenCalledTimes(1);
    expect(first.renderer).toBeNull();
  });

  it('turns renderer messages into status: loaded, error and lost context notify listeners', async () => {
    const { getThreeAvatar } = await load();
    setAvatar('aria');
    const c = getThreeAvatar();
    await started(c);
    const send = fake.renderers[0].opts.onMessage;
    const seen = [];
    const off = c.onStatusChange((ctl) => seen.push([ctl.loaded, ctl.failed]));
    send({ type: 'loaded' });
    send({ type: 'something-else' });
    send({ type: 'error', message: 'GLB parse failed' });
    expect(seen).toEqual([[true, false], [true, true]]);
    expect(console.warn).toHaveBeenCalledWith('[avatar] renderer error:', 'GLB parse failed');
    off();
    send({ type: 'context_lost' });
    expect(seen).toHaveLength(2); // unsubscribed
    expect(c.failed).toBe(true);
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/WebGL context lost/));
  });

  it('the audio-start callback is one-shot', async () => {
    const { getThreeAvatar } = await load();
    setAvatar('aria');
    const c = getThreeAvatar();
    await started(c);
    const cb = vi.fn();
    c.setOnAudioStart(cb);
    fake.renderers[0].opts.onMessage({ type: 'audioStart' });
    fake.renderers[0].opts.onMessage({ type: 'audioStart' });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('playAudio picks timeline or RMS lipsync and resolves on the renderer’s audioEnd', async () => {
    const { getThreeAvatar } = await load();
    setAvatar('aria');
    const c = getThreeAvatar();
    const early = c.playAudio({ audio: 'x' }); // before the renderer exists: no-op
    await expect(early).resolves.toBeUndefined();
    await started(c);
    const r = fake.renderers[0];
    const p1 = c.playAudio({ audio: 'a1', visemeTimeline: { frames: [1] }, emotion: 'happy' });
    const p2 = c.playAudio({ audio: 'a2' });
    expect(r.playAudioWithVisemeTimeline).toHaveBeenCalledWith('a1', { frames: [1] }, 'happy');
    expect(r.playAudioWithLipSync).toHaveBeenCalledWith('a2');
    r.opts.onMessage({ type: 'audioEnd' });
    await expect(Promise.all([p1, p2])).resolves.toEqual([undefined, undefined]);
  });

  it('a stop releases the playback it cut off, so the next audioEnd cannot wake it', async () => {
    const { getThreeAvatar } = await load();
    setAvatar('aria');
    const c = getThreeAvatar();
    await started(c);
    const r = fake.renderers[0];
    let stoppedDone = false;
    const stopped = c.playAudio({ audio: 'old' }).then(() => { stoppedDone = true; });
    c.stopAudio(); // the renderer posts no audioEnd for a stop
    await stopped;
    expect(stoppedDone).toBe(true);
    let nextDone = false;
    const next = c.playAudio({ audio: 'new' }).then(() => { nextDone = true; });
    await Promise.resolve();
    expect(nextDone).toBe(false); // waits for its own end, not the stop
    r.opts.onMessage({ type: 'audioEnd' });
    await next;
    expect(r.stopAudioLipSync).toHaveBeenCalledTimes(1);
  });

  it('streams through the renderer and waits for audioEnd at the end of the stream', async () => {
    const { getThreeAvatar } = await load();
    setAvatar('aria');
    const c = getThreeAvatar();
    await expect(c.endStreamingPlayback('s0')).resolves.toBeUndefined(); // nothing to end yet
    c.startStreamingPlayback('s0', 22050, 'calm'); // tolerated before the renderer exists
    await started(c);
    const r = fake.renderers[0];
    c.startStreamingPlayback('s1', 22050, 'calm');
    c.appendAudioChunk('s1', 'pcm', [{ t: 0 }]);
    let ended = false;
    const p = c.endStreamingPlayback('s1').then(() => { ended = true; });
    expect(r.endStreamingPlayback).toHaveBeenCalledWith('s1');
    await Promise.resolve();
    expect(ended).toBe(false);
    r.opts.onMessage({ type: 'audioEnd' });
    await p;
    expect(r.startStreamingPlayback).toHaveBeenCalledWith('s1', 22050, 'calm');
    expect(r.appendAudioChunk).toHaveBeenCalledWith('s1', 'pcm', [{ t: 0 }]);
  });

  it('forwards emotion, state, debug and stop; dispose releases the renderer', async () => {
    const { getThreeAvatar } = await load();
    setAvatar('aria');
    const c = getThreeAvatar();
    await started(c);
    const r = fake.renderers[0];
    c.unlockAudio(); // the renderer resumes its own context on play
    c.setSpeechEmotion('sad');
    c.setAvatarState('listening');
    c.setDebugMode(true);
    c.stopAudio();
    expect(r.setSpeechEmotion).toHaveBeenCalledWith('sad');
    expect(r.setAvatarState).toHaveBeenCalledWith('listening');
    expect(r.setDebugMode).toHaveBeenCalledWith(true);
    expect(r.stopAudioLipSync).toHaveBeenCalled();
    c.dispose();
    expect(r.dispose).toHaveBeenCalled();
    expect(() => { c.dispose(); c.stopAudio(); c.setAvatarState('idle'); c.setDebugMode(false); }).not.toThrow();
  });

  it('a renderer without debug support is tolerated', async () => {
    const { getThreeAvatar } = await load();
    setAvatar('aria');
    const c = getThreeAvatar();
    await started(c);
    delete fake.renderers[0].setDebugMode;
    expect(() => c.setDebugMode(true)).not.toThrow();
  });
});
