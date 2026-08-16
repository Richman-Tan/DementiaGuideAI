import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { OnboardingLayout } from '@/features/onboarding/components/OnboardingLayout';
import { Colors } from '@/theme/colors';
import { useSettings } from '@/context/SettingsContext';

function ToggleRow({ iconName, label, description, value, onToggle, isLast }) {
  return (
    <View style={[styles.toggleRow, !isLast && styles.toggleRowBorder]}>
      <View style={styles.toggleIcon}>
        <MaterialCommunityIcons name={iconName} size={22} color={Colors.primary} />
      </View>
      <View style={styles.toggleText}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: Colors.border, true: Colors.primary }}
        thumbColor="#fff"
        ios_backgroundColor={Colors.border}
        accessibilityLabel={`Toggle ${label}`}
      />
    </View>
  );
}

export function DisplayPrefsScreen({ navigation, route }) {
  const {
    updateSetting,
    toggleDarkMode,
    highContrast,
    reducedMotion,
    darkMode,
  } = useSettings();

  const handleNext = () => {
    if (route.params?.returnToSummary) {
      navigation.navigate('Summary');
    } else {
      navigation.navigate('Safety');
    }
  };

  return (
    <OnboardingLayout
      step={9}
      totalSteps={9}
      onBack={() => navigation.goBack()}
      onSkip={handleNext}
      onNext={handleNext}
      nextLabel="Next"
      title="A few display choices"
      subtitle="These can all be changed later in Settings."
    >
      <ToggleRow
        iconName="contrast-circle"
        label="Stronger colours"
        description="Easier to read in bright light"
        value={highContrast}
        onToggle={(v) => updateSetting('highContrast', v)}
        isLast={false}
      />
      <ToggleRow
        iconName="motion-pause-outline"
        label="Reduce movement"
        description="Fewer animations on screen"
        value={reducedMotion}
        onToggle={(v) => updateSetting('reducedMotion', v)}
        isLast={false}
      />
      <ToggleRow
        iconName="weather-night"
        label="Dark background"
        description="Easier on the eyes at night"
        value={darkMode}
        onToggle={toggleDarkMode}
        isLast
      />
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  toggleRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  toggleIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  toggleText: {
    flex: 1,
    marginLeft: 12,
    gap: 2,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  toggleDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
});
