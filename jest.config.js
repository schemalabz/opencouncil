// Shared config for both test projects below.
const shared = {
  preset: 'ts-jest',
  maxWorkers: '50%',
  workerIdleMemoryLimit: '512MB',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.css$': '<rootDir>/__mocks__/styleMock.js',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/', '<rootDir>/tests/integration/'],
  // Keep build output and nested git worktrees out of the haste map — copies of
  // the project there otherwise collide as duplicate manual mocks (e.g. styleMock)
  // and break every suite.
  modulePathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/.claude/worktrees/'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.jest.json',
      isolatedModules: true,
    }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
};

// Two projects so server-side tests run under the Node environment, where all
// the Web Platform globals Next.js 16 touches (Request/Response/ReadableStream/
// MessagePort/TextEncoder/…) exist natively. jsdom strips those, and chasing
// them with polyfills is a losing game (each one undici needs reveals another).
// Component tests (.test.tsx) that render React still need jsdom.
module.exports = {
  projects: [
    {
      ...shared,
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/*.test.ts'],
    },
    {
      ...shared,
      displayName: 'jsdom',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/src/**/*.test.tsx'],
    },
  ],
};
