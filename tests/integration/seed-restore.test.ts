import { execFileSync, execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { Client } from 'pg'
import { createSiblingDatabase, ensureTestDb } from '../helpers/test-db'
import { packArtifact, POST_RESTORE_FILE, sha256File } from '@opencouncil/seed-pipeline/artifact'
import { binary } from '@opencouncil/seed-pipeline/process'
import { assertEmptyDatabase, restoreArchive, restoreArtifact, restoreInOneTransaction } from '@opencouncil/seed-pipeline/restore'
import { writeManifest, type Manifest } from '@opencouncil/seed-pipeline/manifest'

async function sqlOn(url: string, statement: string) {
    const client = new Client({ connectionString: url })
    client.on('error', () => {})
    await client.connect()
    try {
        await client.query(statement)
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

describe('seed restore target checks', () => {
    let url = ''

    beforeAll(async () => {
        await ensureTestDb()
        url = await createSiblingDatabase('seed_restore_target')
    })

    const sql = (statement: string) => sqlOn(url, statement)

    test('an empty database passes, also with PostGIS created first, as nix run .#dev --fast does', async () => {
        await assertEmptyDatabase(url)
        await sql('CREATE EXTENSION IF NOT EXISTS postgis')
        await assertEmptyDatabase(url)
    })

    // The same objects that a replace drops, so a database that passes holds nothing the dump creates again.
    test('a database with only a leftover type is refused', async () => {
        const typeOnly = await createSiblingDatabase('seed_restore_type_only')
        await sqlOn(typeOnly, "CREATE EXTENSION IF NOT EXISTS postgis; CREATE TYPE \"Leftover\" AS ENUM ('a')")
        await expect(assertEmptyDatabase(typeOnly)).rejects.toThrow(/already has 1 tables, views, types, or routines in public.*seed -- reset/)
    })

    test('a database with a table is refused', async () => {
        await sql('CREATE TABLE leftover (id int)')
        await expect(assertEmptyDatabase(url)).rejects.toThrow(/already has 1 tables, views, types, or routines in public.*seed -- reset/)
    })
})

const tools = ['zstd', binary('pg_dump'), binary('pg_restore'), binary('psql')]
const ready = tools.every(onPath)
// CI installs the tools (`.#seed-tools`), so a missing one there is a broken job, not a reason to skip.
if (!ready && process.env.CI) throw new Error(`the seed restore test needs ${tools.filter((tool) => !onPath(tool)).join(', ')} on PATH`)
const maybe = ready ? describe : describe.skip

// The next run of `seed setup` takes a database with tables for a set-up one, so a
// restore that fails must leave none behind.
maybe('a restore that fails', () => {
    let root = ''
    let dump = ''

    beforeAll(async () => {
        await ensureTestDb()
        const source = await createSiblingDatabase('seed_restore_source')
        await sqlOn(source, "CREATE TABLE note (id int PRIMARY KEY, body text); INSERT INTO note SELECT g, repeat('x', 200) FROM generate_series(1, 5000) g;")
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-seed-restore-'))
        dump = path.join(root, 'dump')
        execFileSync(binary('pg_dump'), ['-Fd', '-f', dump, source])
    })
    afterAll(() => {
        fs.rmSync(root, { recursive: true, force: true })
    })

    async function artifact(name: string, postRestoreSql: string[], damage?: (dumpDir: string) => void): Promise<string> {
        const dumpDir = path.join(root, `${name}-dump`)
        fs.cpSync(dump, dumpDir, { recursive: true })
        damage?.(dumpDir)
        const outFile = path.join(root, `${name}.tar.zst`)
        await packArtifact({ dumpDir, postRestoreSql, outFile })
        return outFile
    }
    const restoreInto = (url: string, tarPath: string) =>
        restoreArtifact({ tarPath, databaseUrl: url, schemaPath: path.join(process.cwd(), 'prisma', 'schema.prisma'), workDir: path.join(root, 'work') })

    test('at a statement of post-restore.sql leaves the database empty', async () => {
        const url = await createSiblingDatabase('seed_restore_bad_post')
        await expect(restoreInto(url, await artifact('bad-post', ['SELECT 1/0;']))).rejects.toThrow(/division by zero/)
        await assertEmptyDatabase(url)
    })

    test('inside pg_restore leaves the database empty, and names the pg_restore error', async () => {
        const url = await createSiblingDatabase('seed_restore_bad_data')
        // pg_restore writes the table first, then fails on the missing data file of the table.
        const tarPath = await artifact('bad-data', [], (dumpDir) => {
            const data = fs.readdirSync(dumpDir).find((name) => /^\d+\.dat\.gz$/.test(name))
            if (!data) throw new Error('the dump has no data file')
            fs.rmSync(path.join(dumpDir, data))
        })
        await expect(restoreInto(url, tarPath)).rejects.toThrow(/pg_restore failed with exit 1/)
        await assertEmptyDatabase(url)
    })
})

maybe('a restore by a role that did not create the extensions', () => {
    test('restores the dump, whose comments on the extensions only their owner may write', async () => {
        const { databaseUrl: admin } = await ensureTestDb()
        const source = await createSiblingDatabase('seed_restore_ext_source')
        await sqlOn(source, 'CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE TABLE note (id int PRIMARY KEY); INSERT INTO note SELECT generate_series(1, 10);')
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-seed-owner-'))
        try {
            const dumpDir = path.join(root, 'dump')
            execFileSync(binary('pg_dump'), ['-Fd', '-f', dumpDir, source])
            fs.writeFileSync(path.join(dumpDir, POST_RESTORE_FILE), '')

            // As a developer's setup: a superuser created the extension, and the app's role owns the database.
            const target = await createSiblingDatabase('seed_restore_ext_target')
            await sqlOn(admin, `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seed_app') THEN CREATE ROLE seed_app LOGIN PASSWORD 'seed_app'; END IF; END $$; ALTER DATABASE "${new URL(target).pathname.slice(1)}" OWNER TO seed_app;`)
            await sqlOn(target, 'CREATE EXTENSION pgcrypto; GRANT ALL ON SCHEMA public TO seed_app;')
            const asApp = new URL(target)
            asApp.username = 'seed_app'
            asApp.password = 'seed_app'

            await restoreInOneTransaction(asApp.toString(), dumpDir)
            const client = new Client({ connectionString: target })
            await client.connect()
            try {
                expect((await client.query('SELECT count(*)::int AS n FROM note')).rows[0].n).toBe(10)
            } finally {
                await client.end()
            }
        } finally {
            fs.rmSync(root, { recursive: true, force: true })
        }
    })
})

// `seed reset` replaces a database that holds data. A reset that fails must keep that data.
maybe('a restore that replaces the data', () => {
    let root = ''
    let dump = ''

    beforeAll(async () => {
        await ensureTestDb()
        const source = await createSiblingDatabase('seed_replace_source')
        await sqlOn(source, 'CREATE TABLE note (id int PRIMARY KEY); INSERT INTO note SELECT generate_series(1, 10);')
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-seed-replace-'))
        dump = path.join(root, 'dump')
        execFileSync(binary('pg_dump'), ['-Fd', '-f', dump, source])
    })
    afterAll(() => {
        fs.rmSync(root, { recursive: true, force: true })
    })

    async function databaseWithOldData(name: string): Promise<string> {
        const url = await createSiblingDatabase(name)
        await sqlOn(url, 'CREATE TABLE old_data (id int); INSERT INTO old_data VALUES (1);')
        return url
    }
    async function tables(url: string): Promise<string[]> {
        const client = new Client({ connectionString: url })
        await client.connect()
        try {
            const { rows } = await client.query<{ name: string }>("SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY 1")
            return rows.map((r) => r.name)
        } finally {
            await client.end()
        }
    }
    function dumpWithPostRestore(name: string, statements: string): string {
        const dir = path.join(root, name)
        fs.cpSync(dump, dir, { recursive: true })
        fs.writeFileSync(path.join(dir, POST_RESTORE_FILE), statements)
        return dir
    }

    test('drops the old data in the transaction of the restore, so a failure keeps it', async () => {
        const url = await databaseWithOldData('seed_replace_target')
        await expect(restoreInOneTransaction(url, dumpWithPostRestore('failing', 'SELECT 1/0;'), { replace: true })).rejects.toThrow(/division by zero/)
        expect(await tables(url)).toEqual(['old_data'])
        await restoreInOneTransaction(url, dumpWithPostRestore('passing', ''), { replace: true })
        expect(await tables(url)).toEqual(['note'])
    })

    // A native setup: a superuser installs PostGIS, and the app role owns the database.
    // The app role cannot create PostGIS, so the replace must keep it.
    test('keeps the extensions that a superuser installed, so the app role can replace its data', async () => {
        const source = await createSiblingDatabase('seed_replace_postgis_source')
        await sqlOn(source, 'CREATE EXTENSION IF NOT EXISTS postgis; CREATE TABLE place (id int PRIMARY KEY, at geometry(Point, 4326)); INSERT INTO place VALUES (1, ST_SetSRID(ST_MakePoint(23.7, 37.9), 4326));')
        const dir = path.join(root, 'postgis-dump')
        // As in the artifacts, which carry no spatial_ref_sys rows: PostGIS owns that table.
        execFileSync(binary('pg_dump'), ['-Fd', '--exclude-table-data=spatial_ref_sys', '-f', dir, source])
        fs.writeFileSync(path.join(dir, POST_RESTORE_FILE), '')

        const admin = await createSiblingDatabase('seed_replace_postgis_target')
        await sqlOn(admin, "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'seed_app') THEN CREATE ROLE seed_app LOGIN PASSWORD 'seed_app'; END IF; END $$")
        await sqlOn(admin, `ALTER DATABASE "${new URL(admin).pathname.slice(1)}" OWNER TO seed_app; CREATE EXTENSION postgis;`)
        const app = new URL(admin)
        app.username = 'seed_app'
        app.password = 'seed_app'

        await restoreInOneTransaction(app.toString(), dir)
        await sqlOn(app.toString(), "INSERT INTO place VALUES (2, NULL); CREATE TYPE \"Mood\" AS ENUM ('ok'); CREATE FUNCTION answer() RETURNS int LANGUAGE sql AS 'SELECT 42';")
        await restoreInOneTransaction(app.toString(), dir, { replace: true })
        const client = new Client({ connectionString: admin })
        await client.connect()
        try {
            expect((await client.query('SELECT id FROM place ORDER BY id')).rows).toEqual([{ id: 1 }])
            expect((await client.query("SELECT extowner::regrole::text AS owner FROM pg_extension WHERE extname = 'postgis'")).rows[0].owner).not.toBe('seed_app')
        } finally {
            await client.end()
        }
        // The type and the function went too: without the dump's one table, nothing is left that the empty check sees.
        await sqlOn(admin, 'DROP TABLE place')
        await assertEmptyDatabase(admin)
    })

    test('refuses a dump with large objects, whose own COMMIT would end the transaction early', async () => {
        const source = await createSiblingDatabase('seed_replace_blob_source')
        await sqlOn(source, "CREATE TABLE note (id int PRIMARY KEY); SELECT lo_from_bytea(0, 'a large object');")
        const dir = path.join(root, 'blob-dump')
        execFileSync(binary('pg_dump'), ['-Fd', '-f', dir, source])
        fs.writeFileSync(path.join(dir, POST_RESTORE_FILE), '')
        const url = await databaseWithOldData('seed_replace_blob_target')
        await expect(restoreInOneTransaction(url, dir, { replace: true })).rejects.toThrow(/holds large objects/)
        expect(await tables(url)).toEqual(['old_data'])
    })

    test('refuses an artifact from a newer main before it drops anything', async () => {
        const url = await databaseWithOldData('seed_replace_newer')
        const dir = path.join(root, 'newer')
        fs.mkdirSync(dir)
        const tarPath = path.join(dir, 'subset.tar.zst')
        await packArtifact({ dumpDir: dumpWithPostRestore('newer-dump', ''), postRestoreSql: [], outFile: tarPath })
        const file = { name: 'subset.tar.zst', sha256: await sha256File(tarPath), bytes: fs.statSync(tarPath).size }
        const manifest: Manifest = {
            producedAt: '2026-10-23T00:00:00.000Z',
            backup: { path: 'production.sql.gz', date: '2026-10-23T01:00:00.000Z' },
            migrationHead: '29990101000000_not_in_this_checkout',
            greenmaskVersion: 'test',
            meetingsPerBody: 2,
            cities: [],
            meetings: [],
            counts: {},
            files: { subset: file, full: { ...file, name: 'full.tar.zst' } },
        }
        writeManifest(dir, manifest)
        const restore = restoreArchive({ tarPath, databaseUrl: url, schemaPath: path.join(process.cwd(), 'prisma', 'schema.prisma'), replace: true, log: () => undefined })
        await expect(restore).rejects.toThrow(/29990101000000_not_in_this_checkout.*Pull main/)
        expect(await tables(url)).toEqual(['old_data'])
    })
})
