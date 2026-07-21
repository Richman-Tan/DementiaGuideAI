import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/theme/colors';
import { useSettings } from '@/context/SettingsContext';

export function WelcomeScreen({ navigation }) {
  const { updateSetting, textScale, reducedMotion } = useSettings();

  const fadeAnim = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const slideAnim = useRef(new Animated.Value(reducedMotion ? 0 : 30)).current;

  useEffect(() => {
    if (reducedMotion) return;
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const completeOnboarding = () => {
    updateSetting('hasCompletedOnboarding', true);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Animated.View
        style={[
          styles.container,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Avatar placeholder */}
        <View style={styles.avatarCircle}>
          <MaterialCommunityIcons
            name="robot-excited"
            size={56}
            color={Colors.primary}
          />
        </View>

        {/* Title */}
        <Text style={[styles.title, { fontSize: 28 * textScale }]}>
          {'Welcome to\nDementiaGuide AI'}
        </Text>

        {/* Subtitle */}
        <Text style={[styles.subtitle, { fontSize: 18 * textScale }]}>
          {"I'm Aria. I'm here to help you find\nclear, trustworthy information —\nany time you need it."}
        </Text>

        {/* Time note */}
        <Text style={[styles.note, { fontSize: 14 * textScale }]}>
          This takes about 2 minutes
        </Text>

        {/* Spacer */}
        <View style={styles.spacer} />

        {/* Primary button */}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('SetupType')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Let's begin"
        >
          <Text style={[styles.primaryButtonText, { fontSize: 17 * textScale }]}>
            Let's begin
          </Text>
        </TouchableOpacity>

        {/* Secondary link */}
        <TouchableOpacity
          onPress={completeOnboarding}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Skip setup — go straight to the app"
          style={styles.skipLink}
        >
          <Text style={[styles.skipLinkText, { fontSize: 15 * textScale }]}>
            Skip setup — go straight to the app
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 32,
  },
  avatarCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 48,
  },
  title: {
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: 28,
    lineHeight: 38,
  },
  subtitle: {
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 28,
    marginTop: 12,
  },
  note: {
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: 8,
  },
  spacer: {
    flex: 1,
  },
  primaryButton: {
    width: '100%',
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  skipLink: {
    marginTop: 16,
    paddingVertical: 8,
  },
  skipLinkText: {
    color: Colors.primary,
    textAlign: 'center',
  },
});
