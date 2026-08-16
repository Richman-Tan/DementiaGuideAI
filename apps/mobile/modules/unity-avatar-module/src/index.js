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
// The native module can legitimately be missing: iOS Simulator builds
// (UnityFramework is a device-only arm64 binary) and Android builds made
// without the committed Unity android-export. requireNativeModule throws at
// IMPORT time, which would kill app boot for everyone (this file is in the
// static import graph via AvatarUnity). Guard the lookup and EXPORT the
// outcome — AvatarUnity renders a visible unavailable-state instead of a
// silent blank view, while conversation audio keeps working through expo-av.
let nativeModuleAvailable = false;

function resolveNativeModule() {
  try {
    const nativeModule = requireNativeModule('UnityAvatarModule');
    nativeModuleAvailable = true;
    return nativeModule;
  } catch (e) {
    console.warn(
      `[UnityAvatarModule] native module unavailable (${e.message}) — Unity avatar disabled ` +
        '(iOS simulator build, or Android build without the Unity android-export?)'
    );
    const warnOnce = () =>
      console.warn('[UnityAvatarModule] call ignored — native module unavailable');
    return {
      initialize: async () => warnOnce(),
      playAudio: async () => warnOnce(),
      stopAudio: async () => {},
      setCharacter: async () => {},
      setDebugMode: async () => {},
    };
  }
}

function resolveNativeView() {
  try {
    return requireNativeViewManager('UnityAvatarModule');
  } catch (e) {
    return () => null; // AvatarUnity renders its unavailable-fallback instead
  }
}

export const NativeUnityAvatarModule = resolveNativeModule();

export const UnityAvatarNativeView = resolveNativeView();

/** True when the real native Unity module loaded (device build with the Unity artifact present). */
export const isUnityAvatarAvailable = nativeModuleAvailable;
