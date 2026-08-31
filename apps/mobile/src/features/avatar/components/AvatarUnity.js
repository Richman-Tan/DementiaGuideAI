import React, { useEffect, useImperativeHandle, forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/theme/colors';
import { Typography } from '@/theme/typography';
import { UnityAvatarBridge } from '@/features/avatar/bridge/UnityAvatarBridge';
import { UnityAvatarNativeView, isUnityAvatarAvailable } from '../../../../modules/unity-avatar-module/src';

/**
 * AvatarUnity — Phase 5.
 *
 * Mounts the native UnityAvatarView (expo-modules-core Fabric component) and
 * wires the ref up to the real UnityAvatarBridge. Unity itself boots lazily on
 * the native side, on the first playAudio()/initialize() call — not here.
 *
 * `characterId` selects which character AvatarRouter activates in the Unity
 * scene ('aaron'/'ariana', from the profile's unityCharacterId).
 *
 * When the native module is missing (iOS Simulator, or an Android build
 * without the Unity android-export), a visible unavailable-state renders
 * instead of a silent blank view. The imperative handle stays fully wired:
 * UnityAvatarBridge owns audio playback through expo-av, so voice
 * conversation keeps working audio-only.
 */
export const AvatarUnity = forwardRef(function AvatarUnity(props, ref) {
  const { characterId, isListening, isSpeaking, isThinking, isEmpathetic, isWaiting } = props;

  useEffect(() => {
    if (characterId) UnityAvatarBridge.setCharacter(characterId);
  }, [characterId]);

  // Same state derivation and precedence as AvatarVRM, so both renderers agree
  // on what the avatar is doing. Drives IdleAnimator's six-way blend Unity-side.
  useEffect(() => {
    const next = isSpeaking    ? 'speaking'
      : isThinking   ? 'thinking'
        : isEmpathetic ? 'empathy'
          : isListening  ? 'listening'
            : isWaiting    ? 'waiting'
              : 'idle';
    UnityAvatarBridge.setAvatarState(next);
  }, [isListening, isSpeaking, isThinking, isEmpathetic, isWaiting]);

  useImperativeHandle(ref, () => ({
    playAudio:       UnityAvatarBridge.playAudio,
    stopAudio:       UnityAvatarBridge.stopAudio,
    setOnAudioStart: UnityAvatarBridge.setOnAudioStart,
    setCharacter:    UnityAvatarBridge.setCharacter,
    setAvatarState:  UnityAvatarBridge.setAvatarState,
    setDebugMode:    UnityAvatarBridge.setDebugMode,
  }), []);

  if (!isUnityAvatarAvailable) {
    const initial = (characterId || 'A').charAt(0).toUpperCase();
    return (
      <View style={[styles.fallback, props.style]}>
        <View style={styles.fallbackBadge}>
          <Text style={styles.fallbackInitial}>{initial}</Text>
        </View>
        <Text style={styles.fallbackCaption}>
          The 3D avatar isn't available on this build — voice still works.
        </Text>
      </View>
    );
  }

  return <UnityAvatarNativeView style={props.style} />;
});

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryMuted,
  },
  fallbackBadge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    marginBottom: 12,
  },
  fallbackInitial: {
    ...Typography.displayMedium,
    color: Colors.textInverse,
  },
  fallbackCaption: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
