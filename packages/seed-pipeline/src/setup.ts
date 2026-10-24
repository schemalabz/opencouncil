import { fetchArtifact } from './fetch';
import { assertRestoreTools, deployMigrations, restoreArchive } from './restore';
import { withClient } from './catalog';
import { assertLocalTarget } from './target-guard';

export type SetupOutcome = { how: 'migrated' } | { how: 'restored'; tarPath: string };

export type SetupOptions = {
    databaseUrl: string;
    /** As `seed fetch --from`: an archive, a directory, or the base URL of a published artifact. */
    from: string;
    schemaPath: string;
    cacheDir: string;
    /** Host names that the caller knows are local; see parseLocalTarget. */
    trustedHosts: readonly string[];
    log: (line: string) => void;
};

async function hasMigrationsTable(databaseUrl: string): Promise<boolean> {
    return withClient(databaseUrl, async (client) =>
        (await client.query<{ present: boolean }>(`SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present`)).rows[0].present);
}

/** The Serbian review city is a demo city that the fixtures add, so its meeting does not count. */
async function countSupportedMeetings(databaseUrl: string): Promise<number> {
    return withClient(databaseUrl, async (client) =>
        (await client.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM "CouncilMeeting" m JOIN "City" c ON c.id = m."cityId" WHERE c.status = 'supported'`,
        )).rows[0].n);
}

/**
 * The first-run step of every development setup (Nix, Docker, and npm on its
 * own), behind `npm run db:deploy:seed`.
 *
 * A database with migrations keeps its data and gets the new migrations. When it
 * has no meetings in a supported city (for example a database that `prisma migrate` made, or one that
 * the old seed filled with cities only), the run says how to load the artifact:
 * `reset` replaces data, so setup does not run it on its own. An empty database
 * gets the published seed artifact, which is the only source of development
 * data. When the artifact cannot load (missing or wrong client tools, no
 * download, or an artifact from a newer main than the checkout), the run stops
 * and says what to do. A restore that fails leaves the database empty, so the
 * next run starts again from the beginning. A migration that fails leaves the
 * artifact in place, and the error names the way out (see deployMigrations).
 */
export async function setupDatabase(o: SetupOptions): Promise<SetupOutcome> {
    // Here, not only in the CLI: every caller of this library gets the refusal.
    assertLocalTarget(o.databaseUrl, o.trustedHosts);
    if (await hasMigrationsTable(o.databaseUrl)) {
        await deployMigrations(o.databaseUrl, o.schemaPath);
        if ((await countSupportedMeetings(o.databaseUrl)) === 0) {
            o.log('this database has migrations but no meetings in a supported city: `npm run seed -- reset` replaces it with the seed artifact');
        }
        return { how: 'migrated' };
    }
    // Before the download, so a machine that cannot restore learns it at once.
    await assertRestoreTools();
    const tarPath = await fetchArtifact({ from: o.from, kind: 'subset', cacheDir: o.cacheDir, log: o.log });
    await restoreArchive({ tarPath, databaseUrl: o.databaseUrl, schemaPath: o.schemaPath, trustedHosts: o.trustedHosts, log: o.log });
    return { how: 'restored', tarPath };
}
