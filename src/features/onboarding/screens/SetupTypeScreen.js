import React, { useState } from 'react';
import { OnboardingLayout } from '@/features/onboarding/components/OnboardingLayout';
import { OptionCard } from '@/features/onboarding/components/OptionCard';
import { useSettings } from '@/context/SettingsContext';

const OPTIONS = [
  {
    value: 'self',
    label: "I'm setting this up for myself",
    icon: 'account-outline',
  },
  {
    value: 'family',
    label: "I'm helping a family member\nor friend",
    icon: 'account-heart-outline',
  },
  {
    value: 'carer',
    label: "I'm a carer or support worker",
    icon: 'hand-heart-outline',
  },
];

export function SetupTypeScreen({ navigation, route }) {
  const { updateSetting, isCaregiversSetup } = useSettings();
  const [selected, setSelected] = useState(isCaregiversSetup ? 'family' : 'self');

  const handleNext = () => {
    updateSetting('isCaregiversSetup', selected !== 'self');
    if (route.params?.returnToSummary) {
      navigation.navigate('Summary');
    } else {
      navigation.navigate('SupportLevel');
    }
  };

  const handleSkip = () => {
    navigation.navigate('SupportLevel');
  };

  return (
    <OnboardingLayout
      step={1}
      totalSteps={9}
      onBack={() => navigation.goBack()}
      onSkip={handleSkip}
      onNext={handleNext}
      nextLabel="Next"
      title={"Who is setting up\nthis app today?"}
      subtitle="This helps Aria speak to you in the right way."
    >
      {OPTIONS.map((opt) => (
        <OptionCard
          key={opt.value}
          label={opt.label}
          icon={opt.icon}
          selected={selected === opt.value}
          onPress={() => setSelected(opt.value)}
        />
      ))}
    </OnboardingLayout>
  );
}
