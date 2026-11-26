// The design tokens: the one place the product's colours, spacing, corner
// radii, type sizes and motion are decided.
//
// The web app's stylesheet is generated from this file (toCss.ts), and the
// mobile theme is checked against it, so the two cannot drift apart. The
// colours are also checked here for contrast (tokens.test.ts): a value that
// fails WCAG AA for the use it is put to fails the tests.

/** The colours of one theme. */
export interface Palette {
  /** The page. */
  bg: string;
  /** Cards, panels, inputs. */
  surface: string;
  /** A surface raised off another: a field inside a card. */
  elevated: string;
  primary: string;
  primaryLight: string;
  primaryDark: string;
  /** Text and icons on `primary`, `primaryLight` and `primaryDark`. */
  onPrimary: string;
  /** A wash of the primary colour: the selected item, a hovered row. */
  tint: string;
  text: string;
  /** Secondary text: captions, hints, timestamps. */
  textMuted: string;
  border: string;
  /** The "if you need help now" callout. */
  amber: string;
  amberBg: string;
  amberBorder: string;
  shadow: string;
}

export const light: Palette = {
  bg: '#f7f5f2',
  surface: '#ffffff',
  elevated: '#fafafa',
  primary: '#4a7c8e',
  primaryLight: '#6a9bad',
  primaryDark: '#2d5f70',
  onPrimary: '#ffffff',
  tint: '#ebf3f6',
  text: '#26323a',
  textMuted: '#5c6b74',
  border: '#e4e0da',
  amber: '#8a5a17',
  amberBg: '#fbf3e4',
  amberBorder: '#e8c88a',
  shadow: '0 1px 3px rgba(28, 48, 58, 0.07)',
};

export const dark: Palette = {
  bg: '#111820',
  surface: '#1c2532',
  elevated: '#222e3d',
  primary: '#5c9cb0',
  primaryLight: '#7fb6c8',
  // In the dark theme the "dark" primary is the lighter one: it is what a
  // primary button moves to on hover, and what links use on dark surfaces.
  primaryDark: '#9ccbdb',
  // Dark ink, not white: white on this theme's primary is 3.1:1, and 1.8:1 on
  // its hover colour.
  onPrimary: '#111820',
  tint: '#0f2535',
  text: '#e8edf1',
  textMuted: '#a3b1bb',
  border: '#2e3b4a',
  amber: '#e8b76b',
  amberBg: '#2a2318',
  amberBorder: '#5a4a28',
  shadow: '0 1px 4px rgba(0, 0, 0, 0.4)',
};

/** What the high-contrast setting changes, in each theme. */
export const highContrast: Record<
  'light' | 'dark',
  Pick<Palette, 'text' | 'textMuted' | 'border'>
> = {
  light: { text: '#14181b', textMuted: '#39444b', border: '#6b7378' },
  dark: { text: '#ffffff', textMuted: '#d9e1e7', border: '#93a3af' },
};

export const borderWidth = { normal: '1px', highContrast: '2px' };

/** Spacing, on a 4-pixel grid. */
export const space = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
};

export const radius = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  pill: '999px',
};

/** Type sizes, in rems so they follow the text-size setting. */
export const fontSize = {
  xs: '0.75rem',
  sm: '0.85rem',
  base: '1rem',
  lg: '1.15rem',
  xl: '1.4rem',
  '2xl': '1.9rem',
  '3xl': '2.6rem',
};

export const motion = {
  fast: '120ms',
  base: '200ms',
  slow: '320ms',
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
};

/** The smallest side of anything meant to be pressed. */
export const touchTarget = '44px';

// ─── Contrast ────────────────────────────────────────────────────────────────

const channel = (hex: string, at: number) => {
  const c = parseInt(hex.slice(at, at + 2), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** Relative luminance of a `#rrggbb` colour (WCAG 2). */
export const luminance = (hex: string) =>
  0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);

/** The contrast ratio between two `#rrggbb` colours, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
