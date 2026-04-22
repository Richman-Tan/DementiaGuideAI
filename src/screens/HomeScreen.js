import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Animated,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Avatar } from '../components/Avatar';
import { Colors } from '../constants/colors';
import { Typography, FontSize } from '../constants/typography';
import { QUICK_QUESTIONS } from '../constants/data';

export const HomeScreen = ({ navigation }) => {
  const [inputText, setInputText] = useState('');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const inputRef = useRef(null);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleSendText = () => {
    if (!inputText.trim()) return;
    navigation.navigate('Chat', { initialMessage: inputText.trim() });
    setInputText('');
  };

  const handleQuickQuestion = (question) => {
    navigation.navigate('Chat', { initialMessage: question });
  };

  const handleVoice = () => {
    navigation.navigate('Voice');
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View
          style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
        >
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.greeting}>{getGreeting()}</Text>
              <Text style={styles.appName}>DementiaGuide AI</Text>
            </View>
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={() => navigation.navigate('Profile')}
              accessibilityLabel="Open settings"
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="tune-variant" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Tagline */}
          <Text style={styles.tagline}>Your trusted companion for dementia care guidance</Text>
        </Animated.View>

        {/* Avatar Hero */}
        <Animated.View
          style={[styles.heroCard, { opacity: fadeAnim }]}
        >
          <LinearGradient
            colors={['#4A7C8E', '#5D8FA1', '#7FB5A0']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            <View style={styles.heroContent}>
              <View style={styles.avatarSection}>
                <Avatar size={96} isIdle={true} />
                <View style={styles.avatarLabel}>
                  <View style={styles.ariaBadge}>
                    <Text style={styles.ariaName}>Aria</Text>
                  </View>
                  <Text style={styles.ariaTitle}>Your AI Guide</Text>
                </View>
              </View>

              <View style={styles.heroText}>
                <Text style={styles.heroHeading}>How can I help you today?</Text>
                <Text style={styles.heroSubheading}>
                  Ask a question, explore resources, or start a conversation about dementia care.
                </Text>
              </View>
            </View>

            {/* Trust indicators */}
            <View style={styles.trustRow}>
              <View style={styles.trustBadge}>
                <MaterialCommunityIcons name="shield-check" size={13} color="rgba(255,255,255,0.85)" />
                <Text style={styles.trustText}>Evidence-based</Text>
              </View>
              <View style={styles.trustDivider} />
              <View style={styles.trustBadge}>
                <MaterialCommunityIcons name="lock-outline" size={13} color="rgba(255,255,255,0.85)" />
                <Text style={styles.trustText}>Private & secure</Text>
              </View>
              <View style={styles.trustDivider} />
              <View style={styles.trustBadge}>
                <MaterialCommunityIcons name="book-open-outline" size={13} color="rgba(255,255,255,0.85)" />
                <Text style={styles.trustText}>Curated resources</Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Input Bar */}
        <Animated.View
          style={[styles.inputCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
        >
          <View style={styles.inputRow}>
            <View style={styles.inputContainer}>
              <MaterialCommunityIcons name="magnify" size={20} color={Colors.textTertiary} style={styles.inputIcon} />
              <TextInput
                ref={inputRef}
                style={styles.textInput}
                value={inputText}
                onChangeText={setInputText}
                placeholder="Ask anything about dementia care..."
                placeholderTextColor={Colors.textTertiary}
                onSubmitEditing={handleSendText}
                returnKeyType="send"
                accessibilityLabel="Type your question"
                accessibilityHint="Type a question about dementia care and press send"
              />
              {inputText.length > 0 && (
                <TouchableOpacity onPress={handleSendText} style={styles.sendButton} accessibilityLabel="Send question">
                  <MaterialCommunityIcons name="arrow-up-circle" size={32} color={Colors.primary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Voice button */}
            <TouchableOpacity
              style={styles.voiceButton}
              onPress={handleVoice}
              accessibilityLabel="Start voice conversation"
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="microphone" size={22} color={Colors.textInverse} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Quick Questions */}
        <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
          <Text style={styles.sectionTitle}>Common Questions</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickQuestionsRow}
          >
            {QUICK_QUESTIONS.map((q, i) => (
              <TouchableOpacity
                key={i}
                style={styles.quickChip}
                onPress={() => handleQuickQuestion(q)}
                accessibilityLabel={q}
                accessibilityRole="button"
              >
                <Text style={styles.quickChipText}>{q}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>

        {/* Navigation Cards */}
        <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
          <Text style={styles.sectionTitle}>Explore</Text>
          <View style={styles.navGrid}>
            <TouchableOpacity
              style={[styles.navCard, { backgroundColor: Colors.primaryMuted }]}
              onPress={() => navigation.navigate('Chat')}
              accessibilityLabel="Start chat conversation"
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="chat-outline" size={28} color={Colors.primary} />
              <Text style={[styles.navCardTitle, { color: Colors.primaryDark }]}>Chat</Text>
              <Text style={styles.navCardSub}>Ask questions</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navCard, { backgroundColor: Colors.secondaryMuted }]}
              onPress={() => navigation.navigate('Library')}
              accessibilityLabel="Browse knowledge library"
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="library-outline" size={28} color={Colors.secondary} />
              <Text style={[styles.navCardTitle, { color: Colors.secondaryDark }]}>Library</Text>
              <Text style={styles.navCardSub}>Browse resources</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navCard, { backgroundColor: Colors.accentMuted }]}
              onPress={handleVoice}
              accessibilityLabel="Start voice interaction"
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="microphone-outline" size={28} color={Colors.accent} />
              <Text style={[styles.navCardTitle, { color: Colors.accentDark }]}>Voice</Text>
              <Text style={styles.navCardSub}>Speak with Aria</Text>
            </TouchableOpacity>
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  greeting: {
    ...Typography.bodyMedium,
    color: Colors.textSecondary,
  },
  appName: {
    ...Typography.headlineLarge,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  settingsButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  tagline: {
    ...Typography.bodySmall,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  heroCard: {
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  heroGradient: {
    padding: 24,
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 20,
    marginBottom: 20,
  },
  avatarSection: {
    alignItems: 'center',
    gap: 8,
  },
  avatarLabel: {
    alignItems: 'center',
    gap: 2,
  },
  ariaBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  ariaName: {
    ...Typography.labelLarge,
    color: Colors.textInverse,
  },
  ariaTitle: {
    ...Typography.labelSmall,
    color: 'rgba(255,255,255,0.75)',
    textTransform: 'none',
    letterSpacing: 0,
  },
  heroText: {
    flex: 1,
    paddingTop: 6,
  },
  heroHeading: {
    ...Typography.headlineMedium,
    color: Colors.textInverse,
    marginBottom: 8,
  },
  heroSubheading: {
    ...Typography.bodySmall,
    color: 'rgba(255,255,255,0.82)',
    lineHeight: 20,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
    paddingTop: 16,
    justifyContent: 'center',
    gap: 0,
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
    justifyContent: 'center',
  },
  trustDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  trustText: {
    ...Typography.labelSmall,
    color: 'rgba(255,255,255,0.85)',
    textTransform: 'none',
    letterSpacing: 0,
    fontSize: 11,
  },
  inputCard: {
    marginHorizontal: 20,
    marginTop: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    height: 52,
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    height: 24,
    fontSize: 16,
    color: Colors.textPrimary,
    padding: 0,
    margin: 0,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  sendButton: {
    marginLeft: 4,
  },
  voiceButton: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    ...Typography.titleLarge,
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  quickQuestionsRow: {
    paddingRight: 20,
    gap: 8,
  },
  quickChip: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  quickChipText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  navGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  navCard: {
    flex: 1,
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    gap: 6,
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  navCardTitle: {
    ...Typography.titleMedium,
    fontSize: 15,
  },
  navCardSub: {
    ...Typography.bodySmall,
    color: Colors.textTertiary,
    textAlign: 'center',
    fontSize: 11,
  },
});
