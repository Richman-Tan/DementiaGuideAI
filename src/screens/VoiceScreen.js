import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  StatusBar,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Avatar } from '../components/Avatar';
import { VoiceWaveform } from '../components/VoiceWaveform';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { aceService } from '../services/aceService';

const VoiceState = {
  IDLE: 'idle',
  LISTENING: 'listening',
  PROCESSING: 'processing',
  SPEAKING: 'speaking',
};

const STATE_META = {
  [VoiceState.IDLE]: {
    label: 'Tap to speak',
    subLabel: 'Aria is ready to listen',
    color: Colors.primary,
    icon: 'microphone',
  },
  [VoiceState.LISTENING]: {
    label: 'Listening...',
    subLabel: 'Speak clearly — tap again to stop',
    color: Colors.success,
    icon: 'stop',
  },
  [VoiceState.PROCESSING]: {
    label: 'Thinking...',
    subLabel: 'Aria is preparing a response',
    color: Colors.accent,
    icon: 'dots-horizontal',
  },
  [VoiceState.SPEAKING]: {
    label: 'Aria is speaking',
    subLabel: 'Tap to interrupt',
    color: Colors.accent,
    icon: 'volume-high',
  },
};

const TranscriptBubble = ({ text, role }) => (
  <View style={[styles.transcriptBubble, role === 'user' ? styles.userBubble : styles.ariaBubble]}>
    <Text style={[styles.transcriptRole, role === 'user' && styles.transcriptRoleUser]}>
      {role === 'user' ? 'You' : 'Aria'}
    </Text>
    <Text style={[styles.transcriptText, role === 'user' && styles.transcriptTextUser]}>{text}</Text>
  </View>
);

export const VoiceScreen = ({ navigation }) => {
  const [voiceState, setVoiceState] = useState(VoiceState.IDLE);
  const [transcript, setTranscript] = useState([]);
  const [showTranscript, setShowTranscript] = useState(true);

  const micScaleAnim = useRef(new Animated.Value(1)).current;
  const micOpacityAnim = useRef(new Animated.Value(1)).current;
  const statusOpacity = useRef(new Animated.Value(1)).current;
  const outerPulse = useRef(new Animated.Value(1)).current;
  const outerPulse2 = useRef(new Animated.Value(1)).current;
  const listenerRef = useRef(null);

  const meta = STATE_META[voiceState];

  // Microphone pulse animations when listening
  useEffect(() => {
    if (voiceState === VoiceState.LISTENING) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(outerPulse, { toValue: 1.4, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(outerPulse, { toValue: 1, duration: 900, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ])
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.delay(450),
          Animated.timing(outerPulse2, { toValue: 1.6, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(outerPulse2, { toValue: 1, duration: 900, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ])
      ).start();
    } else {
      outerPulse.stopAnimation();
      outerPulse2.stopAnimation();
      Animated.spring(outerPulse, { toValue: 1, useNativeDriver: true }).start();
      Animated.spring(outerPulse2, { toValue: 1, useNativeDriver: true }).start();
    }
  }, [voiceState]);

  // Processing spin
  useEffect(() => {
    if (voiceState === VoiceState.PROCESSING) {
      Animated.loop(
        Animated.timing(micScaleAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        })
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(micOpacityAnim, { toValue: 0.5, duration: 500, useNativeDriver: true }),
          Animated.timing(micOpacityAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      micOpacityAnim.stopAnimation();
      micOpacityAnim.setValue(1);
    }
  }, [voiceState]);

  const handleMicPress = useCallback(async () => {
    if (voiceState === VoiceState.IDLE) {
      setVoiceState(VoiceState.LISTENING);
      // TODO: Start Expo AV recording → stream to ACE Riva ASR
      // Simulate listening for 3 seconds then processing
      clearTimeout(listenerRef.current);
      listenerRef.current = setTimeout(async () => {
        const mockTranscript = "How do I manage sundowning behaviour?";
        setTranscript(prev => [...prev, { role: 'user', text: mockTranscript }]);
        setVoiceState(VoiceState.PROCESSING);

        try {
          const response = await aceService.sendText(mockTranscript);
          setVoiceState(VoiceState.SPEAKING);
          setTranscript(prev => [...prev, { role: 'aria', text: response.text }]);
          // Simulate speech duration
          setTimeout(() => setVoiceState(VoiceState.IDLE), 5000);
        } catch {
          setVoiceState(VoiceState.IDLE);
        }
      }, 3000);
    } else if (voiceState === VoiceState.LISTENING) {
      clearTimeout(listenerRef.current);
      setVoiceState(VoiceState.IDLE);
    } else if (voiceState === VoiceState.SPEAKING) {
      // Interrupt
      setVoiceState(VoiceState.IDLE);
    }
  }, [voiceState]);

  const handleClear = () => {
    setTranscript([]);
    setVoiceState(VoiceState.IDLE);
  };

  const insets = useSafeAreaInsets();

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <LinearGradient
        colors={['#2D5F70', '#4A7C8E', '#5D9381']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={styles.gradient}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Close voice screen"
          >
            <MaterialCommunityIcons name="chevron-down" size={26} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Voice</Text>

          <TouchableOpacity
            style={styles.transcriptToggle}
            onPress={() => setShowTranscript(!showTranscript)}
            accessibilityLabel={showTranscript ? 'Hide transcript' : 'Show transcript'}
          >
            <MaterialCommunityIcons
              name={showTranscript ? 'subtitles' : 'subtitles-outline'}
              size={22}
              color="rgba(255,255,255,0.9)"
            />
          </TouchableOpacity>
        </View>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <Avatar
            size={110}
            isListening={voiceState === VoiceState.LISTENING}
            isSpeaking={voiceState === VoiceState.SPEAKING}
            isIdle={voiceState === VoiceState.IDLE}
          />
          <Text style={styles.ariaName}>Aria</Text>
          <Text style={styles.ariaRole}>DementiaGuide AI — Voice Interface</Text>
          <Text style={styles.poweredBy}>Powered by NVIDIA ACE</Text>
        </View>

        {/* Waveform visualiser */}
        <View style={styles.waveformContainer}>
          <VoiceWaveform
            isActive={voiceState === VoiceState.LISTENING || voiceState === VoiceState.SPEAKING}
            color={
              voiceState === VoiceState.SPEAKING
                ? Colors.accent
                : voiceState === VoiceState.LISTENING
                ? Colors.success
                : 'rgba(255,255,255,0.3)'
            }
            maxHeight={50}
            barWidth={5}
            gap={6}
          />
        </View>

        {/* Status text */}
        <View style={styles.statusSection}>
          <View style={[styles.statusIndicator, { backgroundColor: `${meta.color}30` }]}>
            <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
            <Text style={styles.statusLabel}>{meta.label}</Text>
          </View>
          <Text style={styles.statusSub}>{meta.subLabel}</Text>
        </View>

        {/* Transcript */}
        {showTranscript && transcript.length > 0 && (
          <View style={styles.transcriptContainer}>
            <View style={styles.transcriptHeader}>
              <Text style={styles.transcriptTitle}>Conversation</Text>
              <TouchableOpacity onPress={handleClear} accessibilityLabel="Clear conversation">
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.transcriptScroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.transcriptScrollContent}
            >
              {transcript.map((item, i) => (
                <TranscriptBubble key={i} text={item.text} role={item.role} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Mic button */}
        <View style={styles.micSection}>
          {voiceState === VoiceState.LISTENING && (
            <>
              <Animated.View
                style={[
                  styles.micRing,
                  styles.micRingOuter,
                  { transform: [{ scale: outerPulse2 }], opacity: 0.2 },
                ]}
              />
              <Animated.View
                style={[
                  styles.micRing,
                  { transform: [{ scale: outerPulse }], opacity: 0.3 },
                ]}
              />
            </>
          )}

          <TouchableOpacity
            style={[styles.micButton, { backgroundColor: meta.color }]}
            onPress={handleMicPress}
            activeOpacity={0.85}
            accessibilityLabel={meta.label}
            accessibilityRole="button"
            accessibilityState={{ selected: voiceState === VoiceState.LISTENING }}
          >
            <Animated.View style={{ opacity: micOpacityAnim }}>
              <MaterialCommunityIcons name={meta.icon} size={32} color={Colors.textInverse} />
            </Animated.View>
          </TouchableOpacity>
        </View>

        {/* Quick action row */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => navigation.navigate('Chat')}
            accessibilityLabel="Switch to text chat"
          >
            <MaterialCommunityIcons name="keyboard-outline" size={20} color="rgba(255,255,255,0.8)" />
            <Text style={styles.quickActionText}>Switch to text</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => navigation.navigate('Library')}
            accessibilityLabel="Browse library"
          >
            <MaterialCommunityIcons name="library-outline" size={20} color="rgba(255,255,255,0.8)" />
            <Text style={styles.quickActionText}>Browse library</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...Typography.titleLarge,
    color: Colors.textInverse,
  },
  transcriptToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSection: {
    alignItems: 'center',
    marginTop: 20,
    gap: 8,
  },
  ariaName: {
    ...Typography.headlineMedium,
    color: Colors.textInverse,
  },
  ariaRole: {
    ...Typography.bodySmall,
    color: 'rgba(255,255,255,0.75)',
  },
  poweredBy: {
    ...Typography.labelSmall,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.5,
  },
  waveformContainer: {
    alignItems: 'center',
    marginTop: 24,
    height: 60,
    justifyContent: 'center',
  },
  statusSection: {
    alignItems: 'center',
    marginTop: 16,
    gap: 6,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    ...Typography.labelLarge,
    color: Colors.textInverse,
  },
  statusSub: {
    ...Typography.bodySmall,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
  },
  transcriptContainer: {
    flex: 1,
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    overflow: 'hidden',
    maxHeight: 220,
  },
  transcriptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  transcriptTitle: {
    ...Typography.labelLarge,
    color: Colors.textInverse,
  },
  clearText: {
    ...Typography.labelMedium,
    color: 'rgba(255,255,255,0.6)',
  },
  transcriptScroll: {
    flex: 1,
  },
  transcriptScrollContent: {
    padding: 12,
    gap: 8,
  },
  transcriptBubble: {
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  ariaBubble: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignSelf: 'flex-start',
    maxWidth: '85%',
  },
  userBubble: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'flex-end',
    maxWidth: '85%',
  },
  transcriptRole: {
    ...Typography.labelSmall,
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'none',
    letterSpacing: 0,
    fontWeight: '600',
    fontSize: 11,
  },
  transcriptRoleUser: {
    textAlign: 'right',
  },
  transcriptText: {
    ...Typography.bodySmall,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 20,
  },
  transcriptTextUser: {
    textAlign: 'right',
  },
  micSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
    height: 120,
  },
  micRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.success,
  },
  micRingOuter: {
    width: 130,
    height: 130,
    borderRadius: 65,
  },
  micButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginTop: 24,
    paddingBottom: 24,
  },
  quickAction: {
    alignItems: 'center',
    gap: 6,
  },
  quickActionText: {
    ...Typography.labelSmall,
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'none',
    letterSpacing: 0,
  },
});
