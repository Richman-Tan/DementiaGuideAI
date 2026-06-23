/**
 * UnityAvatarBridge — Phase 3 stub.
 *
 * In Phase 5 this module will import and call the expo-modules-core native
 * UnityAvatarModule to send messages to Unity via the UaaL bridge. Until then
 * all methods are no-ops so renderer:'unity' profiles do not crash.
 *
 * The AvatarUnity component exposes this interface via useImperativeHandle.
 */

// Phase 5: replace this block with:
//   import { NativeUnityAvatarModule } from '../../packages/unity-avatar-module/src';
//   and wire each method to NativeUnityAvatarModule.sendMessage(JSON.stringify(...))

export const UNITY_BRIDGE_STUB = {
  playAudio:      (_payload) => Promise.resolve(),
  stopAudio:      () => {},
  setOnAudioStart: (_cb) => {},
  setDebugMode:   (_on) => {},
};
