/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import { getReleaseOutlook, notifySubscribersOfTask, notifySubscribersOnRelease } from '@/lib/notifications/meetingNotifications'
import type { NewsPhase } from '@/lib/notifications/freshness'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting, createNotificationPreference, createSubject, createTopic, createUser } from '../helpers/factories'

const CITY = 'c1'
const DAY = 86_400_000
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY)
type Behavior = 'NOTIFICATIONS_AUTO' | 'NOTIFICATIONS_APPROVAL' | 'NOTIFICATIONS_DISABLED'

/** A reader who follows the topic of the meeting's one subject, so every notification has one recipient. */
async function setUp(options: { released: boolean; meetingDays: number; behavior?: Behavior; scheduleStatus?: 'scheduled' | 'cancelled' }) {
    await createCity({ id: CITY })
    const body = await createAdministrativeBody(CITY, { notificationBehavior: options.behavior ?? 'NOTIFICATIONS_AUTO' })
    await createMeeting(CITY, {
        id: 'm', administrativeBodyId: body.id, released: options.released,
        dateTime: daysFromNow(options.meetingDays), scheduleStatus: options.scheduleStatus ?? 'scheduled',
    })
    const topic = await createTopic('parks')
    await createSubject('m', CITY, { topicId: topic.id })
    const reader = await createUser('reader@integration.test')
    await createNotificationPreference({ userId: reader.id, cityId: CITY, topicIds: [topic.id] })
}

async function task(type: NewsPhase, status: 'succeeded' | 'pending' | 'failed', completedDaysAgo = 0) {
    // A pending task with a payload is a claimed one: its callback is still writing the results (tasks.ts).
    const row = await prisma.taskStatus.create({
        data: { type, status, responseBody: status === 'succeeded' ? null : '{}', cityId: CITY, councilMeetingId: 'm', requestBody: '{}' },
    })
    if (completedDaysAgo > 0) {
        // updatedAt is @updatedAt: only a raw write can set it in the past.
        await prisma.$executeRaw`UPDATE "TaskStatus" SET "updatedAt" = ${daysFromNow(-completedDaysAgo)} WHERE id = ${row.id}`
    }
    return row
}

const setReleased = (released: boolean) => prisma.councilMeeting.update({ where: { cityId_id: { cityId: CITY, id: 'm' } }, data: { released } })
const deliveries = () => prisma.notificationDelivery.findMany({ include: { notification: { select: { type: true } } } })
const sent = async () => (await deliveries()).map((d) => [d.notification.type, d.status])

describe('the notifications that the app creates by itself', () => {
    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma)
    })

    describe('after a task succeeds', () => {
        test('an unreleased meeting gets nothing, even for a body that sends at once', async () => {
            await setUp({ released: false, meetingDays: 3 })
            await notifySubscribersOfTask(CITY, 'm', 'processAgenda')
            expect(await prisma.notification.count()).toBe(0)
        })

        test('a released meeting that is news sends at once for an AUTO body', async () => {
            await setUp({ released: true, meetingDays: 3 })
            await notifySubscribersOfTask(CITY, 'm', 'processAgenda')
            expect(await sent()).toEqual([['beforeMeeting', 'sent']])
        })

        test.each([
            ['an agenda processed after the meeting', 'processAgenda', -1, 'scheduled'],
            ['a summary of a meeting older than 15 days', 'summarize', -20, 'scheduled'],
            ['an agenda of a cancelled meeting', 'processAgenda', 3, 'cancelled'],
        ] as const)('a released meeting gets nothing for %s', async (_case, phase, meetingDays, scheduleStatus) => {
            await setUp({ released: true, meetingDays, scheduleStatus })
            await notifySubscribersOfTask(CITY, 'm', phase)
            expect(await prisma.notification.count()).toBe(0)
        })
    })

    describe('on release', () => {
        test.each([
            ['sends them at once for an AUTO body', 'NOTIFICATIONS_AUTO', 'sends', 'sent'],
            ['leaves them for approval for an APPROVAL body', 'NOTIFICATIONS_APPROVAL', 'waitsForApproval', 'pending'],
        ] as const)('a fresh agenda %s', async (_case, behavior, kind, status) => {
            await setUp({ released: false, meetingDays: 3, behavior })
            await task('processAgenda', 'succeeded')

            expect(await getReleaseOutlook(CITY, 'm')).toEqual({
                notis: { phase: 'processAgenda' },
                email: { phase: 'processAgenda', outcome: { kind }, recipients: 1 },
            })

            await setReleased(true)
            await notifySubscribersOnRelease(CITY, 'm')
            expect(await sent()).toEqual([['beforeMeeting', status]])
        })

        test('a recent meeting with a summary gets afterMeeting notifications', async () => {
            await setUp({ released: false, meetingDays: -2 })
            await task('processAgenda', 'succeeded', 6)
            await task('summarize', 'succeeded')

            expect(await getReleaseOutlook(CITY, 'm')).toMatchObject({ notis: { phase: 'summarize' }, email: { phase: 'summarize' } })

            await setReleased(true)
            await notifySubscribersOnRelease(CITY, 'm')
            expect((await deliveries()).map((d) => d.notification.type)).toEqual(['afterMeeting'])
        })

        test.each([
            ['the meeting is older than 15 days', -20, 'summarize', 0, 'stale'],
            ['the agenda was processed more than 7 days ago', 10, 'processAgenda', 8, 'old-task'],
        ] as const)('nothing is created when %s', async (_case, meetingDays, phase, completedDaysAgo, reason) => {
            await setUp({ released: false, meetingDays })
            await task(phase, 'succeeded', completedDaysAgo)

            expect(await getReleaseOutlook(CITY, 'm')).toEqual({
                notis: { phase: null, reason },
                email: { phase, outcome: { kind: 'none', reason }, recipients: 0 },
            })
            await setReleased(true)
            await notifySubscribersOnRelease(CITY, 'm')
            expect(await prisma.notification.count()).toBe(0)
        })

        test('a cancelled meeting with a fresh agenda gets no email, though Notis still treats it as news', async () => {
            await setUp({ released: false, meetingDays: 3, scheduleStatus: 'cancelled' })
            await task('processAgenda', 'succeeded')

            expect(await getReleaseOutlook(CITY, 'm')).toEqual({
                notis: { phase: 'processAgenda' },
                email: { phase: 'processAgenda', outcome: { kind: 'none', reason: 'not-taking-place' }, recipients: 0 },
            })
            await setReleased(true)
            await notifySubscribersOnRelease(CITY, 'm')
            expect(await prisma.notification.count()).toBe(0)
        })

        test('a body with notifications disabled gets no email', async () => {
            await setUp({ released: false, meetingDays: 3, behavior: 'NOTIFICATIONS_DISABLED' })
            await task('processAgenda', 'succeeded')

            expect(await getReleaseOutlook(CITY, 'm')).toMatchObject({ email: { outcome: { kind: 'none', reason: 'disabled' }, recipients: 0 } })
            await setReleased(true)
            await notifySubscribersOnRelease(CITY, 'm')
            expect(await prisma.notification.count()).toBe(0)
        })

        test('a meeting hidden again before the release callback runs gets nothing', async () => {
            await setUp({ released: false, meetingDays: 3 })
            await task('processAgenda', 'succeeded')
            // The precondition: released, this meeting would be news.
            expect((await getReleaseOutlook(CITY, 'm')).email.outcome).toEqual({ kind: 'sends' })

            await notifySubscribersOnRelease(CITY, 'm')
            expect(await prisma.notification.count()).toBe(0)
        })

        test('a repeated release callback notifies no reader twice, and the outlook counts no new reader', async () => {
            await setUp({ released: true, meetingDays: 3 })
            await task('processAgenda', 'succeeded')
            await notifySubscribersOnRelease(CITY, 'm')

            expect((await getReleaseOutlook(CITY, 'm')).email.recipients).toBe(0)
            await notifySubscribersOnRelease(CITY, 'm')
            expect(await prisma.notification.count()).toBe(1)
        })

        test('the recount excludes only readers notified of the same type', async () => {
            await setUp({ released: false, meetingDays: -2 })
            await task('summarize', 'succeeded')
            const reader = await prisma.user.findFirstOrThrow()
            await prisma.notification.create({ data: { userId: reader.id, cityId: CITY, meetingId: 'm', type: 'beforeMeeting' } })

            expect((await getReleaseOutlook(CITY, 'm')).email).toMatchObject({ phase: 'summarize', recipients: 1 })
        })
    })

    describe('a release while a task callback runs', () => {
        test('the release ignores a task that is still writing its results; the callback notifies once it succeeds', async () => {
            await setUp({ released: false, meetingDays: 3 })
            const claimed = await task('processAgenda', 'pending')

            expect(await getReleaseOutlook(CITY, 'm')).toMatchObject({ notis: { phase: null, reason: 'noTasks' }, email: { phase: null } })
            await setReleased(true)
            await notifySubscribersOnRelease(CITY, 'm')
            expect(await prisma.notification.count()).toBe(0)

            // tasks.ts flips the status, then notifies.
            await prisma.taskStatus.update({ where: { id: claimed.id }, data: { status: 'succeeded' } })
            await notifySubscribersOfTask(CITY, 'm', 'processAgenda')
            expect(await sent()).toEqual([['beforeMeeting', 'sent']])
        })

        test('a failed task with a stored payload is not news', async () => {
            await setUp({ released: false, meetingDays: 3 })
            await task('processAgenda', 'failed')

            expect(await getReleaseOutlook(CITY, 'm')).toMatchObject({ notis: { phase: null, reason: 'noTasks' } })
        })
    })
})
