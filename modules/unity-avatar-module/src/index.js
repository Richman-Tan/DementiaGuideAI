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
export const NativeUnityAvatarModule = requireNativeModule('UnityAvatarModule');

export const UnityAvatarNativeView = requireNativeViewManager('UnityAvatarModule');
