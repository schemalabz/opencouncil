/**
 * Seed consumer: load a published seed artifact into a local database, put the
 * fixtures on it, and report what it holds.
 *
 * Usage:
 *   npm run seed -- setup              (`npm run db:deploy:seed` runs `prisma generate` first, then this)
 *   npm run seed -- restore --db postgresql://opencouncil@localhost:5432/opencouncil
 *   npm run seed -- fixtures --db postgresql://opencouncil@localhost:5432/opencouncil
 *   npm run seed -- reset --db postgresql://opencouncil@localhost:5432/opencouncil
 *   npm run seed -- status --db postgresql://opencouncil@localhost:5432/opencouncil --json
 *   npm run seed -- fetch --full --from <the private location of the full set>
 *
 * `--db` defaults to DATABASE_URL, from the environment or else from .env. Every
 * command refuses a database host other than localhost, so a DATABASE_URL that
 * names a remote database stops the run before it connects. In Docker, the
 * entrypoint passes `--trust-host db` for the compose database. `--from` defaults to SEED_ARTIFACT_URL, then to the latest
 * published artifact.
 *
 * This process loads the Prisma client when it starts, so `prisma generate` runs
 * before it (in `db:deploy:seed`), never inside it: the fixtures would use the old client.
 */
import 'dotenv/config';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { ensureTestUsers, listTestUsers, type TestUserState } from '@/lib/db/testUsers';
import { ensureSerbianFixture } from '@/lib/db/serbianFixture';
import { ArtifactUnavailableError, DEFAULT_ARTIFACT_URL, defaultCacheDir, fetchArtifact } from '@opencouncil/seed-pipeline/fetch';
import { restoreArchive } from '@opencouncil/seed-pipeline/restore';
import { setupDatabase } from '@opencouncil/seed-pipeline/setup';
import { assertLocalTarget } from '@opencouncil/seed-pipeline/target-guard';
import { formatError } from '@opencouncil/seed-pipeline/errors';

const CACHE_DIR = defaultCacheDir();
const SCHEMA_PATH = path.join(process.cwd(), 'prisma', 'schema.prisma');

function localDatabase(url: string | undefined, trustedHosts: readonly string[] = []): string {
    if (!url) throw new Error('no database: pass --db or set DATABASE_URL');
    assertLocalTarget(url, trustedHosts);
    return url;
}

const log = (line: string) => console.error(line);

/** The error, plus what to do when the artifact could not be read. */
function explain(error: unknown): string {
    const text = formatError(error);
    if (!(error instanceof ArtifactUnavailableError)) return text;
    return `${text}\ncould not read the seed artifact. Check the network, or pass --from with a local archive, a directory that holds one, or the URL of a release in https://github.com/schemalabz/opencouncil-seed-data/releases`;
}

function fetchFrom(from: string, full: boolean): Promise<string> {
    if (full && from === DEFAULT_ARTIFACT_URL) {
        throw new Error('the public release holds the subset only: pass --from with the private location of the full set');
    }
    return fetchArtifact({ from, kind: full ? 'full' : 'subset', cacheDir: CACHE_DIR, log });
}

/** The fixtures that the artifact cannot carry: the Serbian review city, then the test accounts. */
async function ensureFixtures(db: PrismaClient): Promise<TestUserState[]> {
    await ensureSerbianFixture(db, log);
    return ensureTestUsers(db);
}

async function withPrisma<T>(url: string, fn: (db: PrismaClient) => Promise<T>): Promise<T> {
    const db = new PrismaClient({ datasourceUrl: url });
    try {
        return await fn(db);
    } finally {
        await db.$disconnect();
    }
}

function describeRights(user: TestUserState): string {
    if (user.isSuperAdmin) return 'super admin';
    if (user.administers.length === 0) return 'no admin rights';
    return user.administers
        .map((a) => {
            if (a.city) return `city ${a.cityId}`;
            if (a.party) return `party ${a.party.name} (${a.party.cityId})`;
            if (a.person) return `person ${a.person.name} (${a.person.cityId})`;
            return `body ${a.administrativeBody?.name} (${a.administrativeBody?.cityId})`;
        })
        .join(', ');
}

function report(users: TestUserState[], json: boolean): void {
    if (json) {
        process.stdout.write(JSON.stringify({ testUsers: users }, null, 2) + '\n');
        return;
    }
    for (const user of users) process.stdout.write(`${user.adminType.padEnd(10)} ${user.email.padEnd(22)} ${describeRights(user)}\n`);
}

const dbOption = { type: 'string', default: process.env.DATABASE_URL, defaultDescription: 'DATABASE_URL', describe: 'Local database URL' } as const;
const fromOption = {
    type: 'string',
    default: process.env.SEED_ARTIFACT_URL ?? DEFAULT_ARTIFACT_URL,
    defaultDescription: 'SEED_ARTIFACT_URL, then the latest published artifact',
    describe: 'An archive, a directory that holds one, or the base URL of a published artifact',
} as const;
const fullOption = { type: 'boolean', default: false, describe: 'The full set instead of the subset. The public release holds the subset only' } as const;
const jsonOption = { type: 'boolean', default: false } as const;

yargs(hideBin(process.argv))
    .scriptName('seed')
    .option('trust-host', {
        type: 'string',
        array: true,
        default: [],
        describe: 'A database host name to treat as local, such as db in docker-compose.yml',
    })
    .command('setup', 'First run and every later run: the artifact on an empty database, migrations on one with data, then the fixtures', (y) => y.option('db', dbOption).option('from', fromOption).option('json', jsonOption),
        async (argv) => {
            const databaseUrl = localDatabase(argv.db, argv.trustHost);
            const outcome = await setupDatabase({ databaseUrl, from: argv.from, schemaPath: SCHEMA_PATH, cacheDir: CACHE_DIR, trustedHosts: argv.trustHost, log });
            if (outcome.how === 'restored') log('restored the seed artifact');
            report(await withPrisma(databaseUrl, ensureFixtures), argv.json);
        })
    .command('fetch', 'Download the artifact, check it against its manifest, and print its path', (y) => y.option('from', fromOption).option('full', fullOption),
        async (argv) => console.log(await fetchFrom(argv.from, argv.full)))
    .command('restore', 'Load the artifact into an empty local database and apply migrations', (y) => y.option('db', dbOption).option('from', fromOption).option('full', fullOption),
        async (argv) => {
            const databaseUrl = localDatabase(argv.db, argv.trustHost);
            await restoreArchive({ tarPath: await fetchFrom(argv.from, argv.full), databaseUrl, schemaPath: SCHEMA_PATH, trustedHosts: argv.trustHost, log });
            log('restored; `npm run seed -- fixtures` adds the test accounts');
        })
    .command('reset', 'Replace everything in the local database with the artifact, then add the fixtures', (y) => y.option('db', dbOption).option('from', fromOption).option('full', fullOption).option('json', jsonOption),
        async (argv) => {
            const databaseUrl = localDatabase(argv.db, argv.trustHost);
            // The download and every check come first, and the drop runs inside the
            // restore's transaction: a failed download, check, or restore keeps the
            // database as it was. A branch migration that fails afterwards leaves the
            // artifact in place, and a second reset starts again.
            const tarPath = await fetchFrom(argv.from, argv.full);
            await restoreArchive({ tarPath, databaseUrl, schemaPath: SCHEMA_PATH, trustedHosts: argv.trustHost, log, replace: true });
            report(await withPrisma(databaseUrl, ensureFixtures), argv.json);
        })
    .command('fixtures', 'Add the Serbian review city and the test accounts, or put back what a refresh removed', (y) => y.option('db', dbOption).option('json', jsonOption),
        async (argv) => report(await withPrisma(localDatabase(argv.db, argv.trustHost), ensureFixtures), argv.json))
    .command('status', 'List the test accounts and what each administers', (y) => y.option('db', dbOption).option('json', jsonOption),
        async (argv) => report(await withPrisma(localDatabase(argv.db, argv.trustHost), listTestUsers), argv.json))
    .demandCommand(1)
    .strict()
    .help()
    // As in packages/seed-pipeline/src/cli.ts: yargs's own validation failures keep the
    // usage block; a rejected handler prints its error alone.
    .fail((msg, err, argParser) => {
        if (err === undefined) {
            argParser.showHelp();
            console.error(msg);
        } else {
            console.error(explain(err));
        }
        process.exit(1);
    })
    .parseAsync()
    .catch((error: unknown) => {
        console.error(explain(error));
        process.exit(1);
    });
