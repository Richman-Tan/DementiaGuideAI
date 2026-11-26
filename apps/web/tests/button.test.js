// The Button component (src/components/ui/Button.jsx): what it renders, and
// that every class it uses is one Tailwind can make from the design tokens.
//
// How it looks in a browser, hover included, is checked in e2e/hover.spec.js.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Button, SIZES, VARIANTS } from '../src/components/ui/Button.jsx';
import { spacingUnit, tokensToTailwindTheme } from '@core/design/toCss.ts';
import { fontSize, space, touchTarget } from '@core/design/tokens.ts';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const render = (props, children = 'Save') =>
  renderToStaticMarkup(React.createElement(Button, props, children));
const classesOf = (html) => html.match(/class="([^"]*)"/)[1].split(' ');

describe('what it renders', () => {
  it('is a button that does not submit a form it happens to be in', () => {
    expect(render({})).toMatch(/^<button type="button" class="[^"]+">Save<\/button>$/);
  });

  it('can be told to submit', () => {
    expect(render({ type: 'submit' })).toContain('type="submit"');
  });

  it('is a link when given somewhere to go, and passes the link attributes on', () => {
    const html = render({ href: 'https://example.org/', target: '_blank', rel: 'noopener' });
    expect(html).toMatch(/^<a href="https:\/\/example\.org\/" class="[^"]+"/);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener"');
    expect(html).not.toContain('type=');
  });

  it('passes on what it does not use itself: a name, a disabled state', () => {
    const html = render({ 'aria-label': 'Close preview', disabled: true });
    expect(html).toContain('aria-label="Close preview"');
    expect(html).toContain('disabled=""');
  });
});

describe('how it looks', () => {
  it('is primary and medium unless told otherwise', () => {
    const classes = classesOf(render({}));
    expect(classes).toEqual(expect.arrayContaining(['bg-primary', 'text-on-primary']));
    expect(classes).toEqual(
      expect.arrayContaining(['min-h-11', 'rounded-md', 'px-5', 'font-semibold'])
    );
  });

  it('takes the quiet look: no fill and no border until the pointer is on it', () => {
    const classes = classesOf(render({ variant: 'ghost' }));
    expect(classes).toEqual(
      expect.arrayContaining(['bg-transparent', 'border-0', 'text-text-muted'])
    );
    expect(classes).toContain('not-disabled:not-aria-disabled:hover:bg-tint');
  });

  it('takes the secondary look, with the border width high contrast thickens', () => {
    const classes = classesOf(render({ variant: 'secondary' }));
    expect(classes).toEqual(
      expect.arrayContaining(['bg-surface', 'text-text', 'border-border', 'border-(length:--bw)'])
    );
    expect(classes).not.toContain('bg-primary');
  });

  it('is taller, rounder and bolder when large', () => {
    const classes = classesOf(render({ size: 'lg' }));
    expect(classes).toEqual(
      expect.arrayContaining(['min-h-13', 'rounded-lg', 'px-6', 'font-bold'])
    );
    expect(classes).not.toContain('min-h-11');
  });

  it('is square with no side padding when it holds only a glyph', () => {
    expect(classesOf(render({ icon: true }))).toEqual(expect.arrayContaining(['w-11', 'p-0']));
    expect(classesOf(render({ icon: true }))).not.toContain('px-5');
    expect(classesOf(render({ icon: true, size: 'lg' }))).toEqual(
      expect.arrayContaining(['w-13', 'min-h-13', 'p-0'])
    );
  });

  it('never sets one property twice', () => {
    // Two classes for the same property are settled by their order in the
    // stylesheet, not in `className`: a default weight once beat the large
    // size's bold. Each rendering may carry one class of each kind.
    // A class that applies only in some state: `disabled:…`, `aria-disabled:…`, `not-…:hover:…`.
    const STATE = /^(disabled|aria-disabled|not-disabled):/;
    const kinds = [
      /^font-/,
      /^min-h-/,
      /^rounded-/,
      /^bg-/,
      /^text-/,
      /^px-|^p-/,
      /^border-(0|\()/,
    ];
    for (const variant of Object.keys(VARIANTS)) {
      for (const size of Object.keys(SIZES)) {
        for (const icon of [false, true]) {
          const plain = classesOf(render({ variant, size, icon })).filter((c) => !STATE.test(c));
          for (const kind of kinds) {
            expect(plain.filter((c) => kind.test(c)).length, `${variant} ${size} ${kind}`).toBe(1);
          }
        }
      }
    }
  });

  it('adds the classes a screen gives it for where it sits', () => {
    expect(classesOf(render({ className: 'mt-5 self-end' }))).toEqual(
      expect.arrayContaining(['mt-5', 'self-end', 'bg-primary'])
    );
  });

  it('does not light up under the pointer when it cannot be pressed', () => {
    for (const [name, classes] of Object.entries(VARIANTS)) {
      const hover = classes.split(' ').filter((c) => c.includes('hover:'));
      expect(hover.length, name).toBeGreaterThan(0);
      for (const c of hover) expect(c, name).toMatch(/^not-disabled:not-aria-disabled:hover:/);
    }
  });

  it('is never smaller than a finger needs', () => {
    // `min-h-11` is eleven spacing steps; the theme makes a step space[1].
    const px = (classes) => Number(classes.match(/min-h-(\d+)/)[1]) * Number.parseInt(space[1], 10);
    for (const size of Object.values(SIZES)) {
      expect(px(size.shape)).toBeGreaterThanOrEqual(Number.parseInt(touchTarget, 10));
    }
  });
});

describe('the classes it uses', () => {
  const theme = tokensToTailwindTheme();
  const all = [
    ...Object.values(VARIANTS),
    ...Object.values(SIZES).flatMap((size) => Object.values(size)),
  ]
    .join(' ')
    .split(' ');

  it('name only colours that are design tokens', () => {
    const colours = all
      .map((c) => c.split(':').pop())
      .filter((c) => /^(bg|text|border)-[a-z]/.test(c) && !/^border-\(/.test(c))
      .map((c) => c.replace(/^(bg|text|border)-/, ''));
    expect(colours.length).toBeGreaterThan(4);
    // `transparent` is a keyword, not a colour of ours.
    for (const colour of colours.filter((c) => c !== 'transparent')) {
      expect(theme, colour).toContain(`--color-${colour}:`);
    }
  });

  it('name only radii that are design tokens', () => {
    const radii = all
      .filter((c) => c.startsWith('rounded-'))
      .map((c) => c.slice('rounded-'.length));
    expect(radii).toEqual(['md', 'lg']);
    for (const radius of radii) expect(theme).toContain(`--radius-${radius}:`);
  });
});

describe('the Tailwind theme', () => {
  const theme = tokensToTailwindTheme();

  it('is what is committed', () => {
    expect(readFileSync(join(WEB, 'src/styles/theme.generated.css'), 'utf8')).toBe(theme);
  });

  it('clears Tailwind’s own palette, radii and type sizes, so only tokens can be named', () => {
    expect(theme).toContain('--color-*: initial;');
    expect(theme).toContain('--radius-*: initial;');
    expect(theme).toContain('--text-*: initial;');
  });

  it('carries the type scale', () => {
    for (const [name, size] of Object.entries(fontSize)) {
      expect(theme).toContain(`--text-${name}: ${size};`);
    }
  });

  it('points each colour at its variable, so one class follows every theme', () => {
    expect(theme).toContain('--color-primary: var(--primary);');
    expect(theme).toContain('--color-primary-dark: var(--primary-d);');
    expect(theme).toContain('--color-text-muted: var(--text2);');
    expect(theme).toContain('--color-on-primary: var(--on-primary);');
    // The card shadow is a shadow, not a colour.
    expect(theme).not.toContain('--color-shadow');
    expect(theme).toContain('--shadow-card: var(--shadow);');
  });

  it('makes one spacing step the first space token, and uses the fast motion by default', () => {
    expect(theme).toContain(`--spacing: ${space[1]};`);
    expect(theme).toContain('--default-transition-duration: 120ms;');
  });

  it('refuses a spacing scale that Tailwind’s one unit could not reproduce', () => {
    // `p-3` is three units. If space.3 were not three times space.1, the class
    // and the token would disagree without anything saying so.
    expect(spacingUnit()).toBe('4px');
    expect(spacingUnit({ 1: '4px', 2: '8px', 6: '24px' })).toBe('4px');
    expect(() => spacingUnit({ 1: '4px', 3: '10px' })).toThrow('space.3 is 10px, not 3 × 4px');
  });
});

describe('the stylesheets around it', () => {
  const read = (file) => readFileSync(join(WEB, 'src', file), 'utf8');

  it('load Tailwind first, so its layer order is the one in force', () => {
    const imports = read('main.jsx').match(/import '\.\/styles\/[^']+';/g);
    expect(imports[0]).toBe("import './styles/tailwind.css';");
  });

  it('leave out Tailwind’s reset, and read class names from src/ only', () => {
    const css = read('styles/tailwind.css');
    expect(css).toContain('@layer theme, base, components, utilities;');
    expect(css).not.toMatch(/@import 'tailwindcss\/preflight\.css'/);
    expect(css).not.toMatch(/@import 'tailwindcss';/);
    expect(css).toContain("@import 'tailwindcss/utilities.css' layer(utilities) source('..');");
  });

  it('keep the app’s element rules in the base layer, where a class can override them', () => {
    const css = read('styles/tokens.css');
    const layer = css.slice(css.indexOf('@layer base {'), css.indexOf('@keyframes'));
    expect(layer).toContain(':focus-visible {');
    expect(layer).toMatch(/\n {2}a \{/);
    // Nothing that styles an element is left outside it.
    const outside = css.replace(layer, '');
    expect(outside).not.toMatch(/^(html|body|a|button|input|:focus-visible)\b[^{]*\{/m);
  });
});
