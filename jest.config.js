module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['**/*.test.{js,jsx,ts,tsx}'],
  // web/ has its own vitest suite (cd web && npm test) — its tests import
  // 'vitest', which the root Jest run can't resolve.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/web/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg))',
  ],
};
