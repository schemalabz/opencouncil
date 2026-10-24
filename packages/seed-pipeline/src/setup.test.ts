import { setupDatabase } from './setup';

describe('setupDatabase', () => {
    // A caller of the library, not only the seed CLI, must get the refusal before any connection.
    test('refuses a remote database before it connects', async () => {
        const run = setupDatabase({
            databaseUrl: 'postgresql://opencouncil@prod.example.invalid:5432/opencouncil',
            from: '/no-artifact',
            schemaPath: 'prisma/schema.prisma',
            cacheDir: '/no-cache',
            trustedHosts: [],
            log: () => undefined,
        });
        await expect(run).rejects.toThrow(/"prod\.example\.invalid" is not a local host/);
    });
});
