// Shared config for both test projects below.
const shared = {
  preset: 'ts-jest',
  maxWorkers: '50%',
  workerIdleMemoryLimit: '512MB',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.css$': '<rootDir>/__mocks__/styleMock.js',
    // `server-only` / `client-only` are Next.js bundler marker modules with no
    // runtime package to resolve. In jest they are harmless no-ops.
    '^server-only$': '<rootDir>/__mocks__/empty.js',
    '^client-only$': '<rootDir>/__mocks__/empty.js',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/', '<rootDir>/tests/integration/'],
  // next-intl and its ICU message-formatting dependency chain (use-intl,
  // intl-messageformat, icu-minify, the @formatjs/* and @schummar/* packages)
  // ship ESM-only builds. Let ts-jest transpile those too, instead of the
  // default of skipping all of node_modules, so `require`-based Jest can load them.
  transformIgnorePatterns: [
    '<rootDir>/node_modules/(?!(next-intl|use-intl|intl-messageformat|icu-minify|@formatjs|@schummar)/)',
  ],
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': ['ts-jest', {
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
      testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/packages/*/src/**/*.test.ts'],
    },
    {
      ...shared,
      displayName: 'jsdom',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/src/**/*.test.tsx', '<rootDir>/packages/*/src/**/*.test.tsx'],
    },
  ],
};
