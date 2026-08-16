import React, { useState } from 'react';
import { OnboardingLayout } from '@/features/onboarding/components/OnboardingLayout';
import { OptionCard } from '@/features/onboarding/components/OptionCard';
import { useSettings } from '@/context/SettingsContext';

const OPTIONS = [
  {
    value: 'warm',
    label: 'Warm and caring',
    description: 'Friendly, gentle, emotionally supportive',
    icon: 'heart-outline',
  },
  {
    value: 'calm',
    label: 'Calm and reassuring',
    description: 'Clear, steady, never rushed',
    icon: 'cloud-outline',
  },
  {
    value: 'friendly',
    label: 'Bright and encouraging',
    description: 'Upbeat, kind, like a helpful friend',
    icon: 'emoticon-happy-outline',
  },
  {
    value: 'practical',
    label: 'Practical and straightforward',
    description: 'Direct answers, no fuss',
    icon: 'clipboard-list-outline',
  },
];

export function AriaStyleScreen({ navigation, route }) {
  const { updateSetting, ariaPersonality } = useSettings();
  const [selected, setSelected] = useState(ariaPersonality);

  const handleNext = () => {
    updateSetting('ariaPersonality', selected);
    if (route.params?.returnToSummary) {
      navigation.navigate('Summary');
    } else {
      navigation.navigate('ResponseStyle');
    }
  };

  const handleSkip = () => {
    navigation.navigate('ResponseStyle');
  };

  return (
    <OnboardingLayout
      step={3}
      totalSteps={9}
      onBack={() => navigation.goBack()}
      onSkip={handleSkip}
      onNext={handleNext}
      nextLabel="Next"
      title={"What kind of helper\nfeels right for you?"}
      subtitle="You can always change this later."
    >
      {OPTIONS.map((opt) => (
        <OptionCard
          key={opt.value}
          label={opt.label}
          description={opt.description}
          icon={opt.icon}
          selected={selected === opt.value}
          onPress={() => setSelected(opt.value)}
        />
      ))}
    </OnboardingLayout>
  );
}
