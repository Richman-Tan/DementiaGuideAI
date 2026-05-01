import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  Animated,
  StatusBar,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/colors';
import { Typography, FontSize } from '../constants/typography';
import { openaiService } from '../services/openaiService';

const Section = ({ title, children }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={styles.sectionCard}>{children}</View>
  </View>
);

const SettingRow = ({ icon, iconColor = Colors.primary, label, sublabel, onPress, right, isLast = false }) => (
  <TouchableOpacity
    style={[styles.settingRow, !isLast && styles.settingRowBorder]}
    onPress={onPress}
    disabled={!onPress && !right}
    activeOpacity={onPress ? 0.7 : 1}
    accessibilityLabel={label}
    accessibilityRole={onPress ? 'button' : 'none'}
  >
    <View style={[styles.settingIcon, { backgroundColor: `${iconColor}18` }]}>
      <MaterialCommunityIcons name={icon} size={20} color={iconColor} />
    </View>
    <View style={styles.settingText}>
      <Text style={styles.settingLabel}>{label}</Text>
      {sublabel && <Text style={styles.settingSublabel}>{sublabel}</Text>}
    </View>
    {right ?? (onPress && (
      <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textTertiary} />
    ))}
  </TouchableOpacity>
);

const ToggleRow = ({ icon, iconColor, label, sublabel, value, onToggle, isLast }) => (
  <SettingRow
    icon={icon}
    iconColor={iconColor}
    label={label}
    sublabel={sublabel}
    isLast={isLast}
    right={
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: Colors.border, true: Colors.primary }}
        thumbColor={Colors.surface}
        ios_backgroundColor={Colors.border}
        accessibilityLabel={`Toggle ${label}`}
      />
    }
  />
);

const TextSizeSelector = ({ value, onChange }) => {
  const sizes = [
    { id: 'small', label: 'A', size: 13 },
    { id: 'medium', label: 'A', size: 16 },
    { id: 'large', label: 'A', size: 20 },
  ];
  return (
    <View style={styles.textSizeRow}>
      {sizes.map(s => (
        <TouchableOpacity
          key={s.id}
          style={[styles.sizeChip, value === s.id && styles.sizeChipActive]}
          onPress={() => onChange(s.id)}
          accessibilityLabel={`Text size ${s.id}`}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === s.id }}
        >
          <Text
            style={[
              styles.sizeChipText,
              { fontSize: s.size },
              value === s.id && styles.sizeChipTextActive,
            ]}
          >
            {s.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

// ─── API Key Row ──────────────────────────────────────────────────────────────
const ApiKeyRow = ({ value, onSave, onClear }) => {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const [hidden, setHidden] = useState(true);

  const displayValue = value ? `sk-...${value.slice(-4)}` : 'Not configured';

  if (editing) {
    return (
      <View style={styles.apiKeyEditRow}>
        <View style={[styles.settingIcon, { backgroundColor: `${Colors.primary}18` }]}>
          <MaterialCommunityIcons name="key-variant" size={20} color={Colors.primary} />
        </View>
        <TextInput
          style={styles.apiKeyInput}
          value={input}
          onChangeText={setInput}
          placeholder="sk-proj-..."
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={hidden}
          placeholderTextColor={Colors.textTertiary}
          accessibilityLabel="OpenAI API key input"
        />
        <TouchableOpacity onPress={() => setHidden(h => !h)} style={styles.eyeBtn}>
          <MaterialCommunityIcons
            name={hidden ? 'eye-outline' : 'eye-off-outline'}
            size={20} color={Colors.textTertiary}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveKeyBtn, input.length < 20 && styles.saveKeyBtnDisabled]}
          onPress={() => {
            if (input.length >= 20) {
              onSave(input);
              setEditing(false);
              setInput('');
            }
          }}
        >
          <Text style={styles.saveKeyText}>Save</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setEditing(false); setInput(''); }}>
          <Text style={styles.cancelKeyText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SettingRow
      icon="key-variant"
      iconColor={value ? Colors.success : Colors.warning}
      label="OpenAI API Key"
      sublabel={displayValue}
      onPress={() => setEditing(true)}
      isLast={false}
    />
  );
};

export const ProfileScreen = ({ navigation }) => {
  const [settings, setSettings] = useState({
    textSize: 'medium',
    contrast: 'standard',
    audioEnabled: true,
    subtitlesEnabled: true,
    avatarEnabled: true,
    hapticFeedback: true,
    autoPlayResponses: false,
    notificationsEnabled: true,
    darkMode: false,
  });
  const [apiKey, setApiKey] = useState(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
    openaiService.getApiKey().then(k => setApiKey(k));
  }, []);

  const toggleSetting = (key) => setSettings(prev => ({ ...prev, [key]: !prev[key] }));

  const handleSaveApiKey = async (key) => {
    await openaiService.saveApiKey(key);
    setApiKey(key);
    openaiService.initKnowledgeBase().catch(() => {});
    Alert.alert(
      'API Key Saved',
      'Aria will now use your OpenAI key. The knowledge base will load in the background the next time you open the chat.'
    );
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear AI Cache',
      'This forces the knowledge base to re-download on next use. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear', style: 'destructive',
          onPress: async () => {
            await openaiService.clearCache();
            Alert.alert('Cache cleared', 'Knowledge base will reload on next chat session.');
          },
        },
      ]
    );
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear Conversation History',
      'This will remove all your conversation history. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear', style: 'destructive', onPress: async () => {
            await AsyncStorage.removeItem('chat_messages_v1');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
          <Text style={styles.headerTitle}>Settings</Text>
          <Text style={styles.headerSub}>Personalise your DementiaGuide AI experience</Text>
        </Animated.View>

        {/* Profile card */}
        <Animated.View style={[styles.profileCardWrapper, { opacity: fadeAnim }]}>
          <LinearGradient
            colors={[Colors.primary, Colors.primaryLight, Colors.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.profileCard}
          >
            <View style={styles.profileAvatar}>
              <MaterialCommunityIcons name="account" size={32} color={Colors.primary} />
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>Caregiver</Text>
              <Text style={styles.profileRole}>Family Member</Text>
            </View>
            <TouchableOpacity style={styles.editProfileButton} accessibilityLabel="Edit profile">
              <MaterialCommunityIcons name="pencil-outline" size={18} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>

        {/* Accessibility */}
        <Animated.View style={{ opacity: fadeAnim }}>
          <Section title="Accessibility">
            <View style={[styles.settingRow, styles.settingRowBorder]}>
              <View style={[styles.settingIcon, { backgroundColor: `${Colors.primary}18` }]}>
                <MaterialCommunityIcons name="format-size" size={20} color={Colors.primary} />
              </View>
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Text Size</Text>
                <Text style={styles.settingSublabel}>Adjust text size across the app</Text>
              </View>
              <TextSizeSelector
                value={settings.textSize}
                onChange={val => setSettings(prev => ({ ...prev, textSize: val }))}
              />
            </View>

            <ToggleRow
              icon="contrast-circle"
              iconColor={Colors.textSecondary}
              label="High Contrast"
              sublabel="Increase colour contrast for readability"
              value={settings.contrast === 'high'}
              onToggle={() =>
                setSettings(prev => ({
                  ...prev,
                  contrast: prev.contrast === 'high' ? 'standard' : 'high',
                }))
              }
              isLast={false}
            />

            <ToggleRow
              icon="vibrate"
              iconColor={Colors.secondary}
              label="Haptic Feedback"
              sublabel="Vibration on interactions"
              value={settings.hapticFeedback}
              onToggle={() => toggleSetting('hapticFeedback')}
              isLast={false}
            />

            <ToggleRow
              icon="weather-night"
              iconColor={Colors.textSecondary}
              label="Dark Mode"
              sublabel="Easier on the eyes in low light"
              value={settings.darkMode}
              onToggle={() => toggleSetting('darkMode')}
              isLast
            />
          </Section>

          {/* Avatar & Audio */}
          <Section title="Avatar & Audio">
            <ToggleRow
              icon="robot-excited"
              iconColor={Colors.primary}
              label="Show Avatar"
              sublabel="Display Aria's visual avatar interface"
              value={settings.avatarEnabled}
              onToggle={() => toggleSetting('avatarEnabled')}
              isLast={false}
            />

            <ToggleRow
              icon="volume-high"
              iconColor={Colors.accent}
              label="Audio Responses"
              sublabel="Aria speaks responses aloud"
              value={settings.audioEnabled}
              onToggle={() => toggleSetting('audioEnabled')}
              isLast={false}
            />

            <ToggleRow
              icon="subtitles-outline"
              iconColor={Colors.info}
              label="Subtitles"
              sublabel="Show captions during voice responses"
              value={settings.subtitlesEnabled}
              onToggle={() => toggleSetting('subtitlesEnabled')}
              isLast={false}
            />

            <ToggleRow
              icon="play-circle-outline"
              iconColor={Colors.secondary}
              label="Auto-play Responses"
              sublabel="Automatically play audio when Aria responds"
              value={settings.autoPlayResponses}
              onToggle={() => toggleSetting('autoPlayResponses')}
              isLast
            />
          </Section>

          {/* Privacy */}
          <Section title="Privacy & Trust">
            <SettingRow
              icon="shield-check-outline"
              iconColor={Colors.success}
              label="Privacy Policy"
              sublabel="How we handle your data"
              onPress={() => {}}
              isLast={false}
            />
            <SettingRow
              icon="lock-outline"
              iconColor={Colors.primary}
              label="Data Security"
              sublabel="End-to-end encrypted conversations"
              isLast={false}
            />
            <SettingRow
              icon="information-outline"
              iconColor={Colors.info}
              label="Medical Disclaimer"
              sublabel="Information is not a substitute for professional advice"
              onPress={() => {}}
              isLast={false}
            />
            <SettingRow
              icon="delete-outline"
              iconColor={Colors.error}
              label="Clear Conversation History"
              sublabel="Remove all saved conversations"
              onPress={handleClearData}
              isLast
            />
          </Section>

          {/* AI Configuration */}
          <Section title="AI Configuration">
            <ApiKeyRow
              value={apiKey}
              onSave={handleSaveApiKey}
              onClear={async () => {
                await openaiService.clearApiKey();
                setApiKey(null);
              }}
            />
            <SettingRow
              icon="database-remove-outline"
              iconColor={Colors.error}
              label="Clear AI Cache"
              sublabel="Forces re-embedding of knowledge base on next use"
              onPress={handleClearCache}
              isLast
            />
          </Section>

          {/* About */}
          <Section title="About">
            <SettingRow
              icon="information-outline"
              iconColor={Colors.textSecondary}
              label="Version"
              sublabel="DementiaGuide AI v1.0.0"
              isLast={false}
            />
            <SettingRow
              icon="robot-outline"
              iconColor={Colors.textSecondary}
              label="Powered by OpenAI"
              sublabel="GPT-4o-mini with RAG knowledge retrieval"
              isLast={false}
            />
            <SettingRow
              icon="star-outline"
              iconColor={Colors.warning}
              label="Rate the App"
              sublabel="Help us improve with your feedback"
              onPress={() => {}}
              isLast={false}
            />
            <SettingRow
              icon="help-circle-outline"
              iconColor={Colors.primary}
              label="Help & Support"
              sublabel="Get help using DementiaGuide AI"
              onPress={() => {}}
              isLast
            />
          </Section>
        </Animated.View>

        {/* Trust footer */}
        <Animated.View style={[styles.trustFooter, { opacity: fadeAnim }]}>
          <View style={styles.trustItem}>
            <MaterialCommunityIcons name="shield-check" size={16} color={Colors.success} />
            <Text style={styles.trustText}>HIPAA-aligned design</Text>
          </View>
          <View style={styles.trustItem}>
            <MaterialCommunityIcons name="book-open-outline" size={16} color={Colors.primary} />
            <Text style={styles.trustText}>Evidence-based content</Text>
          </View>
          <View style={styles.trustItem}>
            <MaterialCommunityIcons name="lock" size={16} color={Colors.textSecondary} />
            <Text style={styles.trustText}>Private by design</Text>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    ...Typography.headlineLarge,
    color: Colors.textPrimary,
  },
  headerSub: {
    ...Typography.bodySmall,
    color: Colors.textTertiary,
    marginTop: 3,
  },
  profileCardWrapper: {
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 14,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    flex: 1,
    gap: 3,
  },
  profileName: {
    ...Typography.titleLarge,
    color: Colors.textInverse,
  },
  profileRole: {
    ...Typography.bodySmall,
    color: 'rgba(255,255,255,0.8)',
  },
  editProfileButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    ...Typography.labelSmall,
    color: Colors.textTertiary,
    marginBottom: 8,
    marginLeft: 4,
    fontSize: 12,
  },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  settingRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  settingIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  settingText: {
    flex: 1,
    gap: 2,
  },
  settingLabel: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  settingSublabel: {
    ...Typography.bodySmall,
    color: Colors.textTertiary,
    fontSize: 12,
  },
  textSizeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  sizeChip: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  sizeChipActive: {
    backgroundColor: Colors.primaryMuted,
    borderColor: Colors.primary,
  },
  sizeChipText: {
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  sizeChipTextActive: {
    color: Colors.primary,
  },
  apiKeyEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  apiKeyInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: Colors.background,
  },
  eyeBtn: {
    padding: 4,
  },
  saveKeyBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  saveKeyBtnDisabled: {
    backgroundColor: Colors.border,
  },
  saveKeyText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  cancelKeyText: {
    color: Colors.primary,
    fontWeight: '500',
    fontSize: 14,
  },
  trustFooter: {
    marginHorizontal: 20,
    marginTop: 28,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    flexWrap: 'wrap',
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  trustText: {
    ...Typography.bodySmall,
    color: Colors.textTertiary,
    fontSize: 12,
  },
});
