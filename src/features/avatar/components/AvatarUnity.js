import React, { useImperativeHandle, forwardRef } from 'react';
import { UnityAvatarBridge } from '@/features/avatar/bridge/UnityAvatarBridge';
import { UnityAvatarNativeView } from '../../../../modules/unity-avatar-module/src';

/**
 * AvatarUnity — Phase 5.
 *
 * Mounts the native UnityAvatarView (expo-modules-core Fabric component) and
 * wires the ref up to the real UnityAvatarBridge. Unity itself boots lazily on
 * the native side, on the first playAudio()/initialize() call — not here.
 */
export const AvatarUnity = forwardRef(function AvatarUnity(props, ref) {
  useImperativeHandle(ref, () => ({
    playAudio:       UnityAvatarBridge.playAudio,
    stopAudio:       UnityAvatarBridge.stopAudio,
    setOnAudioStart: UnityAvatarBridge.setOnAudioStart,
    setDebugMode:    UnityAvatarBridge.setDebugMode,
  }), []);

  return <UnityAvatarNativeView style={props.style} />;
});
