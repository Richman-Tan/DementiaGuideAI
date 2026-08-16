import React, { useState } from 'react';
import { OnboardingLayout } from '@/features/onboarding/components/OnboardingLayout';
import { OptionCard } from '@/features/onboarding/components/OptionCard';
import { useSettings } from '@/context/SettingsContext';

const OPTIONS = [
  {
    value: 'brief',
    label: 'Short and simple',
    description: 'Just the key point — one or two sentences',
  },
  {
    value: 'balanced',
    label: 'A bit of detail',
    description: 'A short explanation with the main facts (Recommended)',
  },
  {
    value: 'detailed',
    label: 'Full answers',
    description: 'I want to know everything',
  },
  {
    value: 'step-by-step',
    label: 'Step-by-step',
    description: 'Break it into numbered steps',
  },
];

export function ResponseStyleScreen({ navigation, route }) {
  const { updateSetting, responseStyle } = useSettings();
  const [selected, setSelected] = useState(responseStyle);

  const handleNext = () => {
    updateSetting('responseStyle', selected);
    updateSetting('conciseMode', selected === 'brief');
    if (route.params?.returnToSummary) {
      navigation.navigate('Summary');
    } else {
      navigation.navigate('Jargon');
    }
  };

  const handleSkip = () => {
    navigation.navigate('Jargon');
  };

  return (
    <OnboardingLayout
      step={4}
      totalSteps={9}
      onBack={() => navigation.goBack()}
      onSkip={handleSkip}
      onNext={handleNext}
      nextLabel="Next"
      title={"When you ask a question,\nhow much detail would\nyou like?"}
    >
      {OPTIONS.map((opt) => (
        <OptionCard
          key={opt.value}
          label={opt.label}
          description={opt.description}
          selected={selected === opt.value}
          onPress={() => setSelected(opt.value)}
        />
      ))}
    </OnboardingLayout>
  );
}
