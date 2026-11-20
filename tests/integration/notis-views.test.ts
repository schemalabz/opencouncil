/** @jest-environment node */
import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
import prisma from '@/lib/db/prisma'
import { bodyOffersUpdates, bodySendsUpdates, meetingAudienceWhere, preferenceCoversBody } from '@/lib/utils/bodyTier'
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

/** Every migration that defines or redefines a notis view, in order. The last
 *  one wins, so the suite checks the definition production actually runs. */
const MIGRATION_PATHS = [
    '20260815120000_notis_views_and_rollout',
    '20260906210000_phone_consent_per_user',
    '20260913120000_drop_preference_phone_consent',
    '20260913120100_drop_notis_rollout_flag',
    '20260913120200_unique_user_phone',
].map((name) => path.join(__dirname, `../../prisma/migrations/${name}/migration.sql`))

const TITLE_MIGRATION_PATH = path.join(
    __dirname,
    '../../prisma/migrations/20261014120100_meeting_title/migration.sql',
)
const DISABLED_BODIES_MIGRATION_PATH = path.join(
    __dirname,
    '../../prisma/migrations/20261113120100_notis_meeting_events_skip_disabled_bodies/migration.sql',
)
const FOLLOWED_BODIES_MIGRATION_PATH = path.join(
    __dirname,
    '../../prisma/migrations/20261120120000_notification_preference_bodies/migration.sql',
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
    // The suite's database comes from `prisma db push`, which builds the tables
    // from schema.prisma. That no longer declares the per-preference phone flag,
    // but the database production runs still has it — the consent migration
    // leaves the column in place until no live build reads it — and the first
    // view definition below selects it. Put it back so the replay sees the shape
    // production has.
    await prisma.$executeRawUnsafe(
        'ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "notifyByPhone" BOOLEAN NOT NULL DEFAULT true',
    )
    for (const migrationPath of MIGRATION_PATHS) {
        const sql = fs.readFileSync(migrationPath, 'utf8')
        for (const statement of splitSqlStatements(sql)) {
            await prisma.$executeRawUnsafe(statement)
        }
    }
    // The title migration redefines notis_meeting_events. The rest of that
    // migration changes columns that `db push` already made, so only the view
    // is replayed.
    for (const statement of splitSqlStatements(fs.readFileSync(TITLE_MIGRATION_PATH, 'utf8'))) {
        if (statement.includes('CREATE OR REPLACE VIEW "notis_meeting_events"')) {
            await prisma.$executeRawUnsafe(statement)
        }
    }
    // The disabled-bodies migration (#829) keeps that SELECT list and adds a WHERE condition.
    for (const statement of splitSqlStatements(fs.readFileSync(DISABLED_BODIES_MIGRATION_PATH, 'utf8'))) {
        await prisma.$executeRawUnsafe(statement)
    }
    // The followed-bodies migration (#829) replaces both views: `bodies` on
    // notis_fanout_targets, `adminBodyId` and `followersOnly` on
    // notis_meeting_events. Its join table `db push` already created, so only
    // the views are replayed.
    for (const statement of splitSqlStatements(fs.readFileSync(FOLLOWED_BODIES_MIGRATION_PATH, 'utf8'))) {
        if (/CREATE OR REPLACE VIEW/.test(statement)) {
            await prisma.$executeRawUnsafe(statement)
        }
    }
}

describe('notis views migration', () => {
    beforeAll(async () => {
        await ensureTestDb()
        // Twice on purpose: the migrations must be idempotent (the test
        // database comes from `prisma db push`, which already holds the
        // final schema — the columns the later migrations drop are gone).
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

    test('notis_meeting_events keeps its column order and appends the facts', async () => {
        // CREATE OR REPLACE VIEW can only append columns, and a running Notis
        // reads the older ones by name. A new fact goes after the last one.
        const columns = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
            `SELECT column_name FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'notis_meeting_events'
             ORDER BY ordinal_position`,
        )
        expect(columns.map((c) => c.column_name)).toEqual([
            'taskId',
            'type',
            'completedAt',
            'cityId',
            'meetingId',
            'meetingName',
            'meetingDate',
            'released',
            'adminBodyName',
            'realm',
            'language',
            'timezone',
            'meetingKind',
            'sessionNumber',
            'urgent',
            'adminBodyId',
            'followersOnly',
        ])
    })

    test('notis_fanout_targets aggregates topics and locations per preference', async () => {
        const city = await createCity({ id: 'nv_city', supportsNotifications: true })
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

    test('notis_fanout_targets gives a preference with no topics or locations empty arrays', async () => {
        const city = await createCity({ id: 'nv_city', supportsNotifications: true })
        const user = await createUser('bare@example.com', { phone: '+306900000002' })
        await createNotificationPreference({ userId: user.id, cityId: city.id })

        const rows = await prisma.$queryRawUnsafe<Array<{ topics: unknown; locations: unknown }>>(
            'SELECT * FROM notis_fanout_targets',
        )
        expect(rows).toHaveLength(1)
        // This preference has neither topics nor locations, which is the
        // COALESCE branch: drop it and the columns come back SQL NULL, while
        // both consumer converters turn a non-array into [] and say nothing.
        expect(rows[0].topics).toEqual([])
        expect(rows[0].locations).toEqual([])
    })

    test('notis_fanout_targets names the bodies a preference follows (#829)', async () => {
        const city = await createCity({ id: 'nv_city', supportsNotifications: true })
        const youth = await createAdministrativeBody(city.id, { name: 'Δημοτικό Συμβούλιο Νέων', name_en: 'Youth Council', type: 'youthCouncil' })
        const follower = await createUser('follower@example.com', { phone: '+306900000003' })
        const resident = await createUser('resident@example.com', { phone: '+306900000004' })
        await createNotificationPreference({ userId: follower.id, cityId: city.id, bodyIds: [youth.id] })
        await createNotificationPreference({ userId: resident.id, cityId: city.id })

        const rows = await prisma.$queryRawUnsafe<Array<{ userId: string; bodies: unknown }>>(
            'SELECT "userId", bodies FROM notis_fanout_targets',
        )
        const rowOf = new Map(rows.map((r) => [r.userId, r]))
        expect(rowOf.get(follower.id)).toMatchObject({ bodies: [{ id: youth.id, name: 'Δημοτικό Συμβούλιο Νέων', name_en: 'Youth Council' }] })
        expect(rowOf.get(resident.id)).toMatchObject({ bodies: [] })
    })

    test('notis_meeting_events leaves out the events of a primary body, or no body, in a city without notifications (#829)', async () => {
        const city = await createCity({ id: 'nv_quiet', supportsNotifications: false })
        const council = await createAdministrativeBody(city.id)
        const youth = await createAdministrativeBody(city.id, {
            name: 'Δημοτικό Συμβούλιο Νέων', name_en: 'Youth Council', type: 'youthCouncil', notificationBehavior: 'NOTIFICATIONS_AUTO',
        })
        for (const [id, administrativeBodyId] of [['nv_q_council', council.id], ['nv_q_youth', youth.id], ['nv_q_nobody', undefined]] as const) {
            await createMeeting(city.id, { id, administrativeBodyId, released: true })
            await createTaskStatus(id, city.id, { type: 'summarize', status: 'succeeded' })
        }

        const rows = await prisma.$queryRawUnsafe<Array<{ meetingId: string }>>('SELECT "meetingId" FROM notis_meeting_events')
        expect(rows.map((r) => r.meetingId)).toEqual(['nv_q_youth'])
    })

    test('notis_meeting_events marks the events of a secondary body as its followers\' alone (#829)', async () => {
        const city = await createCity({ id: 'nv_city', supportsNotifications: true })
        const council = await createAdministrativeBody(city.id)
        const youth = await createAdministrativeBody(city.id, {
            name: 'Δημοτικό Συμβούλιο Νέων', name_en: 'Youth Council', type: 'youthCouncil', notificationBehavior: 'NOTIFICATIONS_AUTO',
        })
        const councilMeeting = await createMeeting(city.id, { id: 'nv_council', administrativeBodyId: council.id, released: true })
        const youthMeeting = await createMeeting(city.id, { id: 'nv_youth', administrativeBodyId: youth.id, released: true })
        const noBody = await createMeeting(city.id, { id: 'nv_nobody', released: true })
        const councilTask = await createTaskStatus(councilMeeting.id, city.id, { type: 'summarize', status: 'succeeded' })
        const youthTask = await createTaskStatus(youthMeeting.id, city.id, { type: 'summarize', status: 'succeeded' })
        const noBodyTask = await createTaskStatus(noBody.id, city.id, { type: 'summarize', status: 'succeeded' })

        const rows = await prisma.$queryRawUnsafe<Array<{ taskId: string; adminBodyId: string | null; followersOnly: boolean }>>(
            'SELECT "taskId", "adminBodyId", "followersOnly" FROM notis_meeting_events',
        )
        const byTask = new Map(rows.map((r) => [r.taskId, r]))
        expect(byTask.get(councilTask.id)).toMatchObject({ adminBodyId: council.id, followersOnly: false })
        expect(byTask.get(youthTask.id)).toMatchObject({ adminBodyId: youth.id, followersOnly: true })
        expect(byTask.get(noBodyTask.id)).toMatchObject({ adminBodyId: null, followersOnly: false })
    })

    test('the app, the one-row rule and the Notis views pick the same audience for the same rows (#829)', async () => {
        // A reader of the city, a reader who also follows the youth council
        // and the moved committee, and a reader who follows the youth council
        // and picked nothing else: each with a row in both cities.
        const resident = await createUser('resident@example.com', { phone: '+306900000011' })
        const follower = await createUser('follower@example.com', { phone: '+306900000012' })
        const youthOnly = await createUser('youth-only@example.com', { phone: '+306900000013' })

        async function cityWithMeetings(cityId: string, supportsNotifications: boolean) {
            const city = await createCity({ id: cityId, supportsNotifications })
            const council = await createAdministrativeBody(city.id)
            const youth = await createAdministrativeBody(city.id, {
                name: 'Δημοτικό Συμβούλιο Νέων', name_en: 'Youth Council', type: 'youthCouncil', notificationBehavior: 'NOTIFICATIONS_AUTO',
            })
            // A committee that a superadmin moved to the secondary tier: the
            // tier, not the type, decides the audience (isSecondaryBody).
            const moved = await createAdministrativeBody(city.id, {
                name: 'Επιτροπή', name_en: 'Committee', type: 'committee', tier: 'secondary', notificationBehavior: 'NOTIFICATIONS_AUTO',
            })
            // A youth council with its notifications off, the default of a
            // secondary body: the follower of it gets nothing anywhere.
            const silent = await createAdministrativeBody(city.id, {
                name: 'Δημοτικό Συμβούλιο Νέων 2', name_en: 'Youth Council 2', type: 'youthCouncil', notificationBehavior: 'NOTIFICATIONS_DISABLED',
            })
            const bodies = { council, youth, nobody: null, moved, silent }
            for (const [key, body] of Object.entries(bodies)) {
                await createMeeting(city.id, { id: `${cityId}_${key}`, administrativeBodyId: body?.id, released: true })
                await createTaskStatus(`${cityId}_${key}`, city.id, { type: 'summarize', status: 'succeeded' })
            }
            await createNotificationPreference({ userId: resident.id, cityId: city.id })
            await createNotificationPreference({ userId: follower.id, cityId: city.id, bodyIds: [youth.id, moved.id, silent.id] })
            await createNotificationPreference({ userId: youthOnly.id, cityId: city.id, bodyIds: [youth.id] })
            return { city, bodies }
        }
        const cities = [await cityWithMeetings('nv_on', true), await cityWithMeetings('nv_off', false)]

        const targets = await prisma.$queryRawUnsafe<Array<{ userId: string; cityId: string; bodies: Array<{ id: string }> }>>(
            'SELECT "userId", "cityId", bodies FROM notis_fanout_targets',
        )
        const events = await prisma.$queryRawUnsafe<Array<{ cityId: string; meetingId: string; adminBodyId: string | null; followersOnly: boolean }>>(
            'SELECT "cityId", "meetingId", "adminBodyId", "followersOnly" FROM notis_meeting_events',
        )
        // The poller's step (processMeetingEvents), on the view rows alone.
        const notisAudience = (cityId: string, meetingId: string) => {
            const event = events.find((e) => e.cityId === cityId && e.meetingId === meetingId)
            if (!event) return []
            const ofCity = targets.filter((t) => t.cityId === cityId)
            const woken = event.followersOnly ? ofCity.filter((t) => t.bodies.some((b) => b.id === event.adminBodyId)) : ofCity
            return woken.map((t) => t.userId).sort()
        }
        type Body = { id: string; tier: 'primary' | 'secondary' } | null
        // The Prisma where of the send and of every preview.
        const appAudience = async (cityId: string, body: Body) =>
            (await prisma.notificationPreference.findMany({ where: meetingAudienceWhere(cityId, body), select: { userId: true } }))
                .map((p) => p.userId).sort()
        // The one-row rule, as the meeting page applies it to the reader's own row.
        const rowAudience = async (cityId: string, body: Body, city: { supportsNotifications: boolean }) =>
            (await prisma.notificationPreference.findMany({ where: { cityId }, include: { bodies: { select: { id: true } } } }))
                .filter((p) => preferenceCoversBody(p, body, city)).map((p) => p.userId).sort()

        const audiences: Record<string, string[]> = {}
        for (const { city, bodies } of cities) {
            for (const [key, body] of Object.entries(bodies)) {
                const meetingId = `${city.id}_${key}`
                // The meeting-level form, which notificationOutcome and
                // releaseNews read: the view has the event exactly when it is true.
                const sends = body ? bodySendsUpdates(body.notificationBehavior) : true
                const offers = bodyOffersUpdates(city, body && { tier: body.tier, sendsUpdates: sends })
                const hasEvent = events.some((e) => e.cityId === city.id && e.meetingId === meetingId)
                expect({ meetingId, hasEvent }).toEqual({ meetingId, hasEvent: offers })

                const app = await appAudience(city.id, body)
                expect({ meetingId, audience: await rowAudience(city.id, body, city) }).toEqual({ meetingId, audience: app })
                // The audience forms do not read the behaviour (see bodyTier.ts):
                // a body whose updates are off has no event, so Notis wakes nobody.
                expect({ meetingId, audience: notisAudience(city.id, meetingId) }).toEqual({ meetingId, audience: sends ? app : [] })
                audiences[meetingId] = app
            }
        }
        // The fixture tells the rules apart: the audiences differ by body and by city.
        const ids = (...users: Array<{ id: string }>) => users.map((u) => u.id).sort()
        expect(audiences).toEqual({
            nv_on_council: ids(resident, follower, youthOnly),
            nv_on_youth: ids(follower, youthOnly),
            nv_on_nobody: ids(resident, follower, youthOnly),
            nv_on_moved: ids(follower),
            nv_on_silent: ids(follower),
            nv_off_council: [],
            nv_off_youth: ids(follower, youthOnly),
            nv_off_nobody: [],
            nv_off_moved: ids(follower),
            nv_off_silent: ids(follower),
        })
    })

    test('notis_meeting_events lists only succeeded processAgenda/summarize tasks', async () => {
        const city = await createCity({ id: 'nv_city', supportsNotifications: true })
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
        // A body with its notifications off never reaches Notis (#829): its
        // meeting's events stay out of the view, released or not.
        const silentBody = await createAdministrativeBody(city.id, {
            name: 'Youth council',
            name_en: 'Youth council',
            type: 'youthCouncil',
            notificationBehavior: 'NOTIFICATIONS_DISABLED',
        })
        const silent = await createMeeting(city.id, {
            id: 'nv_meeting_silent',
            administrativeBodyId: silentBody.id,
            released: true,
        })
        const silentTask = await createTaskStatus(silent.id, city.id, { type: 'summarize', status: 'succeeded' })

        const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
            'SELECT * FROM notis_meeting_events',
        )
        expect(rows).toHaveLength(2)
        expect(rows.find((r) => r.taskId === silentTask.id)).toBeUndefined()
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

    test('notis_meeting_events carries the stored name, the kind, the urgency and the number of a meeting', async () => {
        const city = await createCity({ id: 'nv_city', supportsNotifications: true })
        const body = await createAdministrativeBody(city.id, { name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council' })
        const derived = await createMeeting(city.id, {
            id: 'nv_derived',
            name: null,
            name_en: null,
            kind: 'accountability',
            urgent: true,
            sessionNumber: 4,
            dateTime: new Date('2026-06-25T22:30:00Z'),
            administrativeBodyId: body.id,
            released: true,
        })
        const legacy = await createMeeting(city.id, {
            id: 'nv_legacy',
            name: 'Λογοδοσία και Δημοτικό Συμβούλιο 04/02/26',
            kind: null,
            sessionNumber: null,
            administrativeBodyId: body.id,
            released: true,
        })
        const derivedTask = await createTaskStatus(derived.id, city.id, { type: 'summarize', status: 'succeeded' })
        const legacyTask = await createTaskStatus(legacy.id, city.id, { type: 'summarize', status: 'succeeded' })

        const rows = await prisma.$queryRawUnsafe<
            Array<{
                taskId: string
                meetingName: string | null
                meetingKind: string | null
                urgent: boolean
                sessionNumber: number | null
            }>
        >('SELECT "taskId", "meetingName", "meetingKind", "urgent", "sessionNumber" FROM notis_meeting_events')
        const byTask = new Map(rows.map(({ taskId, ...facts }) => [taskId, facts]))
        // Notis derives the title from these facts with the shared code. A
        // meeting without a kind falls back to its legacy stored name.
        expect(byTask.get(derivedTask.id)).toEqual({
            meetingName: null,
            meetingKind: 'accountability',
            urgent: true,
            sessionNumber: 4,
        })
        expect(byTask.get(legacyTask.id)).toEqual({
            meetingName: 'Λογοδοσία και Δημοτικό Συμβούλιο 04/02/26',
            meetingKind: null,
            urgent: false,
            sessionNumber: null,
        })
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
