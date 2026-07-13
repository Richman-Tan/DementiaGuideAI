/**
 * UnityAvatarBridge — Phase 5.
 *
 * Real implementation of AvatarBridgeProtocol for renderer:'unity' profiles.
 * Unity never decodes or plays audio itself — it only needs blendshape timing —
 * so playback happens here via expo-av (same Audio API already used for
 * recording in useAvatarConversation.js and playback in ChatScreen.js), while
 * the CC4 blendshape timeline is forwarded to the native UaaL bridge so Unity
 * renders lip sync in step with that playback.
 *
 * The AvatarUnity component exposes this interface via useImperativeHandle.
 */

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { segmentToCC4Payload } from './blendshapeTranslator';
import { NativeUnityAvatarModule } from '../../../../modules/unity-avatar-module/src';

let currentSound = null;
let currentTempPath = null;
let onAudioStartCb = null;

async function cleanupSound() {
  const sound = currentSound;
  const tempPath = currentTempPath;
  currentSound = null;
  currentTempPath = null;

  if (sound) {
    sound.setOnPlaybackStatusUpdate(null);
    await sound.stopAsync().catch(() => {});
    await sound.unloadAsync().catch(() => {});
  }
  if (tempPath) {
    await FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
  }
}

async function stopAudio() {
  await cleanupSound();
  NativeUnityAvatarModule.stopAudio().catch(() => {});
}

async function playAudio(payload) {
  const segment = typeof payload === 'string' ? { audio: payload, visemeTimeline: null } : payload;

  await stopAudio();

  // visemeWeights is null for every CC4 profile today (see avatarProfiles.js —
  // blendshapeTranslator falls back to its own CC4_DEFAULT_WEIGHT in that case).
  // If a future CC4 profile needs custom per-viseme weights, thread it through
  // as an AvatarUnity prop the same way modelUrl reaches AvatarVRM.
  const cc4Payload = segmentToCC4Payload(segment, null);

  await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: false });

  // Audio.Sound.createAsync doesn't reliably load data: URIs directly — write
  // to a temp file first, matching the established pattern in ChatScreen.js.
  const base64    = segment.audio.replace(/^data:audio\/\w+;base64,/, '');
  const tempPath  = `${FileSystem.cacheDirectory}cc4_avatar_${Date.now()}.mp3`;
  await FileSystem.writeAsStringAsync(tempPath, base64, { encoding: FileSystem.EncodingType.Base64 });

  const { sound } = await Audio.Sound.createAsync({ uri: tempPath }, { shouldPlay: false });
  currentSound     = sound;
  currentTempPath  = tempPath;

  return new Promise((resolve, reject) => {
    let started = false;

    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) return;

      if (!started && status.isPlaying) {
        started = true;
        onAudioStartCb?.();
        NativeUnityAvatarModule.playAudio(JSON.stringify({
          type:        'play',
          duration:    (status.durationMillis ?? 0) / 1000,
          // Raw 14-key viseme events — preferred by Unity's co-articulation
          // engine. blendshapes kept as the legacy fallback path.
          visemes:     cc4Payload.visemes,
          blendshapes: cc4Payload.blendshapes,
        })).catch((err) => console.warn('[UnityAvatarBridge] native playAudio failed:', err));
      }

      if (status.didJustFinish) {
        sound.setOnPlaybackStatusUpdate(null);
        resolve();
      }
    });

    sound.playAsync().catch(reject);
  });
}

function setOnAudioStart(cb) {
  onAudioStartCb = cb;
}

function setDebugMode(on) {
  NativeUnityAvatarModule.setDebugMode(on).catch(() => {});
}

export const UnityAvatarBridge = {
  playAudio,
  stopAudio,
  setOnAudioStart,
  setDebugMode,
};
