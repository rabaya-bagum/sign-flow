// Integration tests against the local Supabase stack (`npm run db:start`). Not part of `npm test`.
// Plain Node (real fetch) rather than the React Native preset.
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/integration'],
  testTimeout: 60_000,
  transform: {
    '^.+\\.[jt]sx?$': [
      'babel-jest',
      { presets: [require.resolve('babel-preset-expo', { paths: [require.resolve('expo')] })] },
    ],
  },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1', '^@shared/(.*)$': '<rootDir>/shared/$1' },
};
