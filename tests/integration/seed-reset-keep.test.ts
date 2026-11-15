import { execFileSync, execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { Client } from 'pg'
import { createSiblingDatabase, ensureTestDb } from '../helpers/test-db'
import { POST_RESTORE_FILE } from '@opencouncil/seed-pipeline/artifact'
import { carryKeptRows, describeKeptRows, KEEP_SCHEMA } from '@opencouncil/seed-pipeline/keep'
import { binary } from '@opencouncil/seed-pipeline/process'
import { assertReplaceableDatabase, restoreInOneTransaction } from '@opencouncil/seed-pipeline/restore'

async function query<T extends Record<string, unknown>>(url: string, statement: string): Promise<T[]> {
    const client = new Client({ connectionString: url })
    client.on('error', () => {})
    await client.connect()
    try {
        return (await client.query<T>(statement)).rows
    } finally {
        await client.end()
    }
}

function onPath(tool: string): boolean {
    try {
        execSync(`command -v ${tool}`, { stdio: 'ignore' })
        return true
    } catch {
        return false
    }
}

const tools = [binary('pg_dump'), binary('pg_restore'), binary('psql')]
const ready = tools.every(onPath)
if (!ready && process.env.CI) throw new Error(`the seed reset test needs ${tools.filter((tool) => !onPath(tool)).join(', ')} on PATH`)
const maybe = ready ? describe : describe.skip

// The shapes that the real schema has: an enum column on a private table, a
// private table that points at content, a chain of private tables, an implicit
// join table of a private model, and a view with a grant that the restore does
// not load. The artifact holds the content and empty private tables.
const SCHEMA = `
    CREATE TYPE "Medium" AS ENUM ('email', 'sms');
    CREATE TABLE "City" (id text PRIMARY KEY);
    CREATE TABLE "Topic" (id text PRIMARY KEY);
    CREATE TABLE "User" (id text PRIMARY KEY, email text NOT NULL UNIQUE);
    CREATE TABLE "Administers" (id text PRIMARY KEY, "userId" text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE, "cityId" text REFERENCES "City"(id) ON DELETE CASCADE);
    CREATE TABLE "Preference" (id text PRIMARY KEY, "userId" text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE, medium "Medium" NOT NULL);
    CREATE TABLE "_PreferenceToTopic" ("A" text NOT NULL REFERENCES "Preference"(id) ON DELETE CASCADE, "B" text NOT NULL REFERENCES "Topic"(id) ON DELETE CASCADE);
    CREATE VIEW account_emails AS SELECT id, email FROM "User";
    INSERT INTO "City" VALUES ('athens');
    INSERT INTO "Topic" VALUES ('roads');`
const PRIVATE = ['User', 'Administers', 'Preference']

// What a database holds after people used it: accounts, a right to a city of the
// artifact, a right to a city that only this database has, a preference with a
// topic, a column that a later migration removes, and a grant.
const USED = `
    INSERT INTO "City" VALUES ('only-here');
    ALTER TABLE "User" ADD COLUMN legacy text;
    INSERT INTO "User" (id, email, legacy) VALUES ('u1', 'one@example.org', 'x'), ('u2', 'two@example.org', NULL);
    INSERT INTO "Administers" VALUES ('right-athens', 'u1', 'athens'), ('right-only-here', 'u1', 'only-here');
    INSERT INTO "Preference" VALUES ('pref', 'u2', 'sms');
    INSERT INTO "_PreferenceToTopic" VALUES ('pref', 'roads');
    DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'seed_keep_reader') THEN CREATE ROLE seed_keep_reader NOLOGIN; END IF; END $$;
    GRANT SELECT ON account_emails TO seed_keep_reader;`

maybe('seed reset keeps the private rows', () => {
    let root = ''
    let dumpDir = ''

    beforeAll(async () => {
        await ensureTestDb()
        const source = await createSiblingDatabase('seed_keep_source')
        await query(source, SCHEMA)
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-seed-keep-'))
        dumpDir = path.join(root, 'dump')
        execFileSync(binary('pg_dump'), ['-Fd', '-f', dumpDir, source])
        fs.writeFileSync(path.join(dumpDir, POST_RESTORE_FILE), '')
    })
    afterAll(() => {
        fs.rmSync(root, { recursive: true, force: true })
    })

    async function usedDatabase(name: string): Promise<string> {
        const url = await createSiblingDatabase(name)
        await restoreInOneTransaction(url, dumpDir)
        await query(url, USED)
        return url
    }
    const keptSchemaExists = async (url: string) =>
        (await query<{ s: string | null }>(url, `SELECT to_regnamespace('${KEEP_SCHEMA}')::text AS s`))[0].s !== null

    test('brings the accounts back, and leaves out what points at content that the artifact does not have', async () => {
        const url = await usedDatabase('seed_keep_carry')
        await restoreInOneTransaction(url, dumpDir, { replace: true, keep: PRIVATE })
        // As a migration that adds a column with a default.
        await query(url, `ALTER TABLE "User" ADD COLUMN nickname text NOT NULL DEFAULT 'none'`)

        const report = await carryKeptRows(url)

        expect(report).toEqual(expect.arrayContaining([
            { table: 'User', kept: 2, carried: 2, pointless: 0 },
            { table: 'Administers', kept: 2, carried: 1, pointless: 1 },
            { table: 'Preference', kept: 1, carried: 1, pointless: 0 },
            { table: '_PreferenceToTopic', kept: 1, carried: 1, pointless: 0 },
        ]))
        expect(describeKeptRows(report!)).toBe('kept 5 private rows; left out as they point at rows that no longer exist: Administers 1')
        expect(await query(url, `SELECT id, email, nickname FROM "User" ORDER BY id`)).toEqual([
            { id: 'u1', email: 'one@example.org', nickname: 'none' },
            { id: 'u2', email: 'two@example.org', nickname: 'none' },
        ])
        expect(await query(url, `SELECT id FROM "Administers"`)).toEqual([{ id: 'right-athens' }])
        expect(await query(url, `SELECT medium::text FROM "Preference"`)).toEqual([{ medium: 'sms' }])
        expect(await query(url, `SELECT "A", "B" FROM "_PreferenceToTopic"`)).toEqual([{ A: 'pref', B: 'roads' }])
        // The content is the artifact's.
        expect(await query(url, `SELECT id FROM "City" ORDER BY id`)).toEqual([{ id: 'athens' }])
        expect(await query(url, `SELECT has_table_privilege('seed_keep_reader', 'account_emails', 'SELECT') AS granted`)).toEqual([{ granted: true }])
        expect(await keptSchemaExists(url)).toBe(false)
    })

    // Notis reads the views as notis_reader: between the restore's commit and the carry, they must not lack the grant.
    test('the views have their grants again as soon as the restore commits, before the carry', async () => {
        const url = await usedDatabase('seed_keep_grants_early')
        await restoreInOneTransaction(url, dumpDir, { replace: true, keep: PRIVATE })

        expect(await query(url, `SELECT has_table_privilege('seed_keep_reader', 'account_emails', 'SELECT') AS granted`)).toEqual([{ granted: true }])
        await carryKeptRows(url)
    })

    // A migration or a carry that fails leaves the rows in seed_keep: the next reset must not replace them with the empty ones.
    test('a second reset before the carry keeps the rows that the first one kept', async () => {
        const url = await usedDatabase('seed_keep_resume')
        await restoreInOneTransaction(url, dumpDir, { replace: true, keep: PRIVATE })
        await restoreInOneTransaction(url, dumpDir, { replace: true, keep: PRIVATE })

        await carryKeptRows(url)

        expect(await query(url, `SELECT id FROM "User" ORDER BY id`)).toEqual([{ id: 'u1' }, { id: 'u2' }])
        expect(await keptSchemaExists(url)).toBe(false)
    })

    test('without keep, a reset drops the private rows, and the rows that an earlier reset kept, and grants again', async () => {
        const url = await usedDatabase('seed_keep_drop')
        await restoreInOneTransaction(url, dumpDir, { replace: true, keep: PRIVATE })
        await restoreInOneTransaction(url, dumpDir, { replace: true })

        expect(await carryKeptRows(url)).toEqual([])
        expect(await query(url, `SELECT count(*)::int AS n FROM "User"`)).toEqual([{ n: 0 }])
        expect(await query(url, `SELECT has_table_privilege('seed_keep_reader', 'account_emails', 'SELECT') AS granted`)).toEqual([{ granted: true }])
        expect(await keptSchemaExists(url)).toBe(false)
    })

    test('without keep, a reset still grants again what public had', async () => {
        const url = await usedDatabase('seed_keep_drop_grants')
        await restoreInOneTransaction(url, dumpDir, { replace: true })

        expect(await carryKeptRows(url)).toEqual([])
        expect(await query(url, `SELECT has_table_privilege('seed_keep_reader', 'account_emails', 'SELECT') AS granted`)).toEqual([{ granted: true }])
    })

    // Rows that an earlier reset kept and did not bring back, and newer rows that people made since: a replace would drop the newer ones.
    test('refuses to replace private rows that the kept rows do not hold', async () => {
        const url = await usedDatabase('seed_keep_stale')
        await restoreInOneTransaction(url, dumpDir, { replace: true, keep: PRIVATE })
        await query(url, `INSERT INTO "User" (id, email) VALUES ('u3', 'three@example.org')`)

        await expect(restoreInOneTransaction(url, dumpDir, { replace: true, keep: PRIVATE })).rejects.toThrow(/holds private rows that an earlier reset did not bring back, and public."User" has rows that it does not hold/)
        expect(await query(url, `SELECT id FROM "User"`)).toEqual([{ id: 'u3' }])
    })

    // On staging, a stalled app backend held a lock for hours, and the replace and everyone behind it waited.
    test('gives up on a lock that another session holds, keeps the data, and names the session', async () => {
        const url = await usedDatabase('seed_keep_locked')
        const holder = new Client({ connectionString: url })
        holder.on('error', () => {})
        await holder.connect()
        try {
            await holder.query('BEGIN')
            await holder.query('SELECT count(*) FROM "City"')
            const { pid } = (await holder.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]

            await expect(restoreInOneTransaction(url, dumpDir, { replace: true, keep: PRIVATE, lockTimeout: '200ms' }))
                .rejects.toThrow(new RegExp(`waited more than 200ms for a lock on a table, so it changed nothing\\. Sessions that hold locks on its tables now:\\npid ${pid} \\(.*\\) on "City"\\n`))
        } finally {
            await holder.end()
        }
        expect(await query(url, `SELECT id FROM "User" ORDER BY id`)).toEqual([{ id: 'u1' }, { id: 'u2' }])
        expect(await query(url, `SELECT id FROM "City" ORDER BY id`)).toEqual([{ id: 'athens' }, { id: 'only-here' }])
        expect(await keptSchemaExists(url)).toBe(false)
    })

    test('the carry gives up on a lock too, and the rows stay kept for the next run', async () => {
        const url = await usedDatabase('seed_keep_carry_locked')
        await restoreInOneTransaction(url, dumpDir, { replace: true, keep: PRIVATE })
        const holder = new Client({ connectionString: url })
        holder.on('error', () => {})
        await holder.connect()
        try {
            await holder.query('BEGIN')
            await holder.query('LOCK TABLE "User" IN SHARE MODE')

            await expect(carryKeptRows(url, '200ms')).rejects.toThrow(/carrying the kept private rows back failed; they stay in the schema seed_keep/)
        } finally {
            await holder.end()
        }
        await carryKeptRows(url)
        expect(await query(url, `SELECT id FROM "User" ORDER BY id`)).toEqual([{ id: 'u1' }, { id: 'u2' }])
    })

    // The cluster that holds staging holds production too.
    test('refuses to replace the database named production', async () => {
        const { databaseUrl: admin } = await ensureTestDb()
        await query(admin, 'DROP DATABASE IF EXISTS production')
        await query(admin, 'CREATE DATABASE production')
        const production = new URL(admin)
        production.pathname = '/production'
        await expect(assertReplaceableDatabase(production.toString())).rejects.toThrow(/refusing to replace the database named production/)
        await query(admin, 'DROP DATABASE production')
    })
})
