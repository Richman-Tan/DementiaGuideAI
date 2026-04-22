import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { Colors } from '../constants/colors';

// Placeholder for NVIDIA ACE avatar integration.
// In production, this component wraps the ACE WebRTC stream or SDK renderer.
// The ACE service provides real-time lip-sync, expression, and speech output.

export const Avatar = ({
  size = 120,
  isListening = false,
  isSpeaking = false,
  isIdle = true,
  style,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const breatheAnim = useRef(new Animated.Value(1)).current;
  const speakAnim = useRef(new Animated.Value(0)).current;

  // Idle breathe animation
  useEffect(() => {
    if (isIdle && !isListening && !isSpeaking) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(breatheAnim, {
            toValue: 1.03,
            duration: 2500,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(breatheAnim, {
            toValue: 1,
            duration: 2500,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      breatheAnim.stopAnimation();
      breatheAnim.setValue(1);
    }
  }, [isIdle, isListening, isSpeaking]);

  // Listening pulse
  useEffect(() => {
    if (isListening) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.12,
            duration: 600,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: false,
          }),
          Animated.timing(glowAnim, {
            toValue: 0.3,
            duration: 800,
            useNativeDriver: false,
          }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
      glowAnim.stopAnimation();
      glowAnim.setValue(0);
    }
  }, [isListening]);

  // Speaking animation
  useEffect(() => {
    if (isSpeaking) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(speakAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: false,
          }),
          Animated.timing(speakAnim, {
            toValue: 0.4,
            duration: 300,
            useNativeDriver: false,
          }),
        ])
      ).start();
    } else {
      speakAnim.stopAnimation();
      speakAnim.setValue(0);
    }
  }, [isSpeaking]);

  const ringSize = size + 20;
  const outerRingSize = size + 40;

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.5],
  });

  const speakingBorderColor = speakAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [Colors.primaryLight, Colors.accent],
  });

  return (
    <View style={[styles.container, { width: outerRingSize, height: outerRingSize }, style]}>
      {/* Outer glow ring */}
      {(isListening || isSpeaking) && (
        <Animated.View
          style={[
            styles.outerRing,
            {
              width: outerRingSize,
              height: outerRingSize,
              borderRadius: outerRingSize / 2,
              opacity: glowOpacity,
              backgroundColor: isListening ? Colors.primaryMuted : Colors.accentMuted,
            },
          ]}
        />
      )}

      {/* Inner pulse ring */}
      <Animated.View
        style={[
          styles.ring,
          {
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            transform: [{ scale: pulseAnim }],
            borderColor: isListening
              ? Colors.primary
              : isSpeaking
              ? Colors.accent
              : Colors.border,
            borderWidth: isListening ? 2 : isSpeaking ? 2 : 1,
          },
        ]}
      />

      {/* Avatar face */}
      <Animated.View
        style={[
          styles.avatarCircle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            transform: [{ scale: breatheAnim }],
          },
        ]}
      >
        {/* Gradient-like layered background */}
        <View style={[styles.avatarInner, { width: size, height: size, borderRadius: size / 2 }]}>
          {/* Face silhouette - placeholder for ACE video stream */}
          <View style={styles.faceContainer}>
            {/* Head shape */}
            <View style={[styles.head, { width: size * 0.52, height: size * 0.56 }]} />

            {/* Eyes */}
            <View style={styles.eyeRow}>
              <View style={[styles.eye, isSpeaking && styles.eyeSpeaking]} />
              <View style={[styles.eye, isSpeaking && styles.eyeSpeaking]} />
            </View>

            {/* Mouth - animated when speaking */}
            <Animated.View
              style={[
                styles.mouth,
                isSpeaking && {
                  height: speakAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [3, 8],
                  }),
                  borderRadius: 6,
                },
              ]}
            />
          </View>

          {/* Status indicator dot */}
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: isListening
                  ? Colors.success
                  : isSpeaking
                  ? Colors.accent
                  : Colors.secondary,
              },
            ]}
          />
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerRing: {
    position: 'absolute',
  },
  ring: {
    position: 'absolute',
    borderStyle: 'solid',
  },
  avatarCircle: {
    overflow: 'hidden',
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
  },
  avatarInner: {
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  faceContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  head: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 100,
    marginBottom: 2,
  },
  eyeRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: -30,
  },
  eye: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  eyeSpeaking: {
    backgroundColor: 'rgba(255,255,255,1)',
  },
  mouth: {
    width: 22,
    height: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.75)',
    marginTop: 6,
  },
  statusDot: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.surface,
  },
});
