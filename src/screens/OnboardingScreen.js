import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { useSettings } from '../context/SettingsContext';

const ROLES = [
  {
    id: 'family',
    label: 'Family caregiver',
    description: 'I care for a family member or friend with dementia at home.',
    icon: 'home-heart',
    color: '#E8956D',
  },
  {
    id: 'professional',
    label: 'Professional caregiver',
    description: 'I work in a care facility or provide professional support.',
    icon: 'briefcase-medical',
    color: '#4A7C8E',
  },
  {
    id: 'student',
    label: 'Healthcare student',
    description: 'I am studying healthcare, nursing, or a related field.',
    icon: 'school',
    color: '#7FB5A0',
  },
  {
    id: 'other',
    label: 'Other',
    description: 'I am looking for dementia information for another reason.',
    icon: 'account',
    color: '#9B8DC4',
  },
];

export const OnboardingScreen = () => {
  const { updateSetting, textScale } = useSettings();
  const [selected, setSelected] = useState(null);

  const handleSelect = (roleId) => {
    setSelected(roleId);
    // Small delay so the selection highlight is visible before the screen swaps.
    setTimeout(() => updateSetting('userRole', roleId), 250);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <MaterialCommunityIcons name="robot-excited" size={36} color="#fff" />
          </View>
          <Text style={[styles.appName, { fontSize: 26 * textScale }]}>
            DementiaGuide AI
          </Text>
          <Text style={[styles.tagline, { fontSize: 15 * textScale }]}>
            Your trusted dementia care assistant
          </Text>
        </View>

        {/* Role picker */}
        <View style={styles.body}>
          <Text style={[styles.prompt, { fontSize: 22 * textScale }]}>
            I am a…
          </Text>
          <Text style={[styles.sub, { fontSize: 14 * textScale }]}>
            Your role helps Aria personalise her guidance for you.
          </Text>

          <View style={styles.cards}>
            {ROLES.map(role => {
              const isActive = selected === role.id;
              return (
                <TouchableOpacity
                  key={role.id}
                  style={[
                    styles.card,
                    isActive && { borderColor: role.color, backgroundColor: `${role.color}12` },
                  ]}
                  onPress={() => handleSelect(role.id)}
                  accessibilityLabel={role.label}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isActive }}
                  activeOpacity={0.75}
                >
                  <View style={[styles.iconCircle, { backgroundColor: `${role.color}20` }]}>
                    <MaterialCommunityIcons name={role.icon} size={24} color={role.color} />
                  </View>
                  <View style={styles.cardText}>
                    <Text style={[styles.cardLabel, { fontSize: 16 * textScale, color: isActive ? role.color : '#1A1A1A' }]}>
                      {role.label}
                    </Text>
                    <Text style={[styles.cardDesc, { fontSize: 13 * textScale }]}>
                      {role.description}
                    </Text>
                  </View>
                  {isActive && (
                    <MaterialCommunityIcons name="check-circle" size={20} color={role.color} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Footer note */}
        <Text style={[styles.footer, { fontSize: 12 * textScale }]}>
          You can change this at any time in Settings.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 32,
    paddingHorizontal: 24,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  appName: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1A1A1A',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 15,
    color: '#8E8E93',
    marginTop: 6,
    textAlign: 'center',
  },
  body: {
    paddingHorizontal: 20,
  },
  prompt: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  sub: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 20,
    lineHeight: 20,
  },
  cards: {
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
    padding: 16,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardText: {
    flex: 1,
    gap: 3,
  },
  cardLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  cardDesc: {
    fontSize: 13,
    color: '#8E8E93',
    lineHeight: 18,
  },
  footer: {
    textAlign: 'center',
    color: '#C7C7CC',
    fontSize: 12,
    marginTop: 28,
    paddingHorizontal: 24,
  },
});
