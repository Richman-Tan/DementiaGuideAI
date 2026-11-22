// @vitest-environment jsdom
// Avatar logic that decides what the user hears, with the Web Audio engine
// faked (it needs a real audio clock, so it is excluded from coverage). Covered:
// the two-character roster and its fallback to the default for an id that is no
// longer on it, and the headless avatar the voice pipeline uses whenever no
// live Unity controller matches.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup } from './helpers/render.js';

const fake = vi.hoisted(() => ({ engines: [] }));

vi.mock('../src/avatar/audioEngine.js', () => ({
  AvatarAudioEngine: class {
    constructor(opts) {
      this.opts = opts;
      this.ended = null;
      for (const m of [
        'unlock',
        'playAudioWithVisemeTimeline',
        'playAudioWithLipSync',
        'startStreamingPlayback',
        'appendAudioChunk',
        'setSpeechEmotion',
        'stopAudioLipSync',
      ])
        this[m] = vi.fn(async () => {});
      this.endStreamingPlayback = vi.fn(async () => 'ended');
      this.waitForEnd = vi.fn(
        () =>
          new Promise((r) => {
            this.ended = r;
          })
      );
      fake.engines.push(this);
    }
  },
}));

beforeEach(() => {
  localStorage.clear();
  fake.engines.length = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
});

describe('avatar roster', () => {
  it('is exactly the two Unity characters, Aaron first', async () => {
    const { AVATAR_PROFILES, DEFAULT_AVATAR_ID } = await import('../src/avatar/avatarProfiles.js');
    expect(Object.keys(AVATAR_PROFILES)).toEqual(['aaron', 'ariana']);
    expect(DEFAULT_AVATAR_ID).toBe('aaron');
    expect(AVATAR_PROFILES.aaron).toMatchObject({
      renderer: 'unity',
      unityCharacterId: 'aaron',
      openaiVoice: 'onyx',
      visemeWeights: null,
    });
    expect(AVATAR_PROFILES.ariana).toMatchObject({
      renderer: 'unity',
      unityCharacterId: 'ariana',
      openaiVoice: 'nova',
    });
  });

  it('getAvatarProfile resolves the retired Three.js ids and anything unknown to the default', async () => {
    const { getAvatarProfile, AVATAR_PROFILES } = await import('../src/avatar/avatarProfiles.js');
    expect(getAvatarProfile('ariana')).toBe(AVATAR_PROFILES.ariana);
    for (const id of ['aria', 'zhenja', 'nobody', undefined])
      expect(getAvatarProfile(id)).toBe(AVATAR_PROFILES.aaron);
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
    const p = a
      .playAudio({ audio: 'data:a', visemeTimeline: { frames: [] }, emotion: 'calm' })
      .then(() => {
        done = true;
      });
    await Promise.resolve();
    await Promise.resolve();
    expect(engine.playAudioWithVisemeTimeline).toHaveBeenCalledWith(
      'data:a',
      { frames: [] },
      'calm'
    );
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
