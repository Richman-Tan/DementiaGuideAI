import React, { useState } from 'react';
import { OnboardingLayout } from '@/features/onboarding/components/OnboardingLayout';
import { OptionCard } from '@/features/onboarding/components/OptionCard';
import { useSettings } from '@/context/SettingsContext';

const OPTIONS = [
  {
    value: 0.82,
    label: 'Slower',
    description: 'Give me time to take it in',
  },
  {
    value: 1.0,
    label: 'Normal speed',
    description: '',
  },
  {
    value: 1.15,
    label: 'A little faster',
    description: '',
  },
];

export function VoiceSpeedScreen({ navigation, route }) {
  const { updateSetting, speechRate } = useSettings();
  const [selected, setSelected] = useState(speechRate);

  const handleNext = () => {
    updateSetting('speechRate', selected);
    if (route.params?.returnToSummary) {
      navigation.navigate('Summary');
    } else {
      navigation.navigate('TextSize');
    }
  };

  const handleSkip = () => {
    navigation.navigate('TextSize');
  };

  return (
    <OnboardingLayout
      step={7}
      totalSteps={9}
      onBack={() => navigation.goBack()}
      onSkip={handleSkip}
      onNext={handleNext}
      nextLabel="Next"
      title={"How fast would you like\nAria to speak?"}
      subtitle="You can change this in Settings at any time."
    >
      {OPTIONS.map((opt) => (
        <OptionCard
          key={String(opt.value)}
          label={opt.label}
          description={opt.description || undefined}
          selected={selected === opt.value}
          onPress={() => setSelected(opt.value)}
        />
      ))}
    </OnboardingLayout>
  );
}
