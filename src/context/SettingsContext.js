import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
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
};

const SettingsContext = createContext(null);

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(DEFAULTS);

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
    colors,
    setTextSize,
    updateSetting,
    triggerHaptic,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
};
