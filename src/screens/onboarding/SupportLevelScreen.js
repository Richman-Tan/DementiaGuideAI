import React, { useState } from 'react';
import { OnboardingLayout } from '../../components/onboarding/OnboardingLayout';
import { OptionCard } from '../../components/onboarding/OptionCard';
import { useSettings } from '../../context/SettingsContext';

const OPTIONS = [
  {
    value: 'comfortable',
    label: 'Fairly comfortable',
    description: 'Just get me started',
  },
  {
    value: 'some-help',
    label: 'Okay, sometimes I need\na little help',
    description: '',
  },
  {
    value: 'clear',
    label: 'I prefer simple,\nclear steps',
    description: '',
  },
  {
    value: 'guided',
    label: 'Please guide me\none step at a time',
    description: '',
  },
];

export function SupportLevelScreen({ navigation, route }) {
  const { updateSetting, supportLevel } = useSettings();
  const [selected, setSelected] = useState(supportLevel);

  const handleNext = () => {
    updateSetting('supportLevel', selected);
    if (route.params?.returnToSummary) {
      navigation.navigate('Summary');
    } else {
      navigation.navigate('AriaStyle');
    }
  };

  const handleSkip = () => {
    navigation.navigate('AriaStyle');
  };

  return (
    <OnboardingLayout
      step={2}
      totalSteps={9}
      onBack={() => navigation.goBack()}
      onSkip={handleSkip}
      onNext={handleNext}
      nextLabel="Next"
      title={"How comfortable are you with\nusing apps like this?"}
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
