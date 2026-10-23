module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
    setupFilesAfterEnv: ['<rootDir>/tests/setup-integration.ts'],
    maxWorkers: '50%',
    // Prevent Jest from scanning large build directories
    modulePathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/', '<rootDir>/.claude/'],
    testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/', '<rootDir>/.claude/'],
    moduleNameMapper: {
        // Next.js bundler marker modules with no runtime content — same
        // mapping as jest.config.js.
        '^server-only$': '<rootDir>/__mocks__/empty.js',
        '^client-only$': '<rootDir>/__mocks__/empty.js',
        '^@/auth$': '<rootDir>/tests/mocks/auth.ts',
        '^@/env.mjs$': '<rootDir>/tests/mocks/env.ts',
        '^@/lib/email/resend$': '<rootDir>/tests/mocks/emailResend.ts',
        '^@/lib/notifications/content$': '<rootDir>/tests/mocks/notificationsContent.ts',
        '^@/lib/notifications/welcome$': '<rootDir>/tests/mocks/notificationsWelcome.ts',
        '^@/lib/discord$': '<rootDir>/tests/mocks/discord.ts',
        '^@/lib/cities$': '<rootDir>/tests/mocks/cities.ts',
        '^next-intl/server$': '<rootDir>/tests/mocks/nextIntlServer.ts',
        '^@/(.*)$': '<rootDir>/src/$1',
    },
    // @auth/prisma-adapter and the ICU formatting chain (intl-messageformat,
    // icu-minify, the @formatjs/* and @schummar/* packages, as in jest.config.js)
    // are ESM-only, so requiring them from the CommonJS test runner fails. The poll
    // request renders the conventions text through intl-messageformat, so every
    // suite that loads pollDecisions needs it. Transform just these packages;
    // everything else in node_modules stays untransformed.
    //
    // gaxios (the HTTP client of the Google API clients) loads node-fetch with a dynamic
    // import(), which the CommonJS runner rejects without
    // --experimental-vm-modules. Transforming gaxios turns that import() into a
    // require(). node-fetch and its dependencies are ESM-only. gaxios can sit
    // under googleapis-common, so that prefix is allowed too.
    transformIgnorePatterns: ['/node_modules/(?!(googleapis-common/node_modules/)?(@auth/prisma-adapter|intl-messageformat|icu-minify|@formatjs|@schummar|gaxios|node-fetch|fetch-blob|formdata-polyfill|data-uri-to-buffer|node-domexception)/)'],
    transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', {
            tsconfig: 'tsconfig.json',
            isolatedModules: true,
        }],
        '^.+\\.js$': ['ts-jest', {
            tsconfig: { allowJs: true, module: 'commonjs', target: 'es2022' },
            isolatedModules: true,
        }],
    },
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    testTimeout: 180000,
};


