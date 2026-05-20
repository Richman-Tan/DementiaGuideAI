import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@dg_settings_v1';
const TEXT_SCALE  = { small: 0.88, medium: 1.0, large: 1.18 };

const SettingsContext = createContext(null);

export const SettingsProvider = ({ children }) => {
  const [textSize, setTextSizeState] = useState('medium');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (saved?.textSize && TEXT_SCALE[saved.textSize]) {
          setTextSizeState(saved.textSize);
        }
      })
      .catch(() => {});
  }, []);

  const setTextSize = (val) => {
    if (!TEXT_SCALE[val]) return;
    setTextSizeState(val);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ textSize: val })).catch(() => {});
  };

  return (
    <SettingsContext.Provider value={{ textSize, textScale: TEXT_SCALE[textSize], setTextSize }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
};
