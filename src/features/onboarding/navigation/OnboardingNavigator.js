import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';

import { WelcomeScreen } from '@/features/onboarding/screens/WelcomeScreen';
import { SetupTypeScreen } from '@/features/onboarding/screens/SetupTypeScreen';
import { SupportLevelScreen } from '@/features/onboarding/screens/SupportLevelScreen';
import { AriaStyleScreen } from '@/features/onboarding/screens/AriaStyleScreen';
import { ResponseStyleScreen } from '@/features/onboarding/screens/ResponseStyleScreen';
import { JargonScreen } from '@/features/onboarding/screens/JargonScreen';
import { CommunicationScreen } from '@/features/onboarding/screens/CommunicationScreen';
import { VoiceSpeedScreen } from '@/features/onboarding/screens/VoiceSpeedScreen';
import { TextSizeScreen } from '@/features/onboarding/screens/TextSizeScreen';
import { DisplayPrefsScreen } from '@/features/onboarding/screens/DisplayPrefsScreen';
import { SafetyScreen } from '@/features/onboarding/screens/SafetyScreen';
import { SummaryScreen } from '@/features/onboarding/screens/SummaryScreen';

const Stack = createNativeStackNavigator();

export function OnboardingNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="SetupType" component={SetupTypeScreen} />
        <Stack.Screen name="SupportLevel" component={SupportLevelScreen} />
        <Stack.Screen name="AriaStyle" component={AriaStyleScreen} />
        <Stack.Screen name="ResponseStyle" component={ResponseStyleScreen} />
        <Stack.Screen name="Jargon" component={JargonScreen} />
        <Stack.Screen name="Communication" component={CommunicationScreen} />
        <Stack.Screen name="VoiceSpeed" component={VoiceSpeedScreen} />
        <Stack.Screen name="TextSize" component={TextSizeScreen} />
        <Stack.Screen name="DisplayPrefs" component={DisplayPrefsScreen} />
        <Stack.Screen name="Safety" component={SafetyScreen} />
        <Stack.Screen name="Summary" component={SummaryScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
