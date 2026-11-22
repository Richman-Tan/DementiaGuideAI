// The coverage gate's instrumentation has to read every dialect the repo is
// written in. TypeScript used to be skipped, so a .ts file was measured only by
// the mobile Jest run and never by the web unit or end-to-end runs. These pin
// the parser chosen for each kind of file.
import { describe, it, expect } from 'vitest';
import { instrumenterFor, isInstrumented, COVERAGE_VARIABLE } from '../../../scripts/test/istanbul-pre-plugin.mjs';

const ROOT = '/repo';
const DIRS = ['apps/web/src/', 'packages/core/'];

function instrument(file, code) {
  const inst = instrumenterFor(file);
  const out = inst.instrumentSync(code, file);
  const coverage = inst.lastFileCoverage();
  return { out, functions: Object.values(coverage.fnMap).map((f) => f.name), statements: Object.keys(coverage.statementMap).length };
}

describe('instrumenterFor', () => {
  it('measures TypeScript, leaving the types for the build to strip', () => {
    const { out, functions, statements } = instrument('/repo/packages/core/rag/rank.ts', `
      interface Chunk { id: string; score: number }
      export function best(chunks: Chunk[]): Chunk | undefined {
        const sorted = [...chunks].sort((a, b) => b.score - a.score);
        return sorted[0];
      }
    `);
    expect(out).toContain(COVERAGE_VARIABLE);
    expect(out).toContain('interface Chunk');
    expect(functions).toContain('best');
    expect(statements).toBeGreaterThanOrEqual(3);
  });

  it('parses an angle-bracket assertion in .ts, which the JSX parser reads as an element', () => {
    const code = 'export const asCount = (value: unknown) => <number>value;';
    expect(instrument('/repo/packages/core/asCount.ts', code).statements).toBeGreaterThan(0);
    // The same text under the .tsx dialect is a syntax error: the reason the
    // two cannot share one instrumenter.
    expect(() => instrument('/repo/apps/web/src/asCount.tsx', code)).toThrow();
  });

  it('parses a generic arrow in .ts', () => {
    const code = 'export const first = <T>(xs: T[]): T | undefined => xs[0];';
    expect(instrument('/repo/packages/core/first.ts', code).statements).toBeGreaterThan(0);
  });

  it('measures TSX', () => {
    const { functions } = instrument('/repo/apps/web/src/ui/Tag.tsx', `
      export function Tag({ label }: { label: string }) {
        return <b>{label}</b>;
      }
    `);
    expect(functions).toContain('Tag');
  });

  it('still measures JSX in .js and .jsx files', () => {
    const code = 'export function Dot() { return <i />; }';
    expect(instrument('/repo/apps/web/src/Dot.jsx', code).functions).toContain('Dot');
    expect(instrument('/repo/apps/web/src/Dot.js', code).functions).toContain('Dot');
  });

  it('keeps one instrumenter per dialect', () => {
    expect(instrumenterFor('a.js')).toBe(instrumenterFor('b.jsx'));
    expect(instrumenterFor('a.mjs')).toBe(instrumenterFor('b.js'));
    expect(instrumenterFor('a.ts')).toBe(instrumenterFor('b.mts'));
    expect(instrumenterFor('a.ts')).not.toBe(instrumenterFor('a.tsx'));
    expect(instrumenterFor('a.ts')).not.toBe(instrumenterFor('a.js'));
  });

  it('does not measure type declarations or files that are not code', () => {
    for (const file of ['types.d.ts', 'types.d.mts', 'tokens.css', 'data.json', 'README.md']) {
      expect(instrumenterFor(file)).toBeNull();
    }
  });
});

describe('isInstrumented', () => {
  it('accepts source in the measured directories, in every dialect', () => {
    for (const file of [
      'apps/web/src/state/router.js',
      'apps/web/src/screens/Chat.jsx',
      'apps/web/src/ui/Button.tsx',
      'packages/core/rag/pipeline.ts',
      'packages/core/study/config.mjs',
      'packages/core/voice/turn.mts',
    ]) {
      expect(isInstrumented(`${ROOT}/${file}`, ROOT, DIRS)).toBe(true);
    }
  });

  it('rejects tests, declarations, dependencies and files outside the measured directories', () => {
    for (const file of [
      'packages/core/rag/pipeline.test.ts',
      'apps/web/src/screens/Chat.spec.jsx',
      'packages/core/rag/types.d.ts',
      'apps/web/src/node_modules/pkg/index.js',
      'apps/web/src/styles/tokens.css',
      'apps/api/api/turn.ts',
      'scripts/eval/lib.mjs',
    ]) {
      expect(isInstrumented(`${ROOT}/${file}`, ROOT, DIRS)).toBe(false);
    }
  });
});
