import { requireNativeModule, requireNativeViewManager } from 'expo-modules-core';

/**
 * Native bridge to the embedded Unity CC4 avatar (UaaL), iOS only.
 *
 * - `initialize()` / `playAudio()` lazily boot Unity on first call (see
 *   UnityBridgeManager.swift) — never at app launch.
 * - `playAudio(payloadJson)` expects a JSON string matching the
 *   NativeBridgeReceiver.cs wire protocol:
 *   `{ type: 'play', duration, visemes: [{t, d, v, w}], blendshapes: [{time, weights}] }`
 *   — `visemes` drives Unity's co-articulation engine; `blendshapes` is the
 *   legacy fallback for payloads without viseme events.
 */
// UnityFramework is a device-only arm64 binary, so the native module doesn't
// exist in simulator builds — and requireNativeModule throws at IMPORT time,
// which would kill app boot for everyone (this file is in the static import
// graph via AvatarUnity). Guard the lookup: on simulator the app runs
// normally with the Three.js avatars, and the Unity profile no-ops loudly.
function resolveNativeModule() {
  try {
    return requireNativeModule('UnityAvatarModule');
  } catch (e) {
    console.warn(
      `[UnityAvatarModule] native module unavailable (${e.message}) — Unity avatar disabled (simulator build?)`
    );
    const warnOnce = () => console.warn('[UnityAvatarModule] call ignored — native module unavailable');
    return {
      initialize: async () => warnOnce(),
      playAudio: async () => warnOnce(),
      stopAudio: async () => {},
      setDebugMode: async () => {},
    };
  }
}

function resolveNativeView() {
  try {
    return requireNativeViewManager('UnityAvatarModule');
  } catch (e) {
    return () => null; // renders nothing if the Unity profile is selected anyway
  }
}

export const NativeUnityAvatarModule = resolveNativeModule();

export const UnityAvatarNativeView = resolveNativeView();
