// UNIT_COVERAGE=1 only (vite.config.js): after each test file, save the
// counters the istanbul pre-plugin (scripts/test/istanbul-pre-plugin.mjs) has
// collected, for scripts/test/coverage-gate.mjs to merge with the e2e runs.
// Counters can accumulate across files in one worker; that only repeats hits,
// which the gate's covered/uncovered verdict does not depend on.
import { afterAll } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

afterAll(() => {
  const cov = globalThis.__coverage__;
  if (!cov) return;
  const dir = path.resolve(import.meta.dirname, '../../.coverage-unit');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${randomUUID()}.json`), JSON.stringify(cov));
});
