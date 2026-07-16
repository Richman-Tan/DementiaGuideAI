// https://docs.expo.dev/guides/using-eslint/
const expoConfig = require('eslint-config-expo/flat');
const eslintConfigPrettier = require('eslint-config-prettier');

module.exports = [
  ...expoConfig,
  eslintConfigPrettier,
  {
    rules: {
      // Idiomatic React Native Animated pattern: `useRef(new Animated.Value(0)).current`
      // read in a style prop. The react-compiler ref/immutability rules flag this as a
      // false positive, so we keep them visible as warnings rather than hard errors.
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      // Apostrophes in copy are intentional; escaping hurts readability.
      'react/no-unescaped-entities': 'off',
      // Dev-tools nicety, not a correctness issue; surfaced as a warning.
      'react/display-name': 'warn',
    },
  },
  {
    // Jest test files (plain JS): declare the test globals so no-undef passes.
    files: ['**/*.test.js', '**/*.test.jsx'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
      },
    },
  },
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.expo/**',
      'ios/**',
      'android/**',
      'unity-avatar/**',
      'scripts/**',
      'modules/**',
      'plugins/**',
    ],
  },
];
