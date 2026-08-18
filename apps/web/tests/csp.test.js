// The theme bootstrap in index.html has to run BEFORE first paint, so it stays
// an inline <script> instead of a separate file (an extra render-blocking
// request would partly defeat the point of it). Our CSP has no 'unsafe-inline',
// so that script is allowed by its sha256 hash — and a hash stops matching the
// instant anyone edits the script by even one character.
//
// That failure is invisible where you'd notice it: vite serves no CSP in dev,
// so the script runs fine locally and is silently blocked in production, where
// it surfaces only as a light-mode flash and ignored text-scale settings. This
// test recomputes the hashes and fails the build instead.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(webRoot, 'index.html'), 'utf8');
// Public routing and headers live in the ROOT vercel.json now: under Vercel
// Services they own traffic for the whole deployment, not for one service.
const repoRoot = join(webRoot, '..', '..');
const vercel = JSON.parse(readFileSync(join(repoRoot, 'vercel.json'), 'utf8'));

const csp = (vercel.headers ?? [])
  .flatMap((entry) => entry.headers ?? [])
  .find((h) => h.key === 'Content-Security-Policy')?.value ?? '';

// Scope every assertion to script-src: style-src legitimately allows inline.
const scriptSrc = csp
  .split(';')
  .map((directive) => directive.trim())
  .find((directive) => directive.startsWith('script-src')) ?? '';

// Inline == a <script> with no src attribute. Those are the ones a hash covers.
const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

describe('production CSP covers the inline bootstrap scripts', () => {
  it('defines a script-src directive', () => {
    expect(scriptSrc).not.toBe('');
  });

  it('has at least one inline script to account for', () => {
    expect(inlineScripts.length).toBeGreaterThan(0);
  });

  it("does not fall back to 'unsafe-inline' for scripts", () => {
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  inlineScripts.forEach((source, i) => {
    it(`inline script #${i + 1} is allowed by a sha256 hash`, () => {
      const hash = `'sha256-${createHash('sha256').update(source, 'utf8').digest('base64')}'`;
      expect(
        scriptSrc,
        `index.html inline script #${i + 1} is not allowed by the CSP.\n`
          + `Add ${hash} to script-src in the root vercel.json (replacing the stale hash).`,
      ).toContain(hash);
    });
  });
});
