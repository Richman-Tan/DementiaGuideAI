import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { OnboardingLayout } from '../../components/onboarding/OnboardingLayout';
import { Colors } from '../../constants/colors';
import { useSettings } from '../../context/SettingsContext';

const SIZE_OPTIONS = [
  { value: 'small', label: 'Smaller', fontSize: 14 },
  { value: 'medium', label: 'Normal', fontSize: 17 },
  { value: 'large', label: 'Larger', fontSize: 21 },
  { value: 'xlarge', label: 'Largest', fontSize: 26 },
];

export function TextSizeScreen({ navigation, route }) {
  const { setTextSize, textSize } = useSettings();
  const [selected, setSelected] = useState(textSize);

  const handleNext = () => {
    setTextSize(selected);
    if (route.params?.returnToSummary) {
      navigation.navigate('Summary');
    } else {
      navigation.navigate('DisplayPrefs');
    }
  };

  const handleSkip = () => {
    navigation.navigate('DisplayPrefs');
  };

  return (
    <OnboardingLayout
      step={8}
      totalSteps={9}
      onBack={() => navigation.goBack()}
      onSkip={handleSkip}
      onNext={handleNext}
      nextLabel="Next"
      title={"How would you like\nthe text to appear?"}
    >
      {SIZE_OPTIONS.map((opt) => {
        const isSelected = selected === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[
              styles.sizeCard,
              isSelected ? styles.sizeCardSelected : styles.sizeCardDefault,
            ]}
            onPress={() => setSelected(opt.value)}
            activeOpacity={0.75}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={`${opt.label} text size. Preview: Aria is here to help you.`}
          >
            <Text
              style={[
                styles.bigA,
                { fontSize: opt.fontSize, color: isSelected ? Colors.primary : Colors.textPrimary },
              ]}
            >
              A
            </Text>
            <View style={styles.sizeCardText}>
              <Text
                style={[
                  styles.sizeLabel,
                  { fontSize: opt.fontSize, color: isSelected ? Colors.primary : Colors.textPrimary },
                ]}
              >
                {opt.label}
              </Text>
              <Text
                style={[
                  styles.sizePreview,
                  { fontSize: opt.fontSize, color: Colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                Aria is here to help you.
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  sizeCard: {
    width: '100%',
    height: 80,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 10,
  },
  sizeCardDefault: {
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  sizeCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryMuted,
  },
  bigA: {
    fontWeight: '700',
    width: 32,
    textAlign: 'center',
    flexShrink: 0,
  },
  sizeCardText: {
    flex: 1,
    gap: 2,
  },
  sizeLabel: {
    fontWeight: '600',
  },
  sizePreview: {
    lineHeight: undefined,
  },
});
