import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { OnboardingLayout } from '../../components/onboarding/OnboardingLayout';
import { Colors } from '../../constants/colors';
import { useSettings } from '../../context/SettingsContext';

export function SafetyScreen({ navigation }) {
  const { textScale } = useSettings();

  const handleNext = () => {
    navigation.navigate('Summary');
  };

  return (
    <OnboardingLayout
      onBack={() => navigation.goBack()}
      onNext={handleNext}
      nextLabel="I understand — let's go"
      title={"One important thing\nto know"}
    >
      <View style={styles.card}>
        <MaterialCommunityIcons
          name="information-outline"
          size={32}
          color={Colors.info ?? Colors.primary}
        />
        <Text style={[styles.bodyText, { fontSize: 17 * textScale }]}>
          {'Aria is here to help you find information — but she is not a doctor or medical professional.\n\nIf you or someone you care for is unwell, please contact your GP or a health professional.\n\nFor urgent help in Australia, call 000.'}
        </Text>
      </View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.infoMuted ?? Colors.primaryMuted,
    borderRadius: 16,
    padding: 20,
    marginTop: 8,
    alignItems: 'flex-start',
  },
  bodyText: {
    color: Colors.textPrimary,
    lineHeight: 27,
    marginTop: 12,
  },
});
