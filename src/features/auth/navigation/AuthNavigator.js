import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';

import { SignInScreen } from '@/features/auth/screens/SignInScreen';
import { SignUpScreen } from '@/features/auth/screens/SignUpScreen';

const Stack = createNativeStackNavigator();

export function AuthNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="SignIn" component={SignInScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
