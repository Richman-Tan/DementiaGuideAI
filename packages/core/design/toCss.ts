// The web stylesheet for the design tokens, as text. `npm run tokens -w
// apps/web` writes it to apps/web/src/styles/tokens.generated.css, and a test
// fails if that file is not what this produces.
//
// The colour variables keep the short names the screens already use (--text2,
// --primary-d, --amber-bd), so nothing has to be renamed to adopt this.
import {
  borderWidth,
  dark,
  fontSize,
  highContrast,
  light,
  motion,
  radius,
  space,
  touchTarget,
} from './tokens.ts';
import type { Palette } from './tokens.ts';

const COLOUR_VARIABLE: Record<keyof Palette, string> = {
  bg: '--bg',
  surface: '--surface',
  elevated: '--elev',
  primary: '--primary',
  primaryLight: '--primary-l',
  primaryDark: '--primary-d',
  onPrimary: '--on-primary',
  tint: '--tint',
  text: '--text',
  textMuted: '--text2',
  border: '--border',
  amber: '--amber',
  amberBg: '--amber-bg',
  amberBorder: '--amber-bd',
  shadow: '--shadow',
};

const colours = (palette: Partial<Palette>) =>
  (Object.keys(palette) as (keyof Palette)[]).map(
    (key) => `${COLOUR_VARIABLE[key]}: ${palette[key]};`
  );

const scale = (prefix: string, values: Record<string, string>) =>
  Object.entries(values).map(([name, value]) => `--${prefix}-${name}: ${value};`);

const rule = (selector: string, declarations: string[]) =>
  `${selector} {\n${declarations.map((d) => `  ${d}`).join('\n')}\n}`;

export function tokensToCss(): string {
  return `${[
    '/* Generated from packages/core/design/tokens.ts by `npm run tokens -w apps/web`.\n   Do not edit: change the tokens and run it again. */',
    rule(':root', [
      ...colours(light),
      `--bw: ${borderWidth.normal};`,
      ...scale('space', space),
      ...scale('radius', radius),
      ...scale('font', fontSize),
      `--dur-fast: ${motion.fast};`,
      `--dur-base: ${motion.base};`,
      `--dur-slow: ${motion.slow};`,
      `--ease: ${motion.easing};`,
      `--touch: ${touchTarget};`,
    ]),
    rule("html[data-theme='dark']", colours(dark)),
    rule("html[data-hc='1']", [
      `--bw: ${borderWidth.highContrast};`,
      ...colours(highContrast.light),
    ]),
    rule("html[data-hc='1'][data-theme='dark']", colours(highContrast.dark)),
  ].join('\n')}\n`;
}
