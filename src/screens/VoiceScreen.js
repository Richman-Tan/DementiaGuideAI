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
  Modal,
  Pressable,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { AvatarVRM } from '../components/AvatarVRM';
import { AvatarUnity } from '../components/AvatarUnity';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { useAvatarConversation, VoiceState } from '../hooks/useAvatarConversation';
import { useSettings } from '../context/SettingsContext';

import { AVATAR_PROFILES, AVATAR_PROFILE_LIST, DEFAULT_AVATAR_ID } from '../config/avatarProfiles';

// All model assets must be required statically — Metro cannot handle dynamic require().
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ASSET_MAP = {
  sdk:       require('../../assets/characters/aria/model.glb'),
  rpm:       require('../../assets/characters/zhenja/zhenja.glb'),
  metahuman: require('../../assets/characters/eric/eric.glb'),
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const COZY_ROOM_ASSET = require('../../assets/cozy_living_room_baked_small.glb');


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
  const [backdropUri, setBackdropUri] = useState(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuStep, setMenuStep] = useState('main'); // 'main' | 'persona'
  const { textScale, avatarEnabled, subtitlesEnabled, audioEnabled, updateSetting, selectedAvatarId } = useSettings();
  const activeAvatarId  = selectedAvatarId ?? DEFAULT_AVATAR_ID;
  const activeProfile   = AVATAR_PROFILES[activeAvatarId] ?? AVATAR_PROFILES[DEFAULT_AVATAR_ID];
  const isUnityRenderer = activeProfile.renderer === 'unity';
  const avatarRef   = useRef(null);
  const micPulse    = useRef(new Animated.Value(1)).current;
  const menuAnim    = useRef(new Animated.Value(0)).current;
  const insets      = useSafeAreaInsets();

  const openMenu = useCallback(() => {
    setMenuVisible(true);
    Animated.spring(menuAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 120,
      friction: 10,
    }).start();
  }, [menuAnim]);

  const closeMenu = useCallback((onClosed) => {
    Animated.timing(menuAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setMenuVisible(false);
      setMenuStep('main');
      onClosed?.();
    });
  }, [menuAnim]);

  // Load the avatar GLB for the selected profile + the backdrop, converting both to
  // base64 data URIs so the WebView GLTFLoader can read them without XHR size limits.
  // Re-runs whenever the user switches avatar so the WebView reloads with the new model.
  // Skipped for Unity profiles — Unity loads its own assets via the UaaL bundle.
  useEffect(() => {
    if (isUnityRenderer) {
      setModelUri(null);
      setBackdropUri(null);
      return;
    }

    let cancelled = false;
    setModelUri(null); // clear stale model while new one loads
    const profile    = AVATAR_PROFILES[activeAvatarId] ?? AVATAR_PROFILES[DEFAULT_AVATAR_ID];
    const modelAsset = ASSET_MAP[profile.modelKey];
    (async () => {
      try {
        const [avatarAsset, backdropAsset] = await Promise.all([
          Asset.fromModule(modelAsset).downloadAsync(),
          Asset.fromModule(COZY_ROOM_ASSET).downloadAsync(),
        ]);
        const [avatarBase64, backdropBase64] = await Promise.all([
          FileSystem.readAsStringAsync(avatarAsset.localUri, { encoding: 'base64' }),
          FileSystem.readAsStringAsync(backdropAsset.localUri, { encoding: 'base64' }),
        ]);
        if (!cancelled) {
          setModelUri('data:model/gltf-binary;base64,' + avatarBase64);
          setBackdropUri('data:model/gltf-binary;base64,' + backdropBase64);
        }
      } catch (e) {
        console.warn('[VoiceScreen] Failed to load assets:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [activeAvatarId, isUnityRenderer]); // eslint-disable-line react-hooks/exhaustive-deps

  const {
    voiceState,
    conversationHistory,
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
        colors={['#100C1E', '#16102E', '#120E22', '#0D0A18']}
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

        <TouchableOpacity
          style={styles.topIconBtn}
          onPress={openMenu}
          accessibilityLabel="Open menu"
        >
          <MaterialCommunityIcons name="menu" size={24} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
      </View>

      {/* Single menu Modal — switches between 'main' and 'persona' steps internally
          so iOS never has to present two Modals simultaneously. */}
      {menuVisible && (
        <Modal transparent animationType="none" onRequestClose={() => closeMenu()}>
          {menuStep === 'main' ? (
            /* ── Main dropdown ── */
            <Pressable style={styles.menuOverlay} onPress={() => closeMenu()}>
              <Animated.View
                style={[
                  styles.menuDropdown,
                  {
                    top: insets.top + 58,
                    opacity: menuAnim,
                    transform: [
                      { translateY: menuAnim.interpolate({ inputRange: [0,1], outputRange: [-12,0] }) },
                      { scaleY:    menuAnim.interpolate({ inputRange: [0,1], outputRange: [0.92,1] }) },
                    ],
                  },
                ]}
              >
                <BlurView intensity={Platform.OS === 'ios' ? 70 : 40} tint="dark" style={styles.menuBlur}>
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => setMenuStep('persona')}
                    activeOpacity={0.7}
                  >
                    <View style={styles.menuItemIcon}>
                      <MaterialCommunityIcons name="account-switch-outline" size={20} color="rgba(255,255,255,0.9)" />
                    </View>
                    <Text style={styles.menuItemText}>Change Persona</Text>
                    <MaterialCommunityIcons name="chevron-right" size={18} color="rgba(255,255,255,0.35)" />
                  </TouchableOpacity>

                  <View style={styles.menuDivider} />

                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => {
                      closeMenu();
                      Alert.alert(
                        'About DementiaGuide AI',
                        'DementiaGuide AI is your compassionate assistant for dementia care support — providing guidance, resources, and a friendly presence for caregivers and families.',
                        [{ text: 'Got it' }]
                      );
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.menuItemIcon}>
                      <MaterialCommunityIcons name="information-outline" size={20} color="rgba(255,255,255,0.9)" />
                    </View>
                    <Text style={styles.menuItemText}>About / Help</Text>
                    <MaterialCommunityIcons name="chevron-right" size={18} color="rgba(255,255,255,0.35)" />
                  </TouchableOpacity>
                </BlurView>
              </Animated.View>
            </Pressable>
          ) : (
            /* ── Persona selection ── */
            <Pressable style={styles.personaOverlay} onPress={() => setMenuStep('main')}>
              <Pressable style={styles.personaSheet} onPress={() => {}}>
                <TouchableOpacity style={styles.personaBackRow} onPress={() => setMenuStep('main')}>
                  <MaterialCommunityIcons name="chevron-left" size={20} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.personaBackText}>Back</Text>
                </TouchableOpacity>

                <Text style={styles.personaTitle}>Choose Your Aria</Text>
                <Text style={styles.personaSubtitle}>Each look has its own expression style</Text>

                <View style={styles.personaGrid}>
                  {AVATAR_PROFILE_LIST.map(profile => {
                    const isSelected = profile.id === activeAvatarId;
                    return (
                      <TouchableOpacity
                        key={profile.id}
                        style={[styles.personaCard, isSelected && styles.personaCardSelected]}
                        onPress={() => {
                          updateSetting('selectedAvatarId', profile.id);
                          closeMenu();
                        }}
                        activeOpacity={0.75}
                        accessibilityLabel={`Select ${profile.name} ${profile.label}`}
                      >
                        <View style={styles.personaCardIcon}>
                          <MaterialCommunityIcons
                            name={isSelected ? 'account-check' : 'account-outline'}
                            size={32}
                            color={isSelected ? '#7C6FFF' : 'rgba(255,255,255,0.6)'}
                          />
                        </View>
                        <Text style={[styles.personaCardName, isSelected && styles.personaCardNameSelected]}>
                          {profile.name}
                        </Text>
                        <Text style={styles.personaCardLabel}>{profile.label}</Text>
                        <Text style={styles.personaCardDesc}>{profile.description}</Text>
                        {isSelected && (
                          <View style={styles.personaSelectedBadge}>
                            <Text style={styles.personaSelectedBadgeText}>Active</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity style={styles.personaCancelBtn} onPress={() => closeMenu()}>
                  <Text style={styles.personaCancelText}>Cancel</Text>
                </TouchableOpacity>
              </Pressable>
            </Pressable>
          )}
        </Modal>
      )}

      {/* Avatar */}
      <View style={styles.avatarArea}>
        {avatarEnabled && isUnityRenderer ? (
          // Unity/CC4 renderer — Phase 3: stub renders nothing, VoiceScreen shows
          // its own placeholder. Phase 5: AvatarUnity mounts the native UaaL view.
          <AvatarUnity ref={avatarRef} style={styles.avatarVRM} />
        ) : avatarEnabled && modelUri ? (
          <AvatarVRM
            ref={avatarRef}
            modelUrl={modelUri}
            backdropUrl={backdropUri}
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
        {/* {voiceState === VoiceState.IDLE && conversationHistory.length === 0 && (
          <View style={styles.subtitleBar}>
            <Text style={styles.subtitleText} numberOfLines={2}>
              {"Hello! I'm Aria, your DementiaGuide AI assistant. I'm here to help you find information, answer questions, and provide support around dementia care. How can I help you today?"}
            </Text>
          </View>
        )} */}
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
    backgroundColor: '#100C1E',
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
  menuOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  menuDropdown: {
    position: 'absolute',
    right: 16,
    width: 220,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 16,
  },
  menuBlur: {
    paddingVertical: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  menuItemIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemText: {
    flex: 1,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 12,
  },

  // ── Persona selection modal ────────────────────────────────────────────────
  personaOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  personaSheet: {
    backgroundColor: '#1A1530',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  personaBackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 4,
  },
  personaBackText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    fontWeight: '500',
  },
  personaTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  personaSubtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 24,
  },
  personaGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  personaCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.10)',
    minHeight: 160,
    justifyContent: 'center',
    gap: 6,
  },
  personaCardSelected: {
    backgroundColor: 'rgba(124,111,255,0.15)',
    borderColor: '#7C6FFF',
  },
  personaCardIcon: {
    marginBottom: 4,
  },
  personaCardName: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    fontWeight: '700',
  },
  personaCardNameSelected: {
    color: '#fff',
  },
  personaCardLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  personaCardDesc: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 15,
    marginTop: 2,
  },
  personaSelectedBadge: {
    marginTop: 6,
    backgroundColor: '#7C6FFF',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  personaSelectedBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  personaCancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  personaCancelText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 15,
    fontWeight: '500',
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
