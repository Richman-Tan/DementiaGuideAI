// https://docs.expo.dev/guides/using-eslint/
const expoConfig = require('eslint-config-expo/flat');
const eslintConfigPrettier = require('eslint-config-prettier');

module.exports = [
  ...expoConfig,
  eslintConfigPrettier,
  {
    // eslint-config-expo only registers the `node` resolver, which knows nothing
    // about our aliases. They used to resolve by accident: `tsconfig.json` sat in
    // the lint cwd, so the TypeScript resolver picked its `paths` up for free.
    // With the app one level down that no longer happens, so both projects are
    // named explicitly — this is what keeps import/no-unresolved honest across
    // apps/mobile, apps/web and packages/core.
    settings: {
      'import/resolver': {
        typescript: {
          project: ['apps/mobile/tsconfig.json', 'apps/web/tsconfig.json'],
        },
      },
    },
  },
  {
    rules: {
      // `@assets/…glb` are Metro/Vite binary assets, not modules — no resolver
      // can follow them, and both bundlers are verified to emit them.
      'import/no-unresolved': ['error', { ignore: ['\\.(glb|gltf|vrm)$'] }],
      // Idiomatic React Native Animated pattern: `useRef(new Animated.Value(0)).current`
      // read in a style prop. The react-compiler ref/immutability rules flag this as a
      // false positive, so we keep them visible as warnings rather than hard errors.
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      // Apostrophes in copy are intentional; escaping hurts readability.
      'react/no-unescaped-entities': 'off',
      // Dev-tools nicety, not a correctness issue; surfaced as a warning.
      'react/display-name': 'error',
      // Same react-compiler family as the three above, and the same situation:
      // pre-existing code the compiler cannot fully analyse. Kept visible as a
      // warning rather than blocking the build.
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
  {
    // Node-context files: build scripts and tool configs. eslint-config-expo
    // loads browser globals, so these need Node's declared explicitly.
    files: ['**/*.config.{js,mjs}', 'apps/web/scripts/**/*.mjs', 'apps/web/vite.config.js'],
    languageOptions: {
      globals: {
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        module: 'writable',
        process: 'readonly',
        require: 'readonly',
      },
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
    // Module-path globals for the CommonJS test surfaces only — a test that
    // reads a fixture off disk needs them, and `require` alone is not enough.
    // Deliberately NOT repo-wide: apps/web is `"type": "module"`, so its tests
    // are ESM where __dirname genuinely does not exist. Declaring it there
    // would silence a real no-undef rather than allow a legitimate one.
    files: ['apps/mobile/**/*.test.{js,jsx}', 'packages/core/**/*.test.{js,jsx}'],
    languageOptions: {
      globals: {
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
  },
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.expo/**',
      // Build output and vendored third-party bundles. `.vercel/output/` is the
      // built site and `public/draco/` + `public/unity/` are decoder/engine
      // blobs — multi-MB single-line files that blow up ESLint's formatter.
      '**/.vercel/**',
      'apps/web/public/**',
      'apps/mobile/ios/**',
      'apps/mobile/android/**',
      'apps/mobile/modules/**',
      'apps/mobile/plugins/**',
      'unity-avatar/**',
      'scripts/**',
    ],
  },
];
