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
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { AvatarVRM } from '../components/AvatarVRM';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { useAvatarConversation, VoiceState } from '../hooks/useAvatarConversation';
import { useSettings } from '../context/SettingsContext';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ZHENJA_ASSET = require('../../assets/avatar2/model.glb');

const QUICK_CHIPS = [
  'Morning routine',
  'Managing sundowning',
  'Memory exercises',
  'Medication reminders',
  'Sleep tips',
  'Caregiver support',
];

export const VoiceScreen = ({ navigation }) => {
  const [inputText, setInputText] = useState('');
  const [modelUri, setModelUri] = useState(null);
  const { textScale, avatarEnabled, subtitlesEnabled, audioEnabled, updateSetting } = useSettings();
  const avatarRef  = useRef(null);
  const micPulse   = useRef(new Animated.Value(1)).current;
  const insets     = useSafeAreaInsets();

  // Load the RPM GLB from the app bundle as a base64 data URI so the WebView can fetch it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const asset = Asset.fromModule(ZHENJA_ASSET);
        await asset.downloadAsync();
        const localUri = asset.localUri;
        const base64 = await FileSystem.readAsStringAsync(localUri, {
          encoding: 'base64',
        });
        if (!cancelled) {
          setModelUri('data:model/gltf-binary;base64,' + base64);
        }
      } catch (e) {
        console.warn('[VoiceScreen] Failed to load zhenja.glb:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const {
    voiceState,
    processQuery,
    startRecording,
    stopAndTranscribe,
    stopAudio,
    handleMicPress,
    handleStop,
    error,
    clearError,
    currentSubtitle,
  } = useAvatarConversation({ avatarRef });

  const isActive = voiceState === VoiceState.LISTENING || voiceState === VoiceState.SPEAKING;

  // Mic pulse animation
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

  const handleChipPress = (chip) => setInputText(chip);

  const handleTextSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || voiceState !== VoiceState.IDLE) return;
    setInputText('');
    await processQuery(text);
  }, [inputText, voiceState, processQuery]);

  const micColor = voiceState === VoiceState.LISTENING
    ? '#4ECDC4'
    : voiceState === VoiceState.SPEAKING
    ? Colors.accent
    : 'rgba(255,255,255,0.85)';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <LinearGradient
        colors={['#080B14', '#0E1525', '#0D1B2A', '#0A1A20']}
        locations={[0, 0.4, 0.75, 1]}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.topIconBtn}
          onPress={() => navigation.navigate('Home')}
          accessibilityLabel="Return to home"
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
      </View>

      {/* Avatar */}
      <View style={styles.avatarArea}>
        {avatarEnabled && modelUri ? (
          <AvatarVRM
            ref={avatarRef}
            modelUrl={modelUri}
            isListening={voiceState === VoiceState.LISTENING}
            isSpeaking={voiceState === VoiceState.SPEAKING}
            isThinking={voiceState === VoiceState.PROCESSING}
            style={styles.avatarVRM}
          />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <MaterialCommunityIcons
              name={voiceState === VoiceState.LISTENING ? 'microphone' : voiceState === VoiceState.SPEAKING ? 'volume-high' : voiceState === VoiceState.PROCESSING ? 'dots-horizontal' : 'robot-excited-outline'}
              size={64}
              color={isActive ? '#4ECDC4' : 'rgba(255,255,255,0.4)'}
            />
            <Text style={styles.avatarPlaceholderState}>
              {voiceState === VoiceState.LISTENING ? 'Listening…' : voiceState === VoiceState.SPEAKING ? 'Speaking…' : voiceState === VoiceState.PROCESSING ? 'Thinking…' : 'Ready'}
            </Text>
          </View>
        )}

        <View style={styles.nameBadge}>
          <View style={[styles.nameBadgeDot, { backgroundColor: isActive ? '#4ECDC4' : 'rgba(255,255,255,0.4)' }]} />
          <Text style={styles.nameBadgeText}>Aria</Text>
        </View>

        {/* Subtitle bar — absolute overlay so it doesn't affect avatar size */}
        {currentSubtitle.length > 0 && voiceState === VoiceState.SPEAKING && (
          <View style={styles.subtitleBar}>
            <Text style={styles.subtitleText} numberOfLines={3}>{currentSubtitle}</Text>
          </View>
        )}
      </View>

      {/* Bottom control panel */}
      <View style={[styles.bottomPanel, { paddingBottom: insets.bottom + 12 }]}>
        {/* Error banner */}
        {error && (
          <View style={styles.errorBanner}>
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#FF6B6B" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={clearError}>
              <MaterialCommunityIcons name="close" size={16} color="#FF6B6B" />
            </TouchableOpacity>
          </View>
        )}

        {/* Quick chips */}
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
              <Text style={[styles.chipText, inputText === chip && styles.chipTextActive, { fontSize: 13 * textScale }]}>
                {chip}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Icon row — mic as primary, flanked by text and volume */}
        <View style={styles.iconRow}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('Chat')}
            accessibilityLabel="Switch to text chat"
          >
            <MaterialCommunityIcons name="keyboard-outline" size={22} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>

          <Animated.View style={{ transform: [{ scale: micPulse }] }}>
            <TouchableOpacity
              style={[styles.iconBtn, styles.micIconBtn, { borderColor: micColor }]}
              onPress={handleMicPress}
              accessibilityLabel={voiceState === VoiceState.IDLE ? 'Start speaking' : 'Stop'}
            >
              <MaterialCommunityIcons
                name={voiceState === VoiceState.LISTENING ? 'stop' : 'microphone'}
                size={26}
                color={micColor}
              />
            </TouchableOpacity>
          </Animated.View>

          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => updateSetting('audioEnabled', !audioEnabled)}
            accessibilityLabel="Volume"
          >
            <MaterialCommunityIcons
              name={audioEnabled ? 'volume-high' : 'volume-off'}
              size={22}
              color={audioEnabled ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)'}
            />
          </TouchableOpacity>
        </View>

        {/* Ask anything row */}
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { fontSize: 15 * textScale }]}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask Anything..."
            placeholderTextColor="rgba(255,255,255,0.35)"
            returnKeyType="send"
            onSubmitEditing={handleTextSend}
            editable={voiceState === VoiceState.IDLE}
          />

          {isActive ? (
            <TouchableOpacity style={styles.stopBtn} onPress={handleStop} accessibilityLabel="Stop">
              <View style={styles.stopIcon} />
              <Text style={styles.stopText}>Stop</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.sendBtn} onPress={handleTextSend} accessibilityLabel="Send">
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
  avatarArea: {
    flex: 1,
  },
  avatarVRM: {
    flex: 1,
    alignSelf: 'stretch',
  },
  avatarPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  avatarPlaceholderState: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.3,
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
  subtitleBar: {
    position: 'absolute',
    bottom: 56,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    zIndex: 10,
  },
  subtitleText: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    fontWeight: '500',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginHorizontal: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.25)',
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#FF6B6B',
    lineHeight: 18,
  },
  bottomPanel: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingTop: 14,
    paddingHorizontal: 0,
    gap: 14,
  },
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
