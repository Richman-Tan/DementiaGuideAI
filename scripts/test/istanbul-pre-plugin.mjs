// One coverage instrumentation for every web run, unit and e2e alike.
//
// Why not @vitest/coverage-istanbul plus vite-plugin-istanbul: each instruments
// the code *after* its own transform pipeline (Vitest's server-side rewrite of
// imports; the browser build's JSX and Fast Refresh code), so the two produced
// different statement maps for the same file, and their counts could not be
// summed. This plugin runs first (`enforce: 'pre'`, ahead of every other
// transform) and instruments the untouched source file, so a file has exactly
// one statement map whichever runner loaded it. Counters land in the global
// `__coverage__` (window in the browser, globalThis in Node), from where
// apps/web/e2e/support.js and apps/web/tests/setup/coverageDump.js save them.
import path from 'node:path';
import { createInstrumenter } from 'istanbul-lib-instrument';
import { defaults } from '@istanbuljs/schema';

export const COVERAGE_VARIABLE = '__coverage__';

// One instrumenter per source dialect, because the parser plugins conflict:
// with `jsx` on, a TypeScript angle-bracket assertion (`<Chunk>value`) is read
// as the start of an element and fails to parse, so plain `.ts` has to be
// parsed without it, as TypeScript itself does. TypeScript is instrumented as
// TypeScript (the types are still in the output); the build's own transform
// strips them later.
const DIALECTS = [
  { test: /\.(m?js|jsx)$/, plugins: ['jsx'] },
  { test: /\.tsx$/, plugins: ['typescript', 'jsx'] },
  { test: /\.m?ts$/, plugins: ['typescript'] },
];
const DECLARATION = /\.d\.m?ts$/;

const instrumenters = new Map();

/**
 * The instrumenter for a source file, or null for one that is not measured
 * (type declarations, and anything that is not JavaScript or TypeScript).
 * coverage-gate.mjs also uses it to size files that no test loaded.
 */
export function instrumenterFor(file) {
  if (DECLARATION.test(file)) return null;
  const dialect = DIALECTS.find((d) => d.test.test(file));
  if (!dialect) return null;
  if (!instrumenters.has(dialect)) {
    instrumenters.set(dialect, createInstrumenter({
      coverageVariable: COVERAGE_VARIABLE,
      esModules: true,
      produceSourceMap: true,
      parserPlugins: [...defaults.instrumenter.parserPlugins, ...dialect.plugins],
    }));
  }
  return instrumenters.get(dialect);
}

/** True for a file the gate measures (see coverage-scope.mjs AREAS). */
export function isInstrumented(file, root, dirs) {
  if (!instrumenterFor(file) || file.includes('/node_modules/') || /\.(test|spec)\./.test(file)) return false;
  const rel = path.relative(root, file).split(path.sep).join('/');
  return dirs.some((d) => rel.startsWith(d));
}

/**
 * @param {{ root: string, dirs: string[] }} opts  repo root, and the repo-relative
 *   directories to instrument (e.g. ['apps/web/src/', 'packages/core/']).
 */
export function istanbulPre({ root, dirs }) {
  return {
    name: 'dg-istanbul-pre',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0];
      if (!isInstrumented(file, root, dirs)) return null;
      const inst = instrumenterFor(file);
      const out = inst.instrumentSync(code, file);
      return { code: out, map: inst.lastSourceMap() };
    },
  };
}
