import React, { useState } from 'react';
import { OnboardingLayout } from '../../components/onboarding/OnboardingLayout';
import { OptionCard } from '../../components/onboarding/OptionCard';
import { useSettings } from '../../context/SettingsContext';

const OPTIONS = [
  {
    value: 'voice',
    label: 'Speak to her using my voice',
    description: 'Hold a button and ask your question out loud',
    icon: 'microphone-outline',
  },
  {
    value: 'text',
    label: 'Type my questions',
    description: 'Use the keyboard to write your questions',
    icon: 'keyboard-outline',
  },
  {
    value: 'both',
    label: "Both — I'll choose each time",
    description: '',
    icon: 'tune-variant',
  },
];

export function CommunicationScreen({ navigation, route }) {
  const { updateSetting, communicationMode } = useSettings();
  const [selected, setSelected] = useState(communicationMode);

  const handleNext = () => {
    updateSetting('communicationMode', selected);
    if (route.params?.returnToSummary) {
      navigation.navigate('Summary');
    } else if (selected === 'text') {
      navigation.navigate('TextSize');
    } else {
      navigation.navigate('VoiceSpeed');
    }
  };

  const handleSkip = () => {
    navigation.navigate(selected === 'text' ? 'TextSize' : 'VoiceSpeed');
  };

  return (
    <OnboardingLayout
      step={6}
      totalSteps={9}
      onBack={() => navigation.goBack()}
      onSkip={handleSkip}
      onNext={handleNext}
      nextLabel="Next"
      title={"How would you like to\ntalk with Aria?"}
    >
      {OPTIONS.map((opt) => (
        <OptionCard
          key={opt.value}
          label={opt.label}
          description={opt.description || undefined}
          icon={opt.icon}
          selected={selected === opt.value}
          onPress={() => setSelected(opt.value)}
        />
      ))}
    </OnboardingLayout>
  );
}
