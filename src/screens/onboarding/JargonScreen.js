import React, { useState } from 'react';
import { OnboardingLayout } from '../../components/onboarding/OnboardingLayout';
import { OptionCard } from '../../components/onboarding/OptionCard';
import { useSettings } from '../../context/SettingsContext';

const OPTIONS = [
  {
    value: 'explain',
    label: 'Explain the word straight away',
    description: 'e.g. "lewy body dementia (a type of dementia that affects movement and memory)"',
  },
  {
    value: 'avoid',
    label: 'Use plain words only',
    description: 'Avoid medical language altogether',
  },
  {
    value: 'ok',
    label: "I'm fine with medical language",
    description: '',
  },
];

export function JargonScreen({ navigation, route }) {
  const { updateSetting, jargonMode } = useSettings();
  const [selected, setSelected] = useState(jargonMode);

  const handleNext = () => {
    updateSetting('jargonMode', selected);
    if (route.params?.returnToSummary) {
      navigation.navigate('Summary');
    } else {
      navigation.navigate('Communication');
    }
  };

  const handleSkip = () => {
    navigation.navigate('Communication');
  };

  return (
    <OnboardingLayout
      step={5}
      totalSteps={9}
      onBack={() => navigation.goBack()}
      onSkip={handleSkip}
      onNext={handleNext}
      nextLabel="Next"
      title={"When medical words\ncome up, what would\nyou prefer?"}
    >
      {OPTIONS.map((opt) => (
        <OptionCard
          key={opt.value}
          label={opt.label}
          description={opt.description || undefined}
          selected={selected === opt.value}
          onPress={() => setSelected(opt.value)}
        />
      ))}
    </OnboardingLayout>
  );
}
