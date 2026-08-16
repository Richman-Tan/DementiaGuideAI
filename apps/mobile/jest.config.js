module.exports = {
  preset: 'jest-expo',
  // packages/core and scripts/ now sit outside rootDir, so they have to be named
  // as roots of their own or Jest never collects their tests.
  roots: ['<rootDir>', '<rootDir>/../../packages/core', '<rootDir>/../../scripts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@core/(.*)$': '<rootDir>/../../packages/core/$1',
    // Binary models. Nothing imports these under Jest today, but the alias is
    // declared on every other surface — leaving it out here means the first test
    // that mounts VoiceScreen fails on a missing module rather than on its logic.
    '^@assets/(.*)$': '<rootDir>/../../assets/$1',
  },
  testMatch: ['**/*.test.{js,jsx,ts,tsx}'],
  testPathIgnorePatterns: ['/node_modules/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg))',
  ],
};
