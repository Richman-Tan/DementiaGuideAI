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

let instrumenter = null;

/** The shared instrumenter; coverage-gate.mjs uses it to size never-loaded files. */
export function getInstrumenter() {
  if (!instrumenter) {
    instrumenter = createInstrumenter({
      coverageVariable: COVERAGE_VARIABLE,
      esModules: true,
      produceSourceMap: true,
      parserPlugins: [...defaults.instrumenter.parserPlugins, 'jsx'],
    });
  }
  return instrumenter;
}

/** True for a file the gate measures (see coverage-scope.mjs AREAS). */
export function isInstrumented(file, root, dirs) {
  if (!/\.(m?js|jsx)$/.test(file) || file.includes('/node_modules/') || /\.(test|spec)\./.test(file)) return false;
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
      const inst = getInstrumenter();
      const out = inst.instrumentSync(code, file);
      return { code: out, map: inst.lastSourceMap() };
    },
  };
}
