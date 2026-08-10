import 'react-native-gesture-handler';
import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { OnboardingNavigator } from './src/features/onboarding/navigation/OnboardingNavigator';
import { AuthNavigator } from './src/features/auth/navigation/AuthNavigator';
import { SettingsProvider, useSettings } from './src/context/SettingsContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { Colors } from './src/theme/colors';

function RootNavigator() {
  const { isHydrated, hasCompletedOnboarding } = useSettings();
  const { isHydrated: isAuthHydrated, session } = useAuth();

  if (!isHydrated || !isAuthHydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!hasCompletedOnboarding) {
    return <OnboardingNavigator />;
  }

  // Onboarding (local preferences only) always comes first, then account
  // sign-in gates the rest of the app. Chat history/settings stay local —
  // the account exists for identity + usage metering, not data sync.
  if (!session) {
    return <AuthNavigator />;
  }

  return <AppNavigator />;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SettingsProvider>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
