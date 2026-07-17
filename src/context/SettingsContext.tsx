import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { getThemeColors, ColorScheme } from '@/theme/colors';

const STORAGE_KEY = '@dg_settings_v1';

export type TextSize = 'small' | 'medium' | 'large' | 'xlarge';
export type AriaPersonality = 'warm' | 'calm' | 'friendly' | 'practical';
export type ResponseStyle = 'brief' | 'balanced' | 'detailed' | 'step-by-step';
export type JargonMode = 'explain' | 'avoid' | 'ok';
export type CommunicationMode = 'voice' | 'text' | 'both';
export type SupportLevel = 'comfortable' | 'some-help' | 'clear' | 'guided';
export type HapticType = 'light' | 'medium' | 'success';

const TEXT_SCALE: Record<TextSize, number> = {
  small: 0.88,
  medium: 1.0,
  large: 1.18,
  xlarge: 1.35,
};

export interface Settings {
  // Existing
  textSize: TextSize;
  hapticFeedback: boolean;
  audioEnabled: boolean;
  avatarEnabled: boolean;
  autoPlayResponses: boolean;
  darkMode: boolean;
  highContrast: boolean;
  subtitlesEnabled: boolean;
  conciseMode: boolean;

  // Onboarding
  hasCompletedOnboarding: boolean;
  isCaregiversSetup: boolean;

  // Aria personality & communication
  ariaPersonality: AriaPersonality;
  responseStyle: ResponseStyle;
  jargonMode: JargonMode;
  communicationMode: CommunicationMode;
  speechRate: number;

  // Avatar / persona selection
  selectedAvatarId: string;

  // Support & UI guidance
  supportLevel: SupportLevel;

  // Accessibility
  reducedMotion: boolean;

  // Voice pipeline
  /** Hands-free conversation: auto-detect end of speech instead of tap-to-stop. */
  handsFreeMode: boolean;
  /** Streaming voice pipeline (faster responses); off = classic per-sentence path. */
  fastVoiceMode: boolean;
}

const DEFAULTS: Settings = {
  textSize: 'medium',
  hapticFeedback: true,
  audioEnabled: true,
  avatarEnabled: true,
  autoPlayResponses: false,
  darkMode: false,
  highContrast: false,
  subtitlesEnabled: true,
  conciseMode: false,

  hasCompletedOnboarding: false,
  isCaregiversSetup: false,

  ariaPersonality: 'warm',
  responseStyle: 'balanced',
  jargonMode: 'explain',
  communicationMode: 'both',
  speechRate: 0.78,

  selectedAvatarId: 'aria_sdk',

  supportLevel: 'comfortable',

  reducedMotion: false,

  handsFreeMode: false,
  fastVoiceMode: true,
};

export interface SettingsContextValue extends Settings {
  /** Hydration flag — consumers wait for this before routing. */
  isHydrated: boolean;
  /** Numeric multiplier derived from `textSize`. */
  textScale: number;
  colors: ColorScheme;
  setTextSize: (val: TextSize) => void;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  toggleDarkMode: () => void;
  triggerHaptic: (type?: HapticType) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export const SettingsProvider = ({ children }: { children: React.ReactNode }) => {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [isHydrated, setIsHydrated] = useState(false);

  // Full-screen overlay animated value — used for the dark mode cross-dissolve.
  // Fades in to 0.5 opacity at the moment the colours flip, then fades back out.
  const themeOverlayAnim = useRef(new Animated.Value(0)).current;
  const transitionLock = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const saved = JSON.parse(raw) as Partial<Settings>;
          setSettings((prev) => ({ ...prev, ...saved }));
        }
      })
      .catch(() => {})
      .finally(() => setIsHydrated(true));
  }, []);

  const persist = (next: Settings) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  };

  const setTextSize = useCallback((val: TextSize) => {
    if (!TEXT_SCALE[val]) return;
    setSettings((prev) => {
      const next = { ...prev, textSize: val };
      persist(next);
      return next;
    });
  }, []);

  const updateSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value } as Settings;
      persist(next);
      return next;
    });
  }, []);

  // Animated dark mode toggle — fades a black/white overlay to the peak opacity
  // at the moment the colour set flips, then dissolves out. Produces a smooth
  // cross-dissolve rather than an instant hard switch.
  const toggleDarkMode = useCallback(() => {
    if (transitionLock.current) return;
    transitionLock.current = true;

    const FADE_IN_MS = 200;
    const FADE_OUT_MS = 320;

    Animated.sequence([
      Animated.timing(themeOverlayAnim, {
        toValue: 1,
        duration: FADE_IN_MS,
        useNativeDriver: true,
      }),
      Animated.timing(themeOverlayAnim, {
        toValue: 0,
        duration: FADE_OUT_MS,
        useNativeDriver: true,
      }),
    ]).start(() => {
      transitionLock.current = false;
    });

    // Flip the colour set at peak opacity so the switch is invisible to the user.
    setTimeout(() => {
      setSettings((prev) => {
        const next = { ...prev, darkMode: !prev.darkMode };
        persist(next);
        return next;
      });
    }, FADE_IN_MS);
  }, [themeOverlayAnim]);

  const triggerHaptic = useCallback(
    (type: HapticType = 'light') => {
      if (!settings.hapticFeedback) return;
      switch (type) {
        case 'medium':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          break;
        case 'success':
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          break;
        default:
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
    },
    [settings.hapticFeedback]
  );

  const colors = useMemo(
    () => getThemeColors(settings.darkMode, settings.highContrast),
    [settings.darkMode, settings.highContrast]
  );

  const value: SettingsContextValue = {
    isHydrated,

    textSize: settings.textSize,
    textScale: TEXT_SCALE[settings.textSize] ?? 1.0,
    hapticFeedback: settings.hapticFeedback,
    audioEnabled: settings.audioEnabled,
    avatarEnabled: settings.avatarEnabled,
    autoPlayResponses: settings.autoPlayResponses,
    darkMode: settings.darkMode,
    highContrast: settings.highContrast,
    subtitlesEnabled: settings.subtitlesEnabled,
    conciseMode: settings.conciseMode,

    hasCompletedOnboarding: settings.hasCompletedOnboarding,
    isCaregiversSetup: settings.isCaregiversSetup,

    ariaPersonality: settings.ariaPersonality,
    responseStyle: settings.responseStyle,
    jargonMode: settings.jargonMode,
    communicationMode: settings.communicationMode,
    speechRate: settings.speechRate,

    selectedAvatarId: settings.selectedAvatarId,

    supportLevel: settings.supportLevel,

    reducedMotion: settings.reducedMotion,

    handsFreeMode: settings.handsFreeMode,
    fastVoiceMode: settings.fastVoiceMode,

    colors,
    setTextSize,
    updateSetting,
    toggleDarkMode,
    triggerHaptic,
  };

  return (
    <SettingsContext.Provider value={value}>
      <View style={styles.fill}>
        {children}
        {/* Transition overlay — pointer-events none so it never blocks interaction */}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: settings.darkMode ? '#ffffff' : '#000000',
              opacity: themeOverlayAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.45],
              }),
            },
          ]}
        />
      </View>
    </SettingsContext.Provider>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

export const useSettings = (): SettingsContextValue => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
};
