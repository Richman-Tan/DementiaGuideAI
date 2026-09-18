// Coverage-only Jest config. `npx jest -c jest.coverage.config.js --coverage`.
//
// Why a second config: babel-plugin-istanbul refuses to instrument any file
// outside Jest's rootDir (test-exclude treats a `../` relative path as
// excluded), so with rootDir = apps/mobile the packages/core and scripts/
// suites run but report 0% for the code they exercise. Re-rooting at the
// monorepo top for the coverage run puts every instrumented tree under cwd.
// Everything else is derived from jest.config.js so the two cannot drift.
// Nothing here gates: no thresholds, and `npm test` does not use this file.
const path = require('node:path');
const base = require('./jest.config.js');

const here = __dirname; // apps/mobile

module.exports = {
  ...base,
  rootDir: path.resolve(here, '../..'),
  roots: ['<rootDir>/apps/mobile', '<rootDir>/packages/core', '<rootDir>/scripts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/apps/mobile/src/$1',
    '^@core/(.*)$': '<rootDir>/packages/core/$1',
    '^@assets/(.*)$': '<rootDir>/assets/$1',
  },
  // babel-jest resolves babel.config.js from rootDir, which is now the repo
  // root where there is none — point it at the mobile one explicitly.
  transform: {
    '\\.[jt]sx?$': [
      'babel-jest',
      { configFile: path.join(here, 'babel.config.js'), caller: { name: 'metro', bundler: 'metro', platform: 'ios' } },
    ],
  },
  coverageProvider: 'v8',
  coverageDirectory: '<rootDir>/apps/mobile/coverage',
  coverageReporters: ['json-summary', 'text-summary'],
  collectCoverageFrom: [
    'packages/core/**/*.{js,mjs,ts}',
    'scripts/eval/lib/**/*.{js,mjs}',
    'scripts/ingest/**/*.{js,mjs}',
    'apps/mobile/src/lib/**/*.{js,jsx,ts,tsx}',
    'apps/mobile/src/features/**/*.{js,jsx,ts,tsx}',
    '!**/*.test.*',
    '!**/node_modules/**',
  ],
};
