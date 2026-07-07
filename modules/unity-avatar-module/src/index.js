import { requireNativeModule, requireNativeViewManager } from 'expo-modules-core';

/**
 * Native bridge to the embedded Unity CC4 avatar (UaaL), iOS only.
 *
 * - `initialize()` / `playAudio()` lazily boot Unity on first call (see
 *   UnityBridgeManager.swift) — never at app launch.
 * - `playAudio(payloadJson)` expects a JSON string matching the
 *   NativeBridgeReceiver.cs wire protocol:
 *   `{ type: 'play', duration, blendshapes: [{time, weights}] }`.
 */
export const NativeUnityAvatarModule = requireNativeModule('UnityAvatarModule');

export const UnityAvatarNativeView = requireNativeViewManager('UnityAvatarModule');
