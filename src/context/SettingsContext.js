import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { getThemeColors } from '../constants/colors';

const STORAGE_KEY = '@dg_settings_v1';
const TEXT_SCALE  = { small: 0.88, medium: 1.0, large: 1.18 };

const DEFAULTS = {
  textSize:          'medium',
  hapticFeedback:    true,
  audioEnabled:      true,
  avatarEnabled:     true,
  autoPlayResponses: false,
  darkMode:          false,
  highContrast:      false,
  subtitlesEnabled:  true,
  conciseMode:       false,
};

const SettingsContext = createContext(null);

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(DEFAULTS);

  // Full-screen overlay animated value — used for the dark mode cross-dissolve.
  // Fades in to 0.5 opacity at the moment the colours flip, then fades back out.
  const themeOverlayAnim = useRef(new Animated.Value(0)).current;
  const transitionLock   = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (!raw) return;
        const saved = JSON.parse(raw);
        setSettings(prev => ({ ...prev, ...saved }));
      })
      .catch(() => {});
  }, []);

  const persist = (next) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  };

  const setTextSize = useCallback((val) => {
    if (!TEXT_SCALE[val]) return;
    setSettings(prev => {
      const next = { ...prev, textSize: val };
      persist(next);
      return next;
    });
  }, []);

  const updateSetting = useCallback((key, value) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
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

    const FADE_IN_MS  = 200;
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
      setSettings(prev => {
        const next = { ...prev, darkMode: !prev.darkMode };
        persist(next);
        return next;
      });
    }, FADE_IN_MS);
  }, [themeOverlayAnim]);

  const triggerHaptic = useCallback((type = 'light') => {
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
  }, [settings.hapticFeedback]);

  const colors = useMemo(
    () => getThemeColors(settings.darkMode, settings.highContrast),
    [settings.darkMode, settings.highContrast]
  );

  const value = {
    textSize:          settings.textSize,
    textScale:         TEXT_SCALE[settings.textSize] ?? 1.0,
    hapticFeedback:    settings.hapticFeedback,
    audioEnabled:      settings.audioEnabled,
    avatarEnabled:     settings.avatarEnabled,
    autoPlayResponses: settings.autoPlayResponses,
    darkMode:          settings.darkMode,
    highContrast:      settings.highContrast,
    subtitlesEnabled:  settings.subtitlesEnabled,
    conciseMode:       settings.conciseMode,
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

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
};
