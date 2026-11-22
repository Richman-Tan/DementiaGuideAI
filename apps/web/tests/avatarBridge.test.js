// The voice pipeline's avatar facade (avatar/avatarBridge.js). Per call it
// picks the live engine — the Unity controller for the selected character, or
// the headless audio engine — and a streaming session stays pinned to the
// engine it started on. The engines are recording fakes; the settings snapshot
// and the profile lookup are real.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const fake = vi.hoisted(() => ({ unity: null, headless: null }));

vi.mock('../src/avatar/unity/UnityAvatarController.js', () => ({
  peekUnityAvatar: () => fake.unity,
}));
vi.mock('../src/avatar/headlessAvatar.js', () => ({ getHeadlessAvatar: () => fake.headless }));

const { voiceAvatar } = await import('../src/avatar/avatarBridge.js');

function engine(name, extra = {}) {
  const e = { name, supportsStreamingAudio: true, ...extra };
  for (const m of [
    'unlockAudio',
    'setOnAudioStart',
    'startStreamingPlayback',
    'appendAudioChunk',
    'setSpeechEmotion',
    'setAvatarState',
    'stopAudio',
  ])
    e[m] = vi.fn();
  e.playAudio = vi.fn(async () => `${name} played`);
  e.endStreamingPlayback = vi.fn(async () => `${name} ended`);
  return e;
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}
const setAvatar = (avatarId) => localStorage.setItem('dg_settings', JSON.stringify({ avatarId }));

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  fake.headless = engine('headless');
  fake.unity = null;
  voiceAvatar.stopAudio(); // drop any pinned session from the previous test
  fake.headless.stopAudio.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('engine selection', () => {
  it('the Unity controller when it is showing the selected character', async () => {
    setAvatar('ariana');
    fake.unity = engine('unity', { characterId: 'ariana', supportsStreamingAudio: false });
    expect(await voiceAvatar.playAudio({ audio: 'a' })).toBe('unity played');
    expect(voiceAvatar.supportsStreamingAudio).toBe(false); // REST cascade on Unity
  });

  it('headless while Unity shows another character or has not booted', async () => {
    setAvatar('ariana');
    fake.unity = engine('unity', { characterId: 'aaron' });
    expect(await voiceAvatar.playAudio({})).toBe('headless played');
    fake.unity = null;
    expect(await voiceAvatar.playAudio({})).toBe('headless played');
  });

  it('a retired stored id resolves to the default character', async () => {
    setAvatar('aria');
    fake.unity = engine('unity', { characterId: 'aaron' });
    expect(await voiceAvatar.playAudio({})).toBe('unity played');
  });
});

describe('streaming sessions are pinned', () => {
  it('chunks, emotion and the end go to the engine the stream started on', async () => {
    setAvatar('aaron');
    voiceAvatar.startStreamingPlayback('s1', 22050, 'warm');
    expect(fake.headless.startStreamingPlayback).toHaveBeenCalledWith('s1', 22050, 'warm');
    // The Unity controller comes up mid-reply…
    fake.unity = engine('unity', { characterId: 'aaron' });
    voiceAvatar.appendAudioChunk('s1', 'pcm', [1]);
    voiceAvatar.setSpeechEmotion('calm');
    voiceAvatar.setOnAudioStart(() => {});
    expect(await voiceAvatar.endStreamingPlayback('s1')).toBe('headless ended');
    expect(fake.headless.appendAudioChunk).toHaveBeenCalledWith('s1', 'pcm', [1]);
    expect(fake.headless.setSpeechEmotion).toHaveBeenCalledWith('calm');
    expect(fake.headless.setOnAudioStart).toHaveBeenCalled();
    expect(fake.unity.appendAudioChunk).not.toHaveBeenCalled();
    // …and the next stream uses it.
    voiceAvatar.appendAudioChunk('s2', 'pcm', [2]);
    expect(fake.unity.appendAudioChunk).toHaveBeenCalledWith('s2', 'pcm', [2]);
  });

  it('the pin is released even when ending the stream fails', async () => {
    setAvatar('aaron');
    fake.headless.endStreamingPlayback.mockRejectedValueOnce(new Error('ctx closed'));
    voiceAvatar.startStreamingPlayback('s1', 22050, 'warm');
    fake.unity = engine('unity', { characterId: 'aaron' });
    await expect(voiceAvatar.endStreamingPlayback('s1')).rejects.toThrow('ctx closed');
    expect(await voiceAvatar.endStreamingPlayback('s2')).toBe('unity ended');
  });

  it('without a session, calls go to the live target', () => {
    setAvatar('aaron');
    voiceAvatar.setSpeechEmotion('happy');
    voiceAvatar.setOnAudioStart(() => {});
    expect(fake.headless.setSpeechEmotion).toHaveBeenCalledWith('happy');
    expect(fake.headless.setOnAudioStart).toHaveBeenCalled();
  });
});

describe('broadcasts', () => {
  it('unlockAudio unlocks the headless engine and Unity when present', () => {
    voiceAvatar.unlockAudio();
    expect(fake.headless.unlockAudio).toHaveBeenCalledTimes(1);
    fake.unity = engine('unity', { characterId: 'aaron' });
    voiceAvatar.unlockAudio();
    expect(fake.unity.unlockAudio).toHaveBeenCalledTimes(1);
  });

  it('stopAudio silences every engine and drops the pinned session', () => {
    setAvatar('aaron');
    voiceAvatar.startStreamingPlayback('s1', 22050, 'warm');
    fake.unity = engine('unity', { characterId: 'aaron' });
    voiceAvatar.stopAudio();
    expect(fake.unity.stopAudio).toHaveBeenCalled();
    expect(fake.headless.stopAudio).toHaveBeenCalled();
    voiceAvatar.appendAudioChunk('s1', 'pcm', []);
    expect(fake.unity.appendAudioChunk).toHaveBeenCalled(); // no longer pinned to headless
  });

  it('stopAudio with only the headless engine', () => {
    voiceAvatar.stopAudio();
    expect(fake.headless.stopAudio).toHaveBeenCalledTimes(1);
  });

  it('setAvatarState reaches the live Unity controller only', () => {
    voiceAvatar.setAvatarState('thinking'); // nothing mounted: no-op
    fake.unity = engine('unity', { characterId: 'aaron' });
    voiceAvatar.setAvatarState('speaking');
    expect(fake.unity.setAvatarState).toHaveBeenCalledWith('speaking');
    expect(fake.headless.setAvatarState).not.toHaveBeenCalled();
  });
});
