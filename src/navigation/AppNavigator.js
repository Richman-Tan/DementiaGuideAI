import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { HomeScreen } from '../screens/HomeScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { VoiceScreen } from '../screens/VoiceScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { ArticleDetailScreen } from '../screens/ArticleDetailScreen';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TabIcon = ({ name, label, focused, color }) => (
  <View style={tabStyles.iconWrapper}>
    <MaterialCommunityIcons name={name} size={24} color={color} />
    <Text style={[tabStyles.label, { color }]}>{label}</Text>
    {focused && <View style={[tabStyles.activeDot, { backgroundColor: color }]} />}
  </View>
);

const MainTabs = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarStyle: tabStyles.tabBar,
      tabBarShowLabel: false,
      tabBarActiveTintColor: Colors.primary,
      tabBarInactiveTintColor: Colors.tabInactive,
    }}
  >
    <Tab.Screen
      name="Home"
      component={HomeScreen}
      options={{
        tabBarIcon: ({ focused, color }) => (
          <TabIcon name={focused ? 'home' : 'home-outline'} label="Home" focused={focused} color={color} />
        ),
        tabBarAccessibilityLabel: 'Home',
      }}
    />
    <Tab.Screen
      name="Chat"
      component={ChatScreen}
      options={{
        tabBarIcon: ({ focused, color }) => (
          <TabIcon name={focused ? 'chat' : 'chat-outline'} label="Chat" focused={focused} color={color} />
        ),
        tabBarAccessibilityLabel: 'Chat with Aria',
      }}
    />
    <Tab.Screen
      name="Voice"
      component={VoiceScreen}
      options={{
        tabBarIcon: ({ focused, color }) => (
          <View style={tabStyles.voiceTabWrapper}>
            <View style={tabStyles.voiceCenterButton}>
              <MaterialCommunityIcons name="microphone" size={26} color={Colors.textInverse} />
            </View>
          </View>
        ),
        tabBarAccessibilityLabel: 'Voice interaction',
      }}
    />
    <Tab.Screen
      name="Library"
      component={LibraryScreen}
      options={{
        tabBarIcon: ({ focused, color }) => (
          <TabIcon name={focused ? 'library' : 'library-outline'} label="Library" focused={focused} color={color} />
        ),
        tabBarAccessibilityLabel: 'Knowledge library',
      }}
    />
    <Tab.Screen
      name="Profile"
      component={ProfileScreen}
      options={{
        tabBarIcon: ({ focused, color }) => (
          <TabIcon name={focused ? 'tune-variant' : 'tune-variant'} label="Settings" focused={focused} color={color} />
        ),
        tabBarAccessibilityLabel: 'Settings',
      }}
    />
  </Tab.Navigator>
);

export const AppNavigator = () => (
  <NavigationContainer>
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen
        name="ArticleDetail"
        component={ArticleDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  </NavigationContainer>
);

const tabStyles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.tabBackground,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    height: Platform.OS === 'ios' ? 84 : 64,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    paddingTop: 8,
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 12,
  },
  iconWrapper: {
    alignItems: 'center',
    gap: 3,
    paddingBottom: 2,
    minWidth: 52,
  },
  label: {
    ...Typography.labelSmall,
    fontSize: 10,
    textTransform: 'none',
    letterSpacing: 0,
    fontWeight: '500',
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 1,
  },
  voiceTabWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
  },
  voiceCenterButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -20,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
});
