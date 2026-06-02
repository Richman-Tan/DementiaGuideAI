import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useSettings } from '../../context/SettingsContext';
import { ProgressBar } from './ProgressBar';

export function OnboardingLayout({
  step,
  totalSteps,
  onBack,
  onSkip,
  onNext,
  nextLabel = 'Next',
  nextDisabled = false,
  children,
  title,
  subtitle,
}) {
  const { textScale } = useSettings();

  return (
    <SafeAreaView
      style={styles.safe}
      edges={['top', 'bottom']}
    >
      {/* Header */}
      <View style={styles.header}>
        {/* Left: back button */}
        <View style={styles.headerLeft}>
          {onBack ? (
            <TouchableOpacity
              onPress={onBack}
              style={styles.headerIconBtn}
              accessibilityLabel="Go back to previous step"
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.headerIconBtn} />
          )}
        </View>

        {/* Centre: progress bar */}
        <View style={styles.headerCentre}>
          {step !== undefined && (
            <ProgressBar step={step} totalSteps={totalSteps} />
          )}
        </View>

        {/* Right: skip button */}
        <View style={styles.headerRight}>
          {onSkip ? (
            <TouchableOpacity
              onPress={onSkip}
              style={styles.skipBtn}
              accessibilityLabel="Skip this step"
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.skipText, { fontSize: 15 * textScale }]}>Skip</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.skipBtn} />
          )}
        </View>
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {title ? (
          <Text style={[styles.title, { fontSize: 26 * textScale }]}>{title}</Text>
        ) : null}
        {subtitle ? (
          <Text style={[styles.subtitle, { fontSize: 17 * textScale }]}>{subtitle}</Text>
        ) : null}
        {children}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.nextButton,
            { backgroundColor: nextDisabled ? Colors.border : Colors.primary },
          ]}
          onPress={onNext}
          disabled={nextDisabled}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={nextLabel}
          accessibilityState={{ disabled: nextDisabled }}
        >
          <Text
            style={[
              styles.nextButtonText,
              {
                fontSize: 17 * textScale,
                color: nextDisabled ? Colors.textTertiary : '#FFFFFF',
              },
            ]}
          >
            {nextLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    height: 56,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLeft: {
    width: 64,
    alignItems: 'flex-start',
  },
  headerCentre: {
    flex: 1,
    alignItems: 'center',
  },
  headerRight: {
    width: 64,
    alignItems: 'flex-end',
  },
  headerIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtn: {
    minWidth: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: {
    color: Colors.textSecondary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  title: {
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 28,
    marginBottom: 8,
    lineHeight: 34,
  },
  subtitle: {
    color: Colors.textSecondary,
    lineHeight: 26,
    marginBottom: 28,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  nextButton: {
    width: '100%',
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonText: {
    fontWeight: '600',
  },
});
