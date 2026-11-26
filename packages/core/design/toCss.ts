// The web stylesheet for the design tokens, as text. `npm run tokens -w
// apps/web` writes it to apps/web/src/styles/tokens.generated.css, and a test
// fails if that file is not what this produces.
//
// The colour variables keep the short names the screens already use (--text2,
// --primary-d, --amber-bd), so nothing has to be renamed to adopt this.
//
// `tokensToTailwindTheme` is the same tokens as a Tailwind theme, so a utility
// class can only name a colour, a space or a radius that is a token.
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

const kebab = (name: string) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/**
 * The one spacing unit Tailwind multiplies: `p-5` is five of them. That only
 * matches the tokens while every step is its number times the first, so this
 * refuses a scale where one is not.
 */
export function spacingUnit(scale: { 1: string; [step: string]: string } = space): string {
  const unit = Number.parseInt(scale[1], 10);
  for (const [name, value] of Object.entries(scale)) {
    if (Number.parseInt(value, 10) !== unit * Number(name)) {
      throw new Error(`space.${name} is ${value}, not ${name} × ${scale[1]}`);
    }
  }
  return scale[1];
}

/**
 * The tokens as a Tailwind theme: what `bg-primary`, `px-5` and `rounded-md`
 * mean. Written to apps/web/src/styles/theme.generated.css.
 *
 * Colours point at the variables above, not at fixed values, so one class
 * follows the light, dark and high-contrast themes. Tailwind's own palette,
 * radii and type sizes are cleared first: a class for a colour or a size that
 * is not a token produces nothing.
 */
export function tokensToTailwindTheme(): string {
  const colourNames = (Object.keys(light) as (keyof Palette)[]).filter((key) => key !== 'shadow');
  return `${[
    '/* Generated from packages/core/design/tokens.ts by `npm run tokens -w apps/web`.\n   Do not edit: change the tokens and run it again. */',
    rule('@theme inline', [
      '--color-*: initial;',
      ...colourNames.map((key) => `--color-${kebab(key)}: var(${COLOUR_VARIABLE[key]});`),
      `--shadow-card: var(${COLOUR_VARIABLE.shadow});`,
      `--spacing: ${spacingUnit()};`,
      '--radius-*: initial;',
      ...scale('radius', radius),
      '--text-*: initial;',
      ...scale('text', fontSize),
      `--default-transition-duration: ${motion.fast};`,
      `--default-transition-timing-function: ${motion.easing};`,
    ]),
  ].join('\n')}\n`;
}
