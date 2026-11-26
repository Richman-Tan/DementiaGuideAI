// The web stylesheet for the design tokens (styles/tokens.generated.css) is
// written from packages/core/design/tokens.ts. These tests keep the two in
// step, and keep the screens on the tokens.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokensToCss } from '@core/design/toCss.ts';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (path) => readFileSync(join(SRC, path), 'utf8');

function sources(dir = SRC) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(jsx?|css)$/.test(name) ? [path] : [];
  });
}

describe('the generated stylesheet', () => {
  it('is what the tokens produce (run `npm run tokens -w apps/web` after changing them)', () => {
    expect(read('styles/tokens.generated.css')).toBe(tokensToCss());
  });

  it('is loaded before the base rules that use it', () => {
    const main = read('main.jsx');
    const generated = main.indexOf("import './styles/tokens.generated.css'");
    const base = main.indexOf("import './styles/tokens.css'");
    expect(generated).toBeGreaterThan(-1);
    expect(base).toBeGreaterThan(generated);
  });

  it('is the only place a colour variable is given a value', () => {
    const base = read('styles/tokens.css') + read('styles/app.css');
    expect(base).not.toMatch(/^\s*--[a-z0-9-]+\s*:/m);
  });
});

describe('text on the primary colour', () => {
  it('uses the token everywhere, never a fixed white', () => {
    // White on the dark theme's primary is 3.1:1, and 1.8:1 on its hover colour.
    const offenders = sources()
      .filter((file) => !file.endsWith('tokens.generated.css'))
      .filter((file) => /color:[^\n;]*#fff(fff)?\b/i.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(SRC.length + 1));
    expect(offenders).toEqual([]);
  });

  it('is what the primary hover styles use too', () => {
    expect(read('styles/app.css')).toContain('color: var(--on-primary);');
  });
});
