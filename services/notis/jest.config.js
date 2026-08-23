/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    // Next.js bundler marker modules with no runtime content; `server-only`
    // throws when imported outside a React Server Component build (jest is a
    // plain Node env), so map both to an empty module.
    '^server-only$': '<rootDir>/tests/mocks/empty.ts',
    '^client-only$': '<rootDir>/tests/mocks/empty.ts',
    '^@/env.mjs$': '<rootDir>/tests/mocks/env.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true }],
  },
};
