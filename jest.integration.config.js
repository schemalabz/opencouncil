module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
    setupFilesAfterEnv: ['<rootDir>/tests/setup-integration.ts'],
    maxWorkers: 1,
    // Prevent Jest from scanning large build directories
    modulePathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
    testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
    moduleNameMapper: {
        '^@/auth$': '<rootDir>/tests/mocks/auth.ts',
        '^@/env.mjs$': '<rootDir>/tests/mocks/env.ts',
        '^@/lib/notifications/content$': '<rootDir>/tests/mocks/notificationsContent.ts',
        '^@/lib/notifications/welcome$': '<rootDir>/tests/mocks/notificationsWelcome.ts',
        '^@/lib/discord$': '<rootDir>/tests/mocks/discord.ts',
        '^@/lib/cities$': '<rootDir>/tests/mocks/cities.ts',
        '^@/(.*)$': '<rootDir>/src/$1',
    },
    transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', {
            tsconfig: 'tsconfig.json',
        }],
    },
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    testTimeout: 180000,
};


