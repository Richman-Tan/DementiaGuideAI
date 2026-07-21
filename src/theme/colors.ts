export const Colors = {
  // Primary palette
  primary: '#4A7C8E',
  primaryLight: '#6A9BAD',
  primaryDark: '#2D5F70',
  primaryMuted: '#EBF3F6',

  // Secondary - sage green
  secondary: '#7FB5A0',
  secondaryLight: '#9ECABB',
  secondaryDark: '#5D9381',
  secondaryMuted: '#EEF7F4',

  // Accent - warm peach
  accent: '#E8956D',
  accentLight: '#F0B08F',
  accentDark: '#C97548',
  accentMuted: '#FDF0E8',

  // Neutrals
  background: '#F7F5F2',
  surface: '#FFFFFF',
  surfaceElevated: '#FAFAFA',
  border: '#E4E8ED',
  borderLight: '#F0F2F5',

  // Text
  textPrimary: '#1E2D3D',
  textSecondary: '#5A6B7A',
  textTertiary: '#8FA0AE',
  textInverse: '#FFFFFF',

  // Semantic
  success: '#6BAE8A',
  successMuted: '#EDF7F2',
  warning: '#F0C070',
  warningMuted: '#FDF8EC',
  error: '#D97B7B',
  errorMuted: '#FDEEED',
  info: '#7BAFD4',
  infoMuted: '#EDF4FA',

  // Avatar specific
  avatarGlow: 'rgba(74, 124, 142, 0.15)',
  avatarRing: 'rgba(74, 124, 142, 0.3)',
  voiceActive: '#4A7C8E',
  voiceInactive: '#C5D5DC',

  // Tab bar
  tabActive: '#4A7C8E',
  tabInactive: '#A0B3BC',
  tabBackground: '#FFFFFF',

  // Overlays
  overlay: 'rgba(30, 45, 61, 0.5)',
  overlayLight: 'rgba(30, 45, 61, 0.15)',

  // Gradient stops
  gradientStart: '#4A7C8E',
  gradientMid: '#6A9BAD',
  gradientEnd: '#7FB5A0',

  // Card shadows
  shadowColor: '#1E2D3D',
};

/** Shape shared by every theme variant. */
export type ColorScheme = typeof Colors;

const DarkColors: ColorScheme = {
  primary: '#5C9CB0',
  primaryLight: '#7AB8CA',
  primaryDark: '#3D7D90',
  primaryMuted: '#0F2535',

  secondary: '#82BBA8',
  secondaryLight: '#A0D0BC',
  secondaryDark: '#60998A',
  secondaryMuted: '#0C2520',

  accent: '#EB9E7A',
  accentLight: '#F5B898',
  accentDark: '#C87D58',
  accentMuted: '#321508',

  background: '#111820',
  surface: '#1C2532',
  surfaceElevated: '#222E3D',
  border: '#2A3A4D',
  borderLight: '#1E2D3C',

  textPrimary: '#E6EDF4',
  textSecondary: '#9EB8C8',
  textTertiary: '#637D8E',
  textInverse: '#111820',

  success: '#7BC49A',
  successMuted: '#0D2820',
  warning: '#F0C070',
  warningMuted: '#2C2000',
  error: '#E8847A',
  errorMuted: '#321010',
  info: '#7BAFD4',
  infoMuted: '#0D2030',

  avatarGlow: 'rgba(92, 156, 176, 0.25)',
  avatarRing: 'rgba(92, 156, 176, 0.4)',
  voiceActive: '#5C9CB0',
  voiceInactive: '#2A3A4D',

  tabActive: '#5C9CB0',
  tabInactive: '#507080',
  tabBackground: '#1C2532',

  overlay: 'rgba(0, 0, 0, 0.65)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',

  gradientStart: '#5C9CB0',
  gradientMid: '#7AB8CA',
  gradientEnd: '#82BBA8',

  shadowColor: '#000000',
};

const HighContrastColors: ColorScheme = {
  ...Colors,
  textPrimary: '#000000',
  textSecondary: '#1A1A1A',
  textTertiary: '#404040',
  border: '#707070',
  borderLight: '#A0A0A0',
  background: '#F0EDE8',
  primary: '#1D5F75',
  primaryDark: '#0A3A4A',
  primaryMuted: '#D0E8F0',
};

const DarkHighContrastColors: ColorScheme = {
  ...DarkColors,
  textPrimary: '#FFFFFF',
  textSecondary: '#D0E8F5',
  textTertiary: '#90B5C8',
  border: '#507090',
  primary: '#7DCCEC',
  primaryLight: '#9ADDF5',
};

export function getThemeColors(darkMode = false, highContrast = false): ColorScheme {
  if (darkMode && highContrast) return DarkHighContrastColors;
  if (darkMode) return DarkColors;
  if (highContrast) return HighContrastColors;
  return Colors;
}
