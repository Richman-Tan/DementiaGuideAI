import { contrast, dark, highContrast, light, luminance, touchTarget } from './tokens.ts';
import type { Palette } from './tokens.ts';
import { tokensToCss } from './toCss.ts';

/** WCAG 2 AA: 4.5:1 for text. */
const AA = 4.5;

describe('contrast', () => {
  it('measures the two ends of the scale', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#777777')).toBe(1);
  });
});

describe.each<[string, Palette]>([
  ['light', light],
  ['dark', dark],
  ['light, high contrast', { ...light, ...highContrast.light }],
  ['dark, high contrast', { ...dark, ...highContrast.dark }],
])('the %s theme', (_name, t) => {
  it.each<[string, keyof Palette, keyof Palette]>([
    ['text on the page', 'text', 'bg'],
    ['text on a surface', 'text', 'surface'],
    ['text on a raised surface', 'text', 'elevated'],
    ['text on the selected item', 'text', 'tint'],
    ['secondary text on the page', 'textMuted', 'bg'],
    ['secondary text on a surface', 'textMuted', 'surface'],
    ['secondary text on a raised surface', 'textMuted', 'elevated'],
    ['a primary button', 'onPrimary', 'primary'],
    ['a primary button, hovered', 'onPrimary', 'primaryDark'],
    ['a link on a surface', 'primaryDark', 'surface'],
    ['a link on the page', 'primaryDark', 'bg'],
    ['the selected item’s label', 'primaryDark', 'tint'],
    ['the help callout’s accent', 'amber', 'amberBg'],
    ['text in the help callout', 'text', 'amberBg'],
  ])('%s meets AA', (_use, foreground, background) => {
    expect(contrast(t[foreground], t[background])).toBeGreaterThanOrEqual(AA);
  });
});

describe('what the tokens fixed', () => {
  it('white on the dark theme’s primary would not have passed, which is why onPrimary exists', () => {
    expect(contrast('#ffffff', dark.primary)).toBeLessThan(AA);
    expect(contrast('#ffffff', dark.primaryDark)).toBeLessThan(3);
    expect(dark.onPrimary).not.toBe('#ffffff');
    // The light theme keeps white, which passes there.
    expect(light.onPrimary).toBe('#ffffff');
  });

  it('keeps anything pressable at least 44 pixels', () => {
    expect(parseInt(touchTarget, 10)).toBeGreaterThanOrEqual(44);
  });
});

describe('tokensToCss', () => {
  const css = tokensToCss();

  it('writes each theme under the selector the app switches on', () => {
    expect(css).toContain(':root {\n  --bg: #f7f5f2;');
    expect(css).toContain("html[data-theme='dark'] {\n  --bg: #111820;");
    expect(css).toContain("html[data-hc='1'] {\n  --bw: 2px;\n  --text: #14181b;");
    expect(css).toContain("html[data-hc='1'][data-theme='dark'] {\n  --text: #ffffff;");
  });

  it('keeps the short names the screens already use', () => {
    for (const name of [
      '--text2',
      '--primary-l',
      '--primary-d',
      '--elev',
      '--amber-bd',
      '--bw',
      '--shadow',
    ]) {
      expect(css).toContain(`  ${name}: `);
    }
  });

  it('gives the text-on-primary colour in both themes', () => {
    expect(css).toContain('  --on-primary: #ffffff;');
    expect(css).toContain('  --on-primary: #111820;');
  });

  it('includes the scales: spacing, radius, type, motion and the touch target', () => {
    expect(css).toContain('  --space-4: 16px;');
    expect(css).toContain('  --radius-pill: 999px;');
    expect(css).toContain('  --font-2xl: 1.9rem;');
    expect(css).toContain('  --dur-base: 200ms;');
    expect(css).toContain('  --ease: cubic-bezier(0.2, 0, 0, 1);');
    expect(css).toContain('  --touch: 44px;');
  });

  it('says it is generated, and ends with a newline', () => {
    expect(css.startsWith('/* Generated from packages/core/design/tokens.ts')).toBe(true);
    expect(css.endsWith('}\n')).toBe(true);
  });
});
