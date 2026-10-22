import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers'
import { execFileSync } from 'child_process'
import { randomBytes } from 'crypto'
import path from 'path'
import { withClient } from '@opencouncil/seed-pipeline/catalog'
import { quoteIdent } from '@opencouncil/seed-pipeline/normalize'

// One PostgreSQL server serves the whole run. The global setup starts it and
// pushes the schema once into TEMPLATE_DB. Each test file then gets its own
// copy of that database, so a file still starts on an empty database.
const SERVER_URL_ENV = 'OC_TEST_SERVER_URL'
const TEMPLATE_DB = 'oc_template'

// The global setup and teardown share this module in the Jest parent process.
let container: StartedTestContainer | undefined
// Each test file loads its own copy of this module.
let testDb: { databaseUrl: string } | undefined

function ensureTestEnvVars() {
    const defaults: Record<string, string> = {
        RESEND_API_KEY: 'test-resend-key',
        NEXTAUTH_SECRET: 'test-nextauth-secret',
        GOOGLE_API_KEY: 'test-google-key',
        DO_SPACES_ENDPOINT: 'https://example.com',
        DO_SPACES_KEY: 'test-key',
        DO_SPACES_SECRET: 'test-secret',
        DO_SPACES_BUCKET: 'test-bucket',
        CDN_URL: 'https://example.com',
        TASK_API_URL: 'https://example.com',
        TASK_API_KEY: 'test-task-key',
        ELASTICSEARCH_URL: 'https://example.com',
        ELASTICSEARCH_API_KEY: 'test-es-key',
        DEV_TEST_CITY_ID: 'testcity',
        SEED_DATA_URL: 'https://example.com/seed.json',
        SEED_DATA_PATH: './prisma/seed_data.json',
        NEXTAUTH_URL: 'https://example.com',
        NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: 'test-mapbox-token',
    }
    for (const [k, v] of Object.entries(defaults)) {
        if (!process.env[k]) process.env[k] = v
    }
}

function databaseUrlFor(serverUrl: string, name: string): string {
    const url = new URL(serverUrl)
    url.pathname = `/${name}`
    url.search = ''
    return url.toString()
}

function prismaSchemaCommand(databaseUrl: string, args: string[]) {
    const prismaBin = path.join(process.cwd(), 'node_modules', '.bin', 'prisma')
    execFileSync(prismaBin, args, {
        stdio: 'inherit',
        env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
    })
}

/** The integration config's `globalSetup`. Runs once, before any test file. */
export async function startTestServer(): Promise<void> {
    ensureTestEnvVars()
    // The workers inherit this environment. A dev shell can export the
    // DATABASE_URL of .env, which may name a real database. Until
    // ensureTestDb() sets the file's own URL, a Prisma call must fail. Do not
    // delete the variable instead: the generated Prisma client then loads
    // .env itself.
    process.env.DATABASE_URL = 'postgresql://unset.invalid/ensure-test-db-not-called'
    process.env.DIRECT_URL = process.env.DATABASE_URL

    // A provided test database is shared by every file, and nothing starts.
    const externalUrl = process.env.TEST_DATABASE_URL
    if (externalUrl) {
        try {
            prismaSchemaCommand(externalUrl, ['migrate', 'deploy'])
        } catch {
            prismaSchemaCommand(externalUrl, ['db', 'push', '--skip-generate'])
        }
        return
    }

    container = await new GenericContainer('postgis/postgis:16-3.5')
        .withEnvironment({
            POSTGRES_USER: 'test',
            POSTGRES_PASSWORD: 'test',
            POSTGRES_DB: 'postgres',
        })
        .withExposedPorts(5432)
        .withUser('root')
        // The run discards the data, so it does not need durable writes.
        // Each test file holds its own Prisma pool, which may open 2 x cores + 1
        // connections, so parallel workers can pass the default limit of 100.
        .withCommand([
            'postgres',
            '-c', 'fsync=off',
            '-c', 'synchronous_commit=off',
            '-c', 'full_page_writes=off',
            '-c', 'max_connections=500',
        ])
        // Wait on the log, not on port probes: the image is amd64-only, and
        // emulated containers on Apple-silicon Docker Desktop report an empty
        // /proc/net/tcp, so every internal port probe times out. The message
        // appears twice (initdb's temporary server, then the real one).
        .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
        .start()

    const serverUrl = `postgresql://test:test@${container.getHost()}:${container.getMappedPort(5432)}/postgres`
    const templateUrl = databaseUrlFor(serverUrl, TEMPLATE_DB)

    await withClient(serverUrl, (client) => client.query(`CREATE DATABASE ${TEMPLATE_DB}`))
    // Push the schema instead of applying migrations (avoids external
    // extension requirements like pgvector). The push also creates PostGIS,
    // which schema.prisma declares. --force-reset re-creates the
    // public schema without the default PUBLIC grant, so the notis views
    // test still fails when a migration forgets to grant notis_reader.
    prismaSchemaCommand(`${templateUrl}?schema=public`, ['db', 'push', '--force-reset', '--skip-generate'])

    await withClient(serverUrl, async (client) => {
        // A role belongs to the server, not to a database. The notis views
        // migration creates notis_reader when it is missing. notis-views and
        // the seed pipeline's migrate deploy rehearsal both replay that
        // migration. When two files run it at the same time, both can see the
        // role missing, and the second CREATE ROLE then fails.
        await client.query('CREATE ROLE notis_reader NOLOGIN')
        // CREATE DATABASE ... TEMPLATE fails while a session is connected to
        // the template.
        await client.query(`ALTER DATABASE ${TEMPLATE_DB} WITH ALLOW_CONNECTIONS false`)
    })

    process.env[SERVER_URL_ENV] = serverUrl
}

/** The integration config's `globalTeardown`. */
export async function stopTestServer(): Promise<void> {
    await container?.stop()
    container = undefined
}

/**
 * The database of the current test file. The first call creates it from the
 * template and points DATABASE_URL at it.
 */
export async function ensureTestDb(): Promise<{ databaseUrl: string }> {
    if (testDb) {
        return testDb
    }

    ensureTestEnvVars()

    let databaseUrl = process.env.TEST_DATABASE_URL
    if (!databaseUrl) {
        const serverUrl = process.env[SERVER_URL_ENV]
        if (!serverUrl) {
            throw new Error(`${SERVER_URL_ENV} is not set. Run integration tests with jest.integration.config.js, whose globalSetup starts the server.`)
        }
        const name = `test_${process.env.JEST_WORKER_ID ?? '0'}_${randomBytes(4).toString('hex')}`
        await withClient(serverUrl, (client) => client.query(`CREATE DATABASE ${name} TEMPLATE ${TEMPLATE_DB}`))
        databaseUrl = `${databaseUrlFor(serverUrl, name)}?schema=public`
    }

    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_URL = databaseUrl
    testDb = { databaseUrl }
    return testDb
}

/**
 * Fails when the file's database already holds a row. A copy of the empty
 * template passes. A database that holds rows from another file, or a copy of
 * a template that gained rows, fails.
 */
export async function assertEmptyTestDb(): Promise<void> {
    // Every file shares the external database, so an earlier file can leave
    // rows in it.
    if (process.env.TEST_DATABASE_URL) return
    const { databaseUrl } = await ensureTestDb()
    const nonEmpty = await withClient(databaseUrl, async (client) => {
        const tables = await client.query<{ name: string }>(`
            SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r'
              AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')`)
        if (tables.rows.length === 0) return []
        const found = await client.query<{ name: string }>(tables.rows
            .map(({ name }) => `SELECT ${client.escapeLiteral(name)} AS name WHERE EXISTS (SELECT 1 FROM public.${quoteIdent(name)})`)
            .join(' UNION ALL '))
        return found.rows.map(({ name }) => name)
    })
    if (nonEmpty.length > 0) {
        throw new Error(`The test database ${new URL(databaseUrl).pathname.slice(1)} is not empty: ${nonEmpty.join(', ')}`)
    }
}

/**
 * `ensureTestDb()` builds the test database with `prisma db push`, which never
 * creates `_prisma_migrations`. Some tests need that table to exist, so create
 * it here with Prisma's own DDL, without applying an actual migration.
 */
export async function ensureMigrationsTable(databaseUrl: string): Promise<void> {
    await withClient(databaseUrl, (client) => client.query(`
            CREATE TABLE IF NOT EXISTS public._prisma_migrations (
                id varchar(36) PRIMARY KEY, checksum varchar(64) NOT NULL, finished_at timestamptz, migration_name varchar(255) NOT NULL,
                logs text, rolled_back_at timestamptz, started_at timestamptz NOT NULL DEFAULT now(), applied_steps_count integer NOT NULL DEFAULT 0)
        `))
}

/**
 * An empty database next to the test database, on the same server, for tools
 * that need a second target (the seed pipeline's scratch and verify). The name
 * starts with the name of the file's database, so files that run at the same
 * time never share one. The returned URL carries no query string.
 * `ensureTestDb` appends Prisma's `?schema=public`, and libpq refuses that as
 * an unknown URI query parameter.
 */
export async function createSiblingDatabase(name: string): Promise<string> {
    const { databaseUrl } = await ensureTestDb()
    const sibling = `${new URL(databaseUrl).pathname.slice(1)}_${name}`
    await withClient(databaseUrl, async (admin) => {
        await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(sibling)}`)
        await admin.query(`CREATE DATABASE ${quoteIdent(sibling)}`)
    })
    return databaseUrlFor(databaseUrl, sibling)
}

export async function resetDatabase(prisma: { $executeRawUnsafe: (q: string) => Promise<any> }) {
    // Truncate in a single statement; CASCADE clears dependent rows and join tables
    await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "NotificationDelivery",
      "NotificationSubject",
      "Notification",
      "NotificationPreference",
      "TaskStatus",
      "SpeakerContribution",
      "HighlightedUtterance",
      "Highlight",
      "Summary",
      "TopicLabel",
      "Word",
      "Utterance",
      "SpeakerSegment",
      "SpeakerTag",
      "Subject",
      "CouncilMeeting",
      "Topic",
      "Person",
      "User",
      -- VerificationToken has no FK to User, so the CASCADE above never reaches
      -- it the way it reaches Account and Session.
      "VerificationToken",
      "AdministrativeBody",
      "City",
      "Location"
    RESTART IDENTITY CASCADE;
  `)
}
