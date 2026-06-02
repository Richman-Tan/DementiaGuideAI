import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';

import { WelcomeScreen } from './WelcomeScreen';
import { SetupTypeScreen } from './SetupTypeScreen';
import { SupportLevelScreen } from './SupportLevelScreen';
import { AriaStyleScreen } from './AriaStyleScreen';
import { ResponseStyleScreen } from './ResponseStyleScreen';
import { JargonScreen } from './JargonScreen';
import { CommunicationScreen } from './CommunicationScreen';
import { VoiceSpeedScreen } from './VoiceSpeedScreen';
import { TextSizeScreen } from './TextSizeScreen';
import { DisplayPrefsScreen } from './DisplayPrefsScreen';
import { SafetyScreen } from './SafetyScreen';
import { SummaryScreen } from './SummaryScreen';

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
