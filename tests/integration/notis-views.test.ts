/** @jest-environment node */
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

        const rows = await prisma.$queryRawUnsafe<Array<{ notisEnabledAt: Date | null }>>(
            'SELECT * FROM notis_fanout_targets',
        )
        expect(rows).toHaveLength(1)
        expect(rows[0].notisEnabledAt).toEqual(enabledAt)
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

        const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
            'SELECT * FROM notis_meeting_events',
        )
        expect(rows).toHaveLength(1)
        const row = rows[0]
        expect(row.taskId).toBe(succeeded.id)
        expect(row.type).toBe('summarize')
        expect(row.meetingId).toBe(meeting.id)
        expect(row.released).toBe(true)
        expect(row.adminBodyName).toEqual(expect.any(String))
        expect(row.realm).toBe('greece')
    })

    test('notis_admin_sessions exposes superadmin sessions only', async () => {
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
        expect(adminRows[0].sessionToken).toBe('tok-admin')
        expect(adminRows[0].userName).toBe('Admin')

        const allRows = await prisma.$queryRawUnsafe<Array<unknown>>(
            'SELECT * FROM notis_sessions',
        )
        expect(allRows).toHaveLength(2)
    })

    test('notis_users lists every user, unfiltered', async () => {
        await createUser('a@example.com')
        await createUser('b@example.com', { phone: '+306900000009' })
        const rows = await prisma.$queryRawUnsafe<Array<unknown>>('SELECT * FROM notis_users')
        expect(rows).toHaveLength(2)
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
