import React, { useImperativeHandle, forwardRef } from 'react';
import { View } from 'react-native';
import { UNITY_BRIDGE_STUB } from '../services/avatarBridge/UnityAvatarBridge';

/**
 * AvatarUnity — Phase 3 stub.
 *
 * Satisfies the AvatarBridgeProtocol with no-op methods so VoiceScreen can
 * conditionally render this in place of AvatarVRM for renderer:'unity' profiles
 * without crashing. Renders nothing — a placeholder will be shown by VoiceScreen.
 *
 * Phase 5: this component mounts the native UnityAvatarView (expo-modules-core
 * Fabric component) and wires up the full UaaL bridge.
 */
export const AvatarUnity = forwardRef(function AvatarUnity(_props, ref) {
  useImperativeHandle(ref, () => ({
    playAudio:      UNITY_BRIDGE_STUB.playAudio,
    stopAudio:      UNITY_BRIDGE_STUB.stopAudio,
    setOnAudioStart: UNITY_BRIDGE_STUB.setOnAudioStart,
    setDebugMode:   UNITY_BRIDGE_STUB.setDebugMode,
  }), []);

  // Renders nothing in Phase 3 — VoiceScreen shows its own placeholder for Unity profiles.
  return <View />;
});
