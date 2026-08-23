/** @jest-environment node */
import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
import prisma from '@/lib/db/prisma'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { splitSqlStatements } from '../helpers/sql'
import {
    createAdministrativeBody,
    createCity,
    createLocation,
    createMeeting,
    createNotificationPreference,
    createTaskStatus,
    createTopic,
    createUser,
} from '../helpers/factories'

const MIGRATION_PATH = path.join(
    __dirname,
    '../../prisma/migrations/20260815120000_notis_views_and_rollout/migration.sql',
)

/** The consumer's half of the contract: the Prisma models Notis reads the
 *  views through. Kept in a separate file from the SQL that defines them,
 *  which is exactly why the drift below is worth a test. */
const CONSUMER_SCHEMA_PATH = path.join(
    __dirname,
    '../../services/notis/prisma/main-views.prisma',
)

/** Every `@@map`-ed model in the consumer schema, with its declared fields.
 *  Relation-free by construction — these models are flat view rows. */
function consumerViewModels(): Array<{ view: string; fields: string[] }> {
    const source = fs.readFileSync(CONSUMER_SCHEMA_PATH, 'utf8')
    const models: Array<{ view: string; fields: string[] }> = []
    for (const [, body] of source.matchAll(/model\s+\w+\s*\{([\s\S]*?)\n\}/g)) {
        const view = body.match(/@@map\("([^"]+)"\)/)?.[1]
        if (!view) continue
        const fields: string[] = []
        for (const line of body.split('\n')) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue
            const name = trimmed.match(/^(\w+)\s+\S/)?.[1]
            // A field may rename its column; the column is what must exist.
            const mapped = trimmed.match(/@map\("([^"]+)"\)/)?.[1]
            if (name) fields.push(mapped ?? name)
        }
        models.push({ view, fields })
    }
    return models
}

async function applyNotisMigration() {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
    for (const statement of splitSqlStatements(sql)) {
        await prisma.$executeRawUnsafe(statement)
    }
}

describe('notis views migration', () => {
    beforeAll(async () => {
        await ensureTestDb()
        // Twice on purpose: the migration must be idempotent (the test
        // database comes from `prisma db push`, which already created the
        // notisEnabledAt column and the skipped enum value).
        await applyNotisMigration()
        await applyNotisMigration()
    })

    beforeEach(async () => {
        await resetDatabase(prisma as any)
    })

    test('each view exposes exactly the columns its consumer model declares', async () => {
        // The contract has two halves that people maintain by hand: this SQL
        // defines the views, and services/notis/prisma/main-views.prisma
        // describes them for the reader. Nothing else compares the two, and
        // drift is silent — a column the SQL stops emitting simply arrives as
        // undefined, and a column it starts emitting is never read.
        const models = consumerViewModels()
        expect(models.map((m) => m.view).sort()).toEqual([
            'notis_admin_sessions',
            'notis_fanout_targets',
            'notis_meeting_events',
            'notis_sessions',
            'notis_users',
        ])

        for (const { view, fields } of models) {
            const columns = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
                `SELECT column_name FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = $1`,
                view,
            )
            expect({ view, columns: columns.map((c) => c.column_name).sort() }).toEqual({
                view,
                columns: [...fields].sort(),
            })
        }
    })

    test('notis_fanout_targets aggregates topics and locations per preference', async () => {
        const city = await createCity({ id: 'nv_city' })
        const topic = await createTopic('nv_topic', { name: 'Πολεοδομία', name_en: 'Urban planning' })
        const location = await createLocation({ id: 'nv_loc', lng: 23.71, lat: 37.97 })
        const user = await createUser('fanout@example.com', { phone: '+306900000001' })
        await createNotificationPreference({
            userId: user.id,
            cityId: city.id,
            topicIds: [topic.id],
            locationIds: [location.id],
        })

        const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
            'SELECT * FROM notis_fanout_targets',
        )
        expect(rows).toHaveLength(1)
        const row = rows[0]
        expect(row.userId).toBe(user.id)
        expect(row.phone).toBe('+306900000001')
        expect(row.notisEnabledAt).toBeNull()
        expect(row.cityId).toBe(city.id)
        expect(row.realm).toBe('greece')
        expect(row.language).toBe('el')
        expect(typeof row.timezone).toBe('string')
        expect(row.topics).toEqual([
            { id: topic.id, name: 'Πολεοδομία', name_en: 'Urban planning' },
        ])
        expect(row.locations).toEqual([
            {
                text: expect.any(String),
                type: 'point',
                lng: expect.closeTo(23.71, 3),
                lat: expect.closeTo(37.97, 3),
            },
        ])
    })

    test('notis_fanout_targets carries the rollout flag without filtering on it', async () => {
        const city = await createCity({ id: 'nv_city' })
        const enabledAt = new Date('2026-08-01T00:00:00Z')
        const user = await createUser('enabled@example.com', {
            phone: '+306900000002',
            notisEnabledAt: enabledAt,
        })
        await createNotificationPreference({ userId: user.id, cityId: city.id })

        const rows = await prisma.$queryRawUnsafe<
            Array<{ notisEnabledAt: Date | null; topics: unknown; locations: unknown }>
        >('SELECT * FROM notis_fanout_targets')
        expect(rows).toHaveLength(1)
        expect(rows[0].notisEnabledAt).toEqual(enabledAt)
        // This preference has neither topics nor locations, which is the
        // COALESCE branch: drop it and the columns come back SQL NULL, while
        // both consumer converters turn a non-array into [] and say nothing.
        expect(rows[0].topics).toEqual([])
        expect(rows[0].locations).toEqual([])
    })

    test('notis_meeting_events lists only succeeded processAgenda/summarize tasks', async () => {
        const city = await createCity({ id: 'nv_city' })
        const body = await createAdministrativeBody(city.id)
        const meeting = await createMeeting(city.id, {
            id: 'nv_meeting',
            administrativeBodyId: body.id,
            released: true,
        })
        const succeeded = await createTaskStatus(meeting.id, city.id, {
            type: 'summarize',
            status: 'succeeded',
        })
        await createTaskStatus(meeting.id, city.id, { type: 'processAgenda', status: 'pending' })
        await createTaskStatus(meeting.id, city.id, { type: 'transcribe', status: 'succeeded' })
        // An unreleased meeting still produces tasks. The view carries the
        // flag rather than filtering on it, and the poller is what refuses to
        // wake anyone for a meeting the public cannot read yet — so the flag
        // has to be observable as false.
        const unreleased = await createMeeting(city.id, {
            id: 'nv_meeting_unreleased',
            administrativeBodyId: body.id,
            released: false,
        })
        const unreleasedTask = await createTaskStatus(unreleased.id, city.id, {
            type: 'summarize',
            status: 'succeeded',
        })

        const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
            'SELECT * FROM notis_meeting_events',
        )
        expect(rows).toHaveLength(2)
        const row = rows.find((r) => r.taskId === succeeded.id)!
        const hidden = rows.find((r) => r.taskId === unreleasedTask.id)!
        expect(hidden.released).toBe(false)
        expect(row.taskId).toBe(succeeded.id)
        expect(row.type).toBe('summarize')
        expect(row.meetingId).toBe(meeting.id)
        expect(row.released).toBe(true)
        expect(row.adminBodyName).toEqual(expect.any(String))
        expect(row.realm).toBe('greece')
    })

    test('notis_admin_sessions exposes hashed superadmin sessions only', async () => {
        const admin = await createUser('admin@example.com', { isSuperAdmin: true, name: 'Admin' })
        const plain = await createUser('plain@example.com')
        const expires = new Date(Date.now() + 86_400_000)
        await prisma.session.createMany({
            data: [
                { sessionToken: 'tok-admin', userId: admin.id, expires },
                { sessionToken: 'tok-plain', userId: plain.id, expires },
            ],
        })

        const adminRows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
            'SELECT * FROM notis_admin_sessions',
        )
        expect(adminRows).toHaveLength(1)
        // The views expose a SHA-256 of the token, never the token itself —
        // nothing that reaches Notis can replay as the Auth.js cookie.
        expect(adminRows[0].sessionTokenHash).toBe(
            createHash('sha256').update('tok-admin').digest('hex'),
        )
        expect(adminRows[0].sessionToken).toBeUndefined()
        expect(adminRows[0].userName).toBe('Admin')

        const allRows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
            'SELECT * FROM notis_sessions',
        )
        expect(allRows).toHaveLength(2)
        expect(allRows[0].sessionToken).toBeUndefined()
    })

    test('notis_users lists every user, unfiltered', async () => {
        await createUser('a@example.com')
        await createUser('b@example.com', { phone: '+306900000009' })
        const rows = await prisma.$queryRawUnsafe<Array<unknown>>('SELECT * FROM notis_users')
        expect(rows).toHaveLength(2)
    })

    test('the session-hash lookup is served by the expression index', async () => {
        // The views compute encode(digest(sessionToken,'sha256'),'hex') per
        // row; without the matching expression index every Notis admin
        // request seq-scans Session. The index must exist AND the planner
        // must actually pick it for the hash lookup.
        const idx = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
            `SELECT indexname FROM pg_indexes
             WHERE tablename = 'Session' AND indexname = 'Session_sessionTokenHash_idx'`,
        )
        expect(idx).toHaveLength(1)

        const plan = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(
            `EXPLAIN SELECT * FROM "notis_admin_sessions" WHERE "sessionTokenHash" = 'x'`,
        )
        const planText = plan.map((r) => r['QUERY PLAN']).join('\n')
        expect(planText).toContain('Session_sessionTokenHash_idx')
    })

    test('notis_reader can read the views and nothing else', async () => {
        await createUser('reader@example.com')

        // All five views are readable under the role.
        await prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe('SET LOCAL ROLE notis_reader')
            for (const view of [
                'notis_users',
                'notis_fanout_targets',
                'notis_meeting_events',
                'notis_sessions',
                'notis_admin_sessions',
            ]) {
                await tx.$queryRawUnsafe(`SELECT * FROM ${view} LIMIT 1`)
            }
        })

        // Direct table access is denied — reads and writes alike.
        const denied = [
            'SELECT * FROM "User" LIMIT 1',
            `UPDATE "User" SET name = 'x'`,
            `INSERT INTO "Topic" (id, name, name_en, "colorHex", "updatedAt") VALUES ('x', 'x', 'x', '#000', now())`,
            'DELETE FROM "Session"',
        ]
        for (const statement of denied) {
            await expect(
                prisma.$transaction(async (tx) => {
                    await tx.$executeRawUnsafe('SET LOCAL ROLE notis_reader')
                    await tx.$executeRawUnsafe(statement)
                }),
            ).rejects.toThrow(/permission denied/)
        }
    })
})
