import { Platform } from 'react-native';

export const FontFamily = {
  regular: Platform.select({ ios: 'System', android: 'Roboto' }),
  medium: Platform.select({ ios: 'System', android: 'Roboto-Medium' }),
  semibold: Platform.select({ ios: 'System', android: 'Roboto-Medium' }),
  bold: Platform.select({ ios: 'System', android: 'Roboto-Bold' }),
};

export const FontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  md: 18,
  lg: 20,
  xl: 24,
  xxl: 28,
  xxxl: 34,
  display: 40,
};

export const LineHeight = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.7,
  loose: 2.0,
};

export const Typography = {
  displayLarge: {
    fontSize: FontSize.display,
    fontWeight: '700',
    lineHeight: FontSize.display * 1.2,
    letterSpacing: -0.5,
  },
  displayMedium: {
    fontSize: FontSize.xxxl,
    fontWeight: '700',
    lineHeight: FontSize.xxxl * 1.2,
    letterSpacing: -0.3,
  },
  headlineLarge: {
    fontSize: FontSize.xxl,
    fontWeight: '600',
    lineHeight: FontSize.xxl * 1.3,
    letterSpacing: -0.2,
  },
  headlineMedium: {
    fontSize: FontSize.xl,
    fontWeight: '600',
    lineHeight: FontSize.xl * 1.3,
  },
  titleLarge: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    lineHeight: FontSize.lg * 1.4,
  },
  titleMedium: {
    fontSize: FontSize.md,
    fontWeight: '600',
    lineHeight: FontSize.md * 1.4,
  },
  bodyLarge: {
    fontSize: FontSize.md,
    fontWeight: '400',
    lineHeight: FontSize.md * 1.6,
  },
  bodyMedium: {
    fontSize: FontSize.base,
    fontWeight: '400',
    lineHeight: FontSize.base * 1.6,
  },
  bodySmall: {
    fontSize: FontSize.sm,
    fontWeight: '400',
    lineHeight: FontSize.sm * 1.5,
  },
  labelLarge: {
    fontSize: FontSize.base,
    fontWeight: '600',
    lineHeight: FontSize.base * 1.4,
    letterSpacing: 0.1,
  },
  labelMedium: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    lineHeight: FontSize.sm * 1.4,
    letterSpacing: 0.2,
  },
  labelSmall: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    lineHeight: FontSize.xs * 1.4,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
};
