import fs from 'fs'
import os from 'os'
import path from 'path'
import { Client } from 'pg'
import { createSiblingDatabase, ensureTestDb } from '../helpers/test-db'
import { formatError } from '@opencouncil/seed-pipeline/errors'
import { prismaMigrate } from '@opencouncil/seed-pipeline/process'
import { deployMigrations } from '@opencouncil/seed-pipeline/restore'
import { setupDatabase } from '@opencouncil/seed-pipeline/setup'

// The test image's PostGIS cannot run the migrations of prisma/ (they pin 3.3.5), so
// each case uses a schema of its own with one migration.
function schemaWith(root: string, migrationSql: string): string {
    const dir = fs.mkdtempSync(path.join(root, 'schema-'))
    fs.writeFileSync(path.join(dir, 'schema.prisma'), 'datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n')
    fs.mkdirSync(path.join(dir, 'migrations', '20990101000000_only'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'migrations', 'migration_lock.toml'), 'provider = "postgresql"\n')
    fs.writeFileSync(path.join(dir, 'migrations', '20990101000000_only', 'migration.sql'), migrationSql)
    return path.join(dir, 'schema.prisma')
}

let root = ''
beforeAll(async () => {
    await ensureTestDb()
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-seed-setup-'))
})
afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true })
})

// The old seed left databases with migrations and cities but no meetings.
describe('seed setup on a database with migrations', () => {
    // One meeting per city status: 'supported' for an artifact city, 'demo' for the Serbian fixture.
    async function setUp(name: string, meetingCityStatuses: string[]): Promise<string[]> {
        const url = await createSiblingDatabase(name)
        const schemaPath = schemaWith(root, 'CREATE TABLE "City" (id text PRIMARY KEY, status text NOT NULL);\nCREATE TABLE "CouncilMeeting" (id text PRIMARY KEY, "cityId" text NOT NULL REFERENCES "City");\n')
        await prismaMigrate(url, schemaPath, ['deploy'])
        const client = new Client({ connectionString: url })
        await client.connect()
        try {
            for (const [i, status] of meetingCityStatuses.entries()) {
                await client.query(`INSERT INTO "City" VALUES ($1, $2)`, [`c${i}`, status])
                await client.query(`INSERT INTO "CouncilMeeting" VALUES ($1, $2)`, [`m${i}`, `c${i}`])
            }
        } finally {
            await client.end()
        }
        const lines: string[] = []
        const outcome = await setupDatabase({ databaseUrl: url, from: '/no-artifact', schemaPath, cacheDir: '/no-cache', trustedHosts: [], log: (line) => lines.push(line) })
        expect(outcome).toEqual({ how: 'migrated' })
        return lines
    }

    test('with no meetings, keeps the database and says how to load the artifact', async () => {
        expect((await setUp('seed_setup_no_meetings', [])).join('\n')).toMatch(/no meetings in a supported city: `npm run seed -- reset`/)
    }, 120_000)

    // The old seed and every setup add the Serbian review meeting, in a demo city.
    test('with only the Serbian review meeting, still says how to load the artifact', async () => {
        expect((await setUp('seed_setup_demo_only', ['demo'])).join('\n')).toMatch(/no meetings in a supported city/)
    }, 120_000)

    test('with a meeting in a supported city, says nothing about the artifact', async () => {
        expect(await setUp('seed_setup_meetings', ['supported', 'demo'])).toEqual([])
    }, 120_000)
})

// Prisma records a migration that fails and refuses every later deploy (P3009), so a
// second run alone does not help. Both runs must name the way out.
describe('a branch migration that fails', () => {
    test('names the reset and the resolve, on the first run and on the next', async () => {
        const url = await createSiblingDatabase('seed_setup_failed_migration')
        const schemaPath = schemaWith(root, 'SELECT 1/0;\n')
        const recovery = /`npm run seed -- reset`.*`npx prisma migrate resolve --rolled-back <migration>`/
        const first = await deployMigrations(url, schemaPath).catch((error: unknown) => formatError(error))
        expect(first).toMatch(recovery)
        expect(first).toMatch(/P3018/)
        const next = await deployMigrations(url, schemaPath).catch((error: unknown) => formatError(error))
        expect(next).toMatch(recovery)
        expect(next).toMatch(/P3009/)
    }, 120_000)
})
