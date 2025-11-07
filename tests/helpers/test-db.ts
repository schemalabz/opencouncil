import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers'
import { execFileSync } from 'child_process'
import path from 'path'

type TestDbState = {
    container?: StartedTestContainer
    started: boolean
    databaseUrl?: string
}

const globalState = globalThis as unknown as { __ocTestDb?: TestDbState }

if (!globalState.__ocTestDb) {
    globalState.__ocTestDb = { started: false }
}

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
        NEXT_PUBLIC_BASE_URL: 'https://example.com',
        NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: 'test-mapbox-token',
    }
    for (const [k, v] of Object.entries(defaults)) {
        if (!process.env[k]) process.env[k] = v
    }
}

export async function ensureTestDb(): Promise<{ databaseUrl: string }> {
    if (globalState.__ocTestDb?.started && globalState.__ocTestDb.databaseUrl) {
        return { databaseUrl: globalState.__ocTestDb.databaseUrl }
    }

    // If a test DB URL is provided, use it and skip starting a container
    const externalUrl = process.env.TEST_DATABASE_URL
    if (externalUrl) {
        process.env.DATABASE_URL = externalUrl
        process.env.DIRECT_URL = externalUrl
        ensureTestEnvVars()

        const prismaBin = path.join(process.cwd(), 'node_modules', '.bin', 'prisma')
        try {
            execFileSync(prismaBin, ['migrate', 'deploy'], {
                stdio: 'inherit',
                env: process.env as NodeJS.ProcessEnv,
            })
        } catch {
            execFileSync(prismaBin, ['db', 'push', '--skip-generate'], {
                stdio: 'inherit',
                env: process.env as NodeJS.ProcessEnv,
            })
        }

        globalState.__ocTestDb = { started: true, databaseUrl: externalUrl }
        return { databaseUrl: externalUrl }
    }

    const POSTGRES_USER = 'test'
    const POSTGRES_PASSWORD = 'test'
    const POSTGRES_DB = 'testdb'

    const container = await new GenericContainer('postgis/postgis:15-3.3')
        .withEnvironment({
            POSTGRES_USER,
            POSTGRES_PASSWORD,
            POSTGRES_DB,
        })
        .withExposedPorts(5432)
        .withUser('root')
        .withWaitStrategy(Wait.forListeningPorts())
        .start()

    const host = container.getHost()
    const port = container.getMappedPort(5432)

    const databaseUrl = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${host}:${port}/${POSTGRES_DB}?schema=public`

    // Set URLs for Prisma/env before importing Prisma client anywhere
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_URL = databaseUrl

    ensureTestEnvVars()

    // Create PostGIS extension directly via Prisma before schema push
    // Import Prisma client here after DATABASE_URL is set
    const { PrismaClient } = await import('@prisma/client')
    const tempPrisma = new PrismaClient()
    try {
        await tempPrisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS postgis;')
    } catch (err) {
        // Extension might already exist or container might not have it - continue anyway
        console.warn('Could not create postgis extension:', err)
    } finally {
        await tempPrisma.$disconnect()
    }

    // For tests, push schema instead of applying migrations (avoids external extension requirements like pgvector)
    const prismaBin = path.join(process.cwd(), 'node_modules', '.bin', 'prisma')
    execFileSync(prismaBin, ['db', 'push', '--force-reset', '--skip-generate'], {
        stdio: 'inherit',
        env: process.env as NodeJS.ProcessEnv,
    })

    globalState.__ocTestDb = {
        container,
        started: true,
        databaseUrl,
    }

    return { databaseUrl }
}

export async function resetDatabase(prisma: { $executeRawUnsafe: (q: string) => Promise<any> }) {
    // Truncate in a single statement; CASCADE clears dependent rows and join tables
    await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "NotificationDelivery",
      "NotificationSubject",
      "Notification",
      "NotificationPreference",
      "Subject",
      "CouncilMeeting",
      "Topic",
      "User",
      "AdministrativeBody",
      "City",
      "Location"
    RESTART IDENTITY CASCADE;
  `)
}

export async function teardownTestDb() {
    const state = globalState.__ocTestDb
    if (state?.container) {
        await state.container.stop()
    }
    globalState.__ocTestDb = { started: false }
}


