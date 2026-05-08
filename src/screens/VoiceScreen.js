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
import { Audio } from 'expo-av';
import { AvatarVRM, DEFAULT_VRM_MODEL_URL } from '../components/AvatarVRM';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { openaiService } from '../services/openaiService';

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
  const [conversationHistory, setConversationHistory] = useState([]);
  const recordingRef = useRef(null);
  const soundRef = useRef(null);
  const abortRef = useRef(false);   // set true when user stops mid-response
  const historyRef = useRef([]);    // kept in sync so callbacks always see latest
  const micPulse = useRef(new Animated.Value(1)).current;
  const insets = useSafeAreaInsets();

  const isActive = voiceState === VoiceState.LISTENING || voiceState === VoiceState.SPEAKING;

  // Keep historyRef in sync
  useEffect(() => {
    historyRef.current = conversationHistory;
  }, [conversationHistory]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

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

  // Core: stream RAG chat → sentence-split → parallel TTS → sequential playback.
  // Each sentence's TTS fires as soon as the sentence is complete from the stream,
  // so audio for sentence N is generating while sentence N-1 is playing.
  const processQuery = useCallback(async (userText) => {
    if (!userText.trim()) return;

    setVoiceState(VoiceState.PROCESSING);
    abortRef.current = false;

    // Pre-warm audio mode immediately — overlaps with LLM streaming so it's
    // ready by the time the first segment is done generating.
    Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });

    try {
      const history = historyRef.current;
      let fullText = '';

      // Promises of data URIs — pushed in sentence order, resolved concurrently.
      const segmentPromises = [];

      const addSegment = (text) => {
        const clean = text.trim();
        if (!clean) return;
        // tts() now returns a data:audio/mpeg;base64,... URI — no disk write needed.
        segmentPromises.push(openaiService.tts(clean, 'nova'));
      };

      // Stream response and split into sentences as chunks arrive.
      // Hermes doesn't support lookbehind, so use a replace-then-split trick.
      let buf = '';
      for await (const chunk of openaiService.chatStream(userText, history)) {
        if (abortRef.current) break;
        fullText += chunk;
        buf += chunk;
        // Mark sentence ends with a private delimiter, then split
        const marked = buf.replace(/([.!?])\s+/g, '$1\x1F');
        const parts = marked.split('\x1F');
        parts.slice(0, -1).forEach(s => addSegment(s));
        buf = parts[parts.length - 1];
      }
      if (buf.trim() && !abortRef.current) addSegment(buf);

      setConversationHistory(prev => [
        ...prev,
        { role: 'user', content: userText },
        { role: 'assistant', content: fullText },
      ]);

      if (segmentPromises.length === 0 || abortRef.current) {
        setVoiceState(VoiceState.IDLE);
        return;
      }

      setVoiceState(VoiceState.SPEAKING);

      // Play segments in order. While segment N plays, segment N+1's Sound object
      // is already being created (decoding happens in parallel with playback).
      let nextSoundPromise = null;

      for (let i = 0; i < segmentPromises.length; i++) {
        if (abortRef.current) break;

        const uri = await segmentPromises[i];
        if (abortRef.current) break;

        if (soundRef.current) {
          await soundRef.current.unloadAsync().catch(() => {});
          soundRef.current = null;
        }

        const { sound } = nextSoundPromise
          ? await nextSoundPromise
          : await Audio.Sound.createAsync({ uri });
        soundRef.current = sound;

        // Kick off next segment's Sound creation while this one plays
        if (i + 1 < segmentPromises.length) {
          nextSoundPromise = segmentPromises[i + 1].then(
            nextUri => Audio.Sound.createAsync({ uri: nextUri })
          );
        } else {
          nextSoundPromise = null;
        }

        await new Promise(resolve => {
          sound.setOnPlaybackStatusUpdate(status => {
            if (status.didJustFinish || status.error) resolve();
          });
          sound.playAsync();
        });

        await sound.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    } catch (err) {
      console.error('[VoiceScreen] processQuery:', err);
    } finally {
      setVoiceState(VoiceState.IDLE);
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') return;

      // Tear down any lingering recorder before creating a new one
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setVoiceState(VoiceState.LISTENING);
    } catch (err) {
      console.error('[VoiceScreen] startRecording:', err);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    }
  }, []);

  const stopAndTranscribe = useCallback(async () => {
    const rec = recordingRef.current;
    if (!rec) return;

    setVoiceState(VoiceState.PROCESSING);

    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recordingRef.current = null;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const transcript = await openaiService.transcribe(uri);
      if (!transcript) {
        setVoiceState(VoiceState.IDLE);
        return;
      }

      await processQuery(transcript);
    } catch (err) {
      console.error('[VoiceScreen] stopAndTranscribe:', err);
      setVoiceState(VoiceState.IDLE);
    }
  }, [processQuery]);

  const stopAudio = useCallback(async () => {
    abortRef.current = true;
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
  }, []);

  const handleMicPress = useCallback(async () => {
    if (voiceState === VoiceState.IDLE) {
      await startRecording();
    } else if (voiceState === VoiceState.LISTENING) {
      await stopAndTranscribe();
    } else if (voiceState === VoiceState.SPEAKING) {
      await stopAudio();
      setVoiceState(VoiceState.IDLE);
    }
  }, [voiceState, startRecording, stopAndTranscribe, stopAudio]);

  const handleStop = useCallback(async () => {
    if (recordingRef.current) {
      await recordingRef.current.stopAndUnloadAsync().catch(() => {});
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
      recordingRef.current = null;
    }
    await stopAudio();
    setVoiceState(VoiceState.IDLE);
  }, [stopAudio]);

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

      {/* Avatar */}
      <View style={styles.avatarArea}>
        <AvatarVRM
          modelUrl={DEFAULT_VRM_MODEL_URL}
          isListening={voiceState === VoiceState.LISTENING}
          isSpeaking={voiceState === VoiceState.SPEAKING}
          isThinking={voiceState === VoiceState.PROCESSING}
          style={styles.avatarVRM}
        />

        <View style={styles.nameBadge}>
          <View style={[styles.nameBadgeDot, { backgroundColor: isActive ? '#4ECDC4' : 'rgba(255,255,255,0.4)' }]} />
          <Text style={styles.nameBadgeText}>Aria</Text>
        </View>
      </View>

      {/* Bottom control panel */}
      <View style={[styles.bottomPanel, { paddingBottom: insets.bottom + 12 }]}>
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
              <Text style={[styles.chipText, inputText === chip && styles.chipTextActive]}>
                {chip}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Icon row */}
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
