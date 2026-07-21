import 'react-native-gesture-handler';
import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { OnboardingNavigator } from './src/features/onboarding/navigation/OnboardingNavigator';
import { SettingsProvider, useSettings } from './src/context/SettingsContext';
import { Colors } from './src/theme/colors';

function RootNavigator() {
  const { isHydrated, hasCompletedOnboarding } = useSettings();

  if (!isHydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!hasCompletedOnboarding) {
    return <OnboardingNavigator />;
  }

  return <AppNavigator />;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SettingsProvider>
          <RootNavigator />
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
