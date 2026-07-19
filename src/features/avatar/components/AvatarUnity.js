import React, { useEffect, useImperativeHandle, forwardRef } from 'react';
import { UnityAvatarBridge } from '@/features/avatar/bridge/UnityAvatarBridge';
import { UnityAvatarNativeView } from '../../../../modules/unity-avatar-module/src';

/**
 * AvatarUnity — Phase 5.
 *
 * Mounts the native UnityAvatarView (expo-modules-core Fabric component) and
 * wires the ref up to the real UnityAvatarBridge. Unity itself boots lazily on
 * the native side, on the first playAudio()/initialize() call — not here.
 *
 * `characterId` selects which character AvatarRouter activates in the Unity
 * scene ('aaron'/'ariana', from the profile's unityCharacterId).
 */
export const AvatarUnity = forwardRef(function AvatarUnity(props, ref) {
  const { characterId } = props;

  useEffect(() => {
    if (characterId) UnityAvatarBridge.setCharacter(characterId);
  }, [characterId]);

  useImperativeHandle(ref, () => ({
    playAudio:       UnityAvatarBridge.playAudio,
    stopAudio:       UnityAvatarBridge.stopAudio,
    setOnAudioStart: UnityAvatarBridge.setOnAudioStart,
    setCharacter:    UnityAvatarBridge.setCharacter,
    setDebugMode:    UnityAvatarBridge.setDebugMode,
  }), []);

  return <UnityAvatarNativeView style={props.style} />;
});
