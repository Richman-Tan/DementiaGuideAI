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
    expect(read('styles/app.css')).toContain('color: var(--on-primary) !important;');
  });
});

describe('the hover styles', () => {
  const css = read('styles/app.css');
  // One rule for each hover class still in use.
  const rules = [...css.matchAll(/^\.hv(\d)([^{]*)\{([^}]*)\}/gm)];

  it('are exactly the hover classes something still uses', () => {
    // A rule goes when the last control using it has moved to the component
    // layer, and a class with no rule would do nothing: neither can linger.
    const used = new Set();
    for (const file of sources()) {
      for (const [, n] of readFileSync(file, 'utf8').matchAll(/className="hv(\d)"/g)) used.add(n);
    }
    expect(rules.map((r) => r[1])).toEqual([...used].sort());
    expect(used.size).toBeGreaterThan(0);
    // The eased transition names the same classes.
    const eased = css.match(/:is\(([^)]*)\) \{\s*transition:/)[1];
    expect(eased.match(/\d/g)).toEqual([...used].sort());
  });

  it('are !important, because the controls carry their resting colours inline', () => {
    // An inline style beats any stylesheet rule that is not. Without it these
    // rules did nothing at all.
    for (const [, n, , body] of rules) {
      const declarations = body
        .split(';')
        .map((d) => d.trim())
        .filter(Boolean);
      expect(declarations.length, `hv${n}`).toBeGreaterThan(0);
      for (const declaration of declarations) {
        expect(declaration, `hv${n}`).toMatch(/ !important$/);
      }
    }
  });

  it('leave a disabled control alone', () => {
    for (const [, n, selector] of rules) {
      expect(selector, `hv${n}`).toContain(":not(:disabled, [aria-disabled='true']):hover");
    }
  });

  it('use only the design tokens', () => {
    for (const [, n, , body] of rules) {
      expect(body, `hv${n}`).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    }
  });
});
