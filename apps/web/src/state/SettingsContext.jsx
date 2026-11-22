// Settings store with the prototype's exact semantics: localStorage `dg_settings`,
// theme applied via <html data-theme/data-hc> + root font-size = 17px * textScale.
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

const DEFAULTS = {
  onboarded: false,
  setupType: 'caring',
  supportLevel: 'somewhat',
  ariaStyle: 'warm',
  responseStyle: 'balanced',
  jargon: 'plain',
  communication: 'both',
  voiceSpeed: 'normal',
  textScale: 1,
  darkMode: null, // null = follow system
  highContrast: false,
  subtitles: true,
  showAvatar: true,
  audioResponses: true,
  autoPlay: true,
  concise: false,
  handsFree: false,
  fasterVoice: false,
  avatarId: 'aaron', // web roster: aaron | ariana (an unknown stored id resolves to aaron)
};

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem('dg_settings') || '{}');
    return Object.assign({}, DEFAULTS, stored);
  } catch {
    return { ...DEFAULTS };
  }
}

const SettingsCtx = createContext(null);

export function isSystemDark() {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(load);

  const effDark = settings.darkMode === null ? isSystemDark() : !!settings.darkMode;

  useEffect(() => {
    const d = document.documentElement;
    d.dataset.theme = effDark ? 'dark' : 'light';
    d.dataset.hc = settings.highContrast ? '1' : '0';
    d.style.fontSize = 17 * settings.textScale + 'px';
  }, [effDark, settings.highContrast, settings.textScale]);

  const setMany = useCallback((obj) => {
    setSettings((prev) => {
      const next = { ...prev, ...obj };
      try {
        localStorage.setItem('dg_settings', JSON.stringify(next));
      } catch {
        /* full/blocked */
      }
      return next;
    });
  }, []);
  const setSetting = useCallback((k, v) => setMany({ [k]: v }), [setMany]);

  return (
    <SettingsCtx.Provider value={{ settings, setSetting, setMany, effDark }}>
      {children}
    </SettingsCtx.Provider>
  );
}

export const useSettings = () => useContext(SettingsCtx);
