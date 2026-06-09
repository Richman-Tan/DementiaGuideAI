import React from 'react';
import { View, StyleSheet } from 'react-native';
import { OnboardingLayout } from '../../components/onboarding/OnboardingLayout';
import { SummaryRow } from '../../components/onboarding/SummaryRow';
import { useSettings } from '../../context/SettingsContext';

export function SummaryScreen({ navigation }) {
  const {
    updateSetting,
    isCaregiversSetup,
    supportLevel,
    ariaPersonality,
    responseStyle,
    jargonMode,
    communicationMode,
    speechRate,
    textSize,
    highContrast,
    darkMode,
    reducedMotion,
  } = useSettings();

  const setupLabel = isCaregiversSetup ? 'For someone else' : 'For myself';

  const supportLabel = {
    comfortable: 'Fairly comfortable',
    'some-help': 'Sometimes need help',
    clear: 'Prefer clear steps',
    guided: 'Guide me step by step',
  }[supportLevel] ?? supportLevel;

  const personalityLabel = {
    warm: 'Warm and caring',
    calm: 'Calm and reassuring',
    friendly: 'Bright and encouraging',
    practical: 'Practical',
  }[ariaPersonality] ?? ariaPersonality;

  const responseLabel = {
    brief: 'Short and simple',
    balanced: 'A bit of detail',
    detailed: 'Full answers',
    'step-by-step': 'Step-by-step',
  }[responseStyle] ?? responseStyle;

  const jargonLabel = {
    explain: 'Explain medical words',
    avoid: 'Plain words only',
    ok: 'Medical language is fine',
  }[jargonMode] ?? jargonMode;

  const commLabel = {
    voice: 'Voice',
    text: 'Text',
    both: 'Voice and text',
  }[communicationMode] ?? communicationMode;

  const speedLabel =
    speechRate < 1 ? 'Slower' : speechRate > 1 ? 'A little faster' : 'Normal';

  const textLabel = {
    small: 'Smaller',
    medium: 'Normal',
    large: 'Larger',
    xlarge: 'Largest',
  }[textSize] ?? textSize;

  const handleComplete = () => {
    updateSetting('hasCompletedOnboarding', true);
  };

  return (
    <OnboardingLayout
      onBack={() => navigation.goBack()}
      onNext={handleComplete}
      nextLabel="All done — show me the app"
      title={"Here's how you've\nset things up"}
      subtitle="Tap Change to adjust anything."
    >
      <View style={styles.rows}>
        <SummaryRow
          label="Setup"
          value={setupLabel}
          onEdit={() => navigation.navigate('SetupType', { returnToSummary: true })}
        />
        <SummaryRow
          label="Guidance level"
          value={supportLabel}
          onEdit={() => navigation.navigate('SupportLevel', { returnToSummary: true })}
        />
        <SummaryRow
          label="Helper style"
          value={personalityLabel}
          onEdit={() => navigation.navigate('AriaStyle', { returnToSummary: true })}
        />
        <SummaryRow
          label="Answer length"
          value={responseLabel}
          onEdit={() => navigation.navigate('ResponseStyle', { returnToSummary: true })}
        />
        <SummaryRow
          label="Medical words"
          value={jargonLabel}
          onEdit={() => navigation.navigate('Jargon', { returnToSummary: true })}
        />
        <SummaryRow
          label="Communication"
          value={commLabel}
          onEdit={() => navigation.navigate('Communication', { returnToSummary: true })}
        />
        {communicationMode !== 'text' && (
          <SummaryRow
            label="Voice speed"
            value={speedLabel}
            onEdit={() => navigation.navigate('VoiceSpeed', { returnToSummary: true })}
          />
        )}
        <SummaryRow
          label="Text size"
          value={textLabel}
          onEdit={() => navigation.navigate('TextSize', { returnToSummary: true })}
        />
        <SummaryRow
          label="High contrast"
          value={highContrast ? 'On' : 'Off'}
          onEdit={() => navigation.navigate('DisplayPrefs', { returnToSummary: true })}
        />
      </View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  rows: {
    marginTop: 8,
  },
});
