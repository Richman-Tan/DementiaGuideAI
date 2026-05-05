import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  StatusBar,
  ScrollView,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AvatarVRM, DEFAULT_VRM_MODEL_URL } from '../components/AvatarVRM';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { aceService } from '../services/aceService';

const VoiceState = {
  IDLE: 'idle',
  LISTENING: 'listening',
  PROCESSING: 'processing',
  SPEAKING: 'speaking',
};

const QUICK_CHIPS = [
  'Morning routine',
  'Managing sundowning',
  'Memory exercises',
  'Medication reminders',
  'Sleep tips',
  'Caregiver support',
];

export const VoiceScreen = ({ navigation }) => {
  const [voiceState, setVoiceState] = useState(VoiceState.IDLE);
  const [inputText, setInputText] = useState('');
  const listenerRef = useRef(null);
  const micPulse = useRef(new Animated.Value(1)).current;
  const insets = useSafeAreaInsets();

  const isActive = voiceState === VoiceState.LISTENING || voiceState === VoiceState.SPEAKING;

  // Mic pulse when listening
  useEffect(() => {
    if (voiceState === VoiceState.LISTENING) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(micPulse, { toValue: 1.25, duration: 700, useNativeDriver: true }),
          Animated.timing(micPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      micPulse.stopAnimation();
      Animated.spring(micPulse, { toValue: 1, useNativeDriver: true }).start();
    }
  }, [voiceState]);

  const handleMicPress = useCallback(async () => {
    if (voiceState === VoiceState.IDLE) {
      setVoiceState(VoiceState.LISTENING);
      clearTimeout(listenerRef.current);
      listenerRef.current = setTimeout(async () => {
        const mockTranscript = 'How do I manage sundowning behaviour?';
        setVoiceState(VoiceState.PROCESSING);
        try {
          const response = await aceService.sendText(mockTranscript);
          setVoiceState(VoiceState.SPEAKING);
          setTimeout(() => setVoiceState(VoiceState.IDLE), 5000);
        } catch {
          setVoiceState(VoiceState.IDLE);
        }
      }, 3000);
    } else if (voiceState === VoiceState.LISTENING) {
      clearTimeout(listenerRef.current);
      setVoiceState(VoiceState.IDLE);
    } else if (voiceState === VoiceState.SPEAKING) {
      setVoiceState(VoiceState.IDLE);
    }
  }, [voiceState]);

  const handleChipPress = (chip) => {
    setInputText(chip);
  };

  const handleStop = () => {
    clearTimeout(listenerRef.current);
    setVoiceState(VoiceState.IDLE);
  };

  const micColor = voiceState === VoiceState.LISTENING
    ? '#4ECDC4'
    : voiceState === VoiceState.SPEAKING
    ? Colors.accent
    : 'rgba(255,255,255,0.85)';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Full-screen dark gradient background */}
      <LinearGradient
        colors={['#0D0D1A', '#1A1A2E', '#16213E']}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.topIconBtn}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Menu"
        >
          <MaterialCommunityIcons name="menu" size={24} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.captureBtn}
          onPress={() => {}}
          accessibilityLabel="Capture"
        >
          <MaterialCommunityIcons name="camera-iris" size={18} color="#fff" />
          <Text style={styles.captureBtnText}>Capture</Text>
        </TouchableOpacity>
      </View>

      {/* Avatar — fills remaining space above bottom panel */}
      <View style={styles.avatarArea}>
        <AvatarVRM
          modelUrl={DEFAULT_VRM_MODEL_URL}
          isListening={voiceState === VoiceState.LISTENING}
          isSpeaking={voiceState === VoiceState.SPEAKING}
          style={styles.avatarVRM}
        />

        {/* Floating name badge */}
        <View style={styles.nameBadge}>
          <View style={[styles.nameBadgeDot, { backgroundColor: isActive ? '#4ECDC4' : 'rgba(255,255,255,0.4)' }]} />
          <Text style={styles.nameBadgeText}>Aria</Text>
        </View>
      </View>

      {/* Bottom control panel */}
      <View style={[styles.bottomPanel, { paddingBottom: insets.bottom + 12 }]}>
        {/* Quick action chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {QUICK_CHIPS.map((chip) => (
            <TouchableOpacity
              key={chip}
              style={[styles.chip, inputText === chip && styles.chipActive]}
              onPress={() => handleChipPress(chip)}
              activeOpacity={0.75}
            >
              <Text style={[styles.chipText, inputText === chip && styles.chipTextActive]}>
                {chip}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Icon control row */}
        <View style={styles.iconRow}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('Chat')}
            accessibilityLabel="Switch to text chat"
          >
            <MaterialCommunityIcons name="keyboard-outline" size={22} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('Library')}
            accessibilityLabel="Browse library"
          >
            <MaterialCommunityIcons name="library-outline" size={22} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>

          {/* Mic — centre, larger */}
          <Animated.View style={{ transform: [{ scale: micPulse }] }}>
            <TouchableOpacity
              style={[styles.iconBtn, styles.micIconBtn, { borderColor: micColor }]}
              onPress={handleMicPress}
              accessibilityLabel={voiceState === VoiceState.IDLE ? 'Start speaking' : 'Stop speaking'}
            >
              <MaterialCommunityIcons
                name={voiceState === VoiceState.LISTENING ? 'stop' : 'microphone'}
                size={26}
                color={micColor}
              />
            </TouchableOpacity>
          </Animated.View>

          <TouchableOpacity style={styles.iconBtn} accessibilityLabel="Volume">
            <MaterialCommunityIcons name="volume-high" size={22} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconBtn} accessibilityLabel="Settings">
            <MaterialCommunityIcons name="cog-outline" size={22} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        </View>

        {/* Ask anything row */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask Anything..."
            placeholderTextColor="rgba(255,255,255,0.35)"
            returnKeyType="send"
            onSubmitEditing={() => {}}
          />

          {isActive ? (
            <TouchableOpacity style={styles.stopBtn} onPress={handleStop} accessibilityLabel="Stop">
              <View style={styles.stopIcon} />
              <Text style={styles.stopText}>Stop</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.sendBtn} onPress={() => {}} accessibilityLabel="Send">
              <MaterialCommunityIcons name="send" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0D0D1A',
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  topIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: 'rgba(100,180,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(100,180,255,0.4)',
  },
  captureBtnText: {
    ...Typography.labelMedium,
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Avatar area
  avatarArea: {
    flex: 1,
  },
  avatarVRM: {
    flex: 1,
    alignSelf: 'stretch',
  },
  nameBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
  },
  nameBadgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  nameBadgeText: {
    ...Typography.labelMedium,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '600',
  },

  // Bottom panel
  bottomPanel: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingTop: 14,
    paddingHorizontal: 0,
    gap: 14,
  },

  // Chips
  chipsRow: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  chipActive: {
    backgroundColor: 'rgba(100,180,255,0.25)',
    borderColor: 'rgba(100,180,255,0.5)',
  },
  chipText: {
    ...Typography.labelSmall,
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'none',
    letterSpacing: 0,
  },
  chipTextActive: {
    color: '#fff',
  },

  // Icon row
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingHorizontal: 24,
  },
  iconBtn: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  micIconBtn: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: 'rgba(78,205,196,0.12)',
    borderWidth: 2,
  },

  // Input row
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
  },
  input: {
    flex: 1,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 20,
    color: '#fff',
    fontSize: 15,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 25,
    backgroundColor: '#fff',
  },
  stopIcon: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: '#E53935',
  },
  stopText: {
    ...Typography.labelMedium,
    color: '#1E2D3D',
    fontSize: 14,
    fontWeight: '700',
  },
  sendBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
