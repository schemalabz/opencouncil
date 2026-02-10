/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import { getNotificationsGroupedByMeeting, MeetingNotificationStats } from '@/lib/db/notifications'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import {
    createAdministrativeBody,
    createCity,
    createMeeting,
    createNotificationPreference,
    createSubject,
    createUser,
} from '../helpers/factories'

/**
 * Tests for admin notification queries.
 *
 * These tests verify the query layer that powers the admin notifications page,
 * ensuring that filtering by status, date range, and city works correctly.
 *
 * Key edge cases covered:
 * - Future meetings with pending notifications (beforeMeeting scenario)
 * - Past meetings with sent notifications
 * - Status filtering (pending/sent/failed)
 * - Date range boundaries
 */
describe('getNotificationsGroupedByMeeting - admin query layer', () => {
    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma as any)
    })

    /**
     * Helper to create a notification with deliveries directly in the database.
     * Uses raw Prisma calls since createNotificationsForMeeting has complex matching logic.
     */
    async function createNotificationWithDeliveries(params: {
        userId: string
        cityId: string
        meetingId: string
        type: 'beforeMeeting' | 'afterMeeting'
        deliveryStatus: 'pending' | 'sent' | 'failed'
    }) {
        const notification = await prisma.notification.create({
            data: {
                userId: params.userId,
                cityId: params.cityId,
                meetingId: params.meetingId,
                type: params.type,
            },
        })

        await prisma.notificationDelivery.create({
            data: {
                notificationId: notification.id,
                medium: 'email',
                status: params.deliveryStatus,
                email: 'test@example.com',
                body: 'Test notification',
            },
        })

        return notification
    }

    describe('temporal edge cases', () => {
        test('includes future meetings with pending notifications', async () => {
            // Setup: city, user, and meeting scheduled for next week
            const city = await createCity({ id: 'future-city' })
            const body = await createAdministrativeBody(city.id)
            const user = await createUser('future@example.com')
            await createNotificationPreference({ userId: user.id, cityId: city.id })

            const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            const futureMeeting = await createMeeting(city.id, {
                id: 'future-meeting',
                name: 'Future Council Meeting',
                dateTime: nextWeek,
                administrativeBodyId: body.id,
            })

            await createSubject(futureMeeting.id, city.id, { id: 'future-subject' })

            // Create a pending beforeMeeting notification (the typical use case)
            await createNotificationWithDeliveries({
                userId: user.id,
                cityId: city.id,
                meetingId: futureMeeting.id,
                type: 'beforeMeeting',
                deliveryStatus: 'pending',
            })

            // Query with no date filters (should use defaults)
            const result = await getNotificationsGroupedByMeeting({})

            // Assert: future meeting should be included
            expect(result.meetings.length).toBe(1)
            expect(result.meetings[0].meetingId).toBe(futureMeeting.id)
            expect(result.meetings[0].before?.pending).toBe(1)
        })

        test('includes meetings from 30 days ago by default', async () => {
            const city = await createCity({ id: 'past-city' })
            const body = await createAdministrativeBody(city.id)
            const user = await createUser('past@example.com')
            await createNotificationPreference({ userId: user.id, cityId: city.id })

            // Meeting from 20 days ago (within default 30-day window)
            const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)
            const recentPastMeeting = await createMeeting(city.id, {
                id: 'recent-past-meeting',
                name: 'Recent Past Meeting',
                dateTime: twentyDaysAgo,
                administrativeBodyId: body.id,
            })

            await createSubject(recentPastMeeting.id, city.id, { id: 'past-subject' })

            await createNotificationWithDeliveries({
                userId: user.id,
                cityId: city.id,
                meetingId: recentPastMeeting.id,
                type: 'afterMeeting',
                deliveryStatus: 'sent',
            })

            const result = await getNotificationsGroupedByMeeting({})

            expect(result.meetings.length).toBe(1)
            expect(result.meetings[0].meetingId).toBe(recentPastMeeting.id)
        })

        test('excludes meetings older than 30 days by default', async () => {
            const city = await createCity({ id: 'old-city' })
            const body = await createAdministrativeBody(city.id)
            const user = await createUser('old@example.com')
            await createNotificationPreference({ userId: user.id, cityId: city.id })

            // Meeting from 45 days ago (outside default 30-day window)
            const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
            const oldMeeting = await createMeeting(city.id, {
                id: 'old-meeting',
                name: 'Old Meeting',
                dateTime: fortyFiveDaysAgo,
                administrativeBodyId: body.id,
            })

            await createSubject(oldMeeting.id, city.id, { id: 'old-subject' })

            await createNotificationWithDeliveries({
                userId: user.id,
                cityId: city.id,
                meetingId: oldMeeting.id,
                type: 'afterMeeting',
                deliveryStatus: 'sent',
            })

            const result = await getNotificationsGroupedByMeeting({})

            expect(result.meetings.length).toBe(0)
        })

        test('respects explicit startDate and endDate filters', async () => {
            const city = await createCity({ id: 'explicit-city' })
            const body = await createAdministrativeBody(city.id)
            const user = await createUser('explicit@example.com')
            await createNotificationPreference({ userId: user.id, cityId: city.id })

            const meetingDate = new Date('2024-06-15T10:00:00Z')
            const meeting = await createMeeting(city.id, {
                id: 'explicit-meeting',
                name: 'June Meeting',
                dateTime: meetingDate,
                administrativeBodyId: body.id,
            })

            await createSubject(meeting.id, city.id, { id: 'explicit-subject' })

            await createNotificationWithDeliveries({
                userId: user.id,
                cityId: city.id,
                meetingId: meeting.id,
                type: 'afterMeeting',
                deliveryStatus: 'sent',
            })

            // Query with date range that includes the meeting
            const includedResult = await getNotificationsGroupedByMeeting({
                startDate: new Date('2024-06-01'),
                endDate: new Date('2024-06-30'),
            })
            expect(includedResult.meetings.length).toBe(1)

            // Query with date range that excludes the meeting
            const excludedResult = await getNotificationsGroupedByMeeting({
                startDate: new Date('2024-07-01'),
                endDate: new Date('2024-07-31'),
            })
            expect(excludedResult.meetings.length).toBe(0)
        })
    })

    describe('status filtering', () => {
        test('filters by pending status', async () => {
            const city = await createCity({ id: 'status-city' })
            const body = await createAdministrativeBody(city.id)
            const user1 = await createUser('pending@example.com')
            const user2 = await createUser('sent@example.com')
            await createNotificationPreference({ userId: user1.id, cityId: city.id })
            await createNotificationPreference({ userId: user2.id, cityId: city.id })

            const meeting = await createMeeting(city.id, {
                id: 'status-meeting',
                administrativeBodyId: body.id,
            })

            await createSubject(meeting.id, city.id, { id: 'status-subject' })

            // Create one pending and one sent notification
            await createNotificationWithDeliveries({
                userId: user1.id,
                cityId: city.id,
                meetingId: meeting.id,
                type: 'beforeMeeting',
                deliveryStatus: 'pending',
            })

            await createNotificationWithDeliveries({
                userId: user2.id,
                cityId: city.id,
                meetingId: meeting.id,
                type: 'beforeMeeting',
                deliveryStatus: 'sent',
            })

            // Filter by pending status
            const pendingResult = await getNotificationsGroupedByMeeting({ status: 'pending' })
            expect(pendingResult.meetings.length).toBe(1)
            expect(pendingResult.meetings[0].before?.pending).toBe(1)

            // Filter by sent status
            const sentResult = await getNotificationsGroupedByMeeting({ status: 'sent' })
            expect(sentResult.meetings.length).toBe(1)
            expect(sentResult.meetings[0].before?.sent).toBe(1)

            // All statuses
            const allResult = await getNotificationsGroupedByMeeting({})
            expect(allResult.meetings.length).toBe(1)
            expect(allResult.meetings[0].before?.total).toBe(2)
        })

        test('returns empty when no notifications match status filter', async () => {
            const city = await createCity({ id: 'no-match-city' })
            const body = await createAdministrativeBody(city.id)
            const user = await createUser('nomatch@example.com')
            await createNotificationPreference({ userId: user.id, cityId: city.id })

            const meeting = await createMeeting(city.id, {
                id: 'no-match-meeting',
                administrativeBodyId: body.id,
            })

            await createSubject(meeting.id, city.id, { id: 'no-match-subject' })

            // Only create sent notifications
            await createNotificationWithDeliveries({
                userId: user.id,
                cityId: city.id,
                meetingId: meeting.id,
                type: 'afterMeeting',
                deliveryStatus: 'sent',
            })

            // Filter by pending (should return nothing)
            const result = await getNotificationsGroupedByMeeting({ status: 'pending' })
            expect(result.meetings.length).toBe(0)
        })
    })

    describe('city filtering', () => {
        test('filters notifications by city', async () => {
            const city1 = await createCity({ id: 'city-1', name: 'City One' })
            const city2 = await createCity({ id: 'city-2', name: 'City Two' })
            const body1 = await createAdministrativeBody(city1.id)
            const body2 = await createAdministrativeBody(city2.id)

            const user1 = await createUser('user1@example.com')
            const user2 = await createUser('user2@example.com')
            await createNotificationPreference({ userId: user1.id, cityId: city1.id })
            await createNotificationPreference({ userId: user2.id, cityId: city2.id })

            const meeting1 = await createMeeting(city1.id, {
                id: 'meeting-1',
                administrativeBodyId: body1.id,
            })
            const meeting2 = await createMeeting(city2.id, {
                id: 'meeting-2',
                administrativeBodyId: body2.id,
            })

            await createSubject(meeting1.id, city1.id, { id: 'subject-1' })
            await createSubject(meeting2.id, city2.id, { id: 'subject-2' })

            await createNotificationWithDeliveries({
                userId: user1.id,
                cityId: city1.id,
                meetingId: meeting1.id,
                type: 'beforeMeeting',
                deliveryStatus: 'pending',
            })

            await createNotificationWithDeliveries({
                userId: user2.id,
                cityId: city2.id,
                meetingId: meeting2.id,
                type: 'beforeMeeting',
                deliveryStatus: 'pending',
            })

            // Filter by city1
            const city1Result = await getNotificationsGroupedByMeeting({ cityId: city1.id })
            expect(city1Result.meetings.length).toBe(1)
            expect(city1Result.meetings[0].cityId).toBe(city1.id)

            // Filter by city2
            const city2Result = await getNotificationsGroupedByMeeting({ cityId: city2.id })
            expect(city2Result.meetings.length).toBe(1)
            expect(city2Result.meetings[0].cityId).toBe(city2.id)

            // All cities
            const allResult = await getNotificationsGroupedByMeeting({})
            expect(allResult.meetings.length).toBe(2)
        })
    })

    describe('notification type grouping', () => {
        test('correctly groups before and after meeting notifications', async () => {
            const city = await createCity({ id: 'grouping-city' })
            const body = await createAdministrativeBody(city.id)
            const user = await createUser('grouping@example.com')
            await createNotificationPreference({ userId: user.id, cityId: city.id })

            const meeting = await createMeeting(city.id, {
                id: 'grouping-meeting',
                administrativeBodyId: body.id,
            })

            await createSubject(meeting.id, city.id, { id: 'grouping-subject' })

            // Create both before and after notifications
            await createNotificationWithDeliveries({
                userId: user.id,
                cityId: city.id,
                meetingId: meeting.id,
                type: 'beforeMeeting',
                deliveryStatus: 'pending',
            })

            // Create a second user for afterMeeting to have different notification
            const user2 = await createUser('grouping2@example.com')
            await createNotificationPreference({ userId: user2.id, cityId: city.id })

            await createNotificationWithDeliveries({
                userId: user2.id,
                cityId: city.id,
                meetingId: meeting.id,
                type: 'afterMeeting',
                deliveryStatus: 'sent',
            })

            const result = await getNotificationsGroupedByMeeting({})

            expect(result.meetings.length).toBe(1)
            expect(result.meetings[0].before).not.toBeNull()
            expect(result.meetings[0].before?.pending).toBe(1)
            expect(result.meetings[0].after).not.toBeNull()
            expect(result.meetings[0].after?.sent).toBe(1)
        })

        test('filters by notification type', async () => {
            const city = await createCity({ id: 'type-filter-city' })
            const body = await createAdministrativeBody(city.id)
            const user = await createUser('typefilter@example.com')
            await createNotificationPreference({ userId: user.id, cityId: city.id })

            const meeting = await createMeeting(city.id, {
                id: 'type-filter-meeting',
                administrativeBodyId: body.id,
            })

            await createSubject(meeting.id, city.id, { id: 'type-filter-subject' })

            await createNotificationWithDeliveries({
                userId: user.id,
                cityId: city.id,
                meetingId: meeting.id,
                type: 'beforeMeeting',
                deliveryStatus: 'pending',
            })

            // Filter by beforeMeeting type
            const beforeResult = await getNotificationsGroupedByMeeting({ type: 'beforeMeeting' })
            expect(beforeResult.meetings.length).toBe(1)

            // Filter by afterMeeting type (should return nothing)
            const afterResult = await getNotificationsGroupedByMeeting({ type: 'afterMeeting' })
            expect(afterResult.meetings.length).toBe(0)
        })
    })

    describe('pagination', () => {
        test('paginates results correctly', async () => {
            const city = await createCity({ id: 'pagination-city' })
            const body = await createAdministrativeBody(city.id)
            const user = await createUser('pagination@example.com')
            await createNotificationPreference({ userId: user.id, cityId: city.id })

            // Create 5 meetings with notifications
            for (let i = 0; i < 5; i++) {
                const meetingDate = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
                const meeting = await createMeeting(city.id, {
                    id: `pagination-meeting-${i}`,
                    name: `Meeting ${i}`,
                    dateTime: meetingDate,
                    administrativeBodyId: body.id,
                })

                await createSubject(meeting.id, city.id, { id: `pagination-subject-${i}` })

                await createNotificationWithDeliveries({
                    userId: user.id,
                    cityId: city.id,
                    meetingId: meeting.id,
                    type: 'afterMeeting',
                    deliveryStatus: 'sent',
                })
            }

            // Get first page (2 items)
            const page1 = await getNotificationsGroupedByMeeting({ page: 1, pageSize: 2 })
            expect(page1.meetings.length).toBe(2)
            expect(page1.pagination.page).toBe(1)
            expect(page1.pagination.pageSize).toBe(2)
            expect(page1.pagination.total).toBe(5)
            expect(page1.pagination.totalPages).toBe(3)

            // Get second page
            const page2 = await getNotificationsGroupedByMeeting({ page: 2, pageSize: 2 })
            expect(page2.meetings.length).toBe(2)
            expect(page2.pagination.page).toBe(2)

            // Get third page (should have 1 item)
            const page3 = await getNotificationsGroupedByMeeting({ page: 3, pageSize: 2 })
            expect(page3.meetings.length).toBe(1)
        })

        test('returns empty for out-of-range page', async () => {
            const city = await createCity({ id: 'out-of-range-city' })
            const body = await createAdministrativeBody(city.id)
            const user = await createUser('outofrange@example.com')
            await createNotificationPreference({ userId: user.id, cityId: city.id })

            const meeting = await createMeeting(city.id, {
                id: 'out-of-range-meeting',
                administrativeBodyId: body.id,
            })

            await createSubject(meeting.id, city.id, { id: 'out-of-range-subject' })

            await createNotificationWithDeliveries({
                userId: user.id,
                cityId: city.id,
                meetingId: meeting.id,
                type: 'afterMeeting',
                deliveryStatus: 'sent',
            })

            const result = await getNotificationsGroupedByMeeting({ page: 100, pageSize: 10 })
            expect(result.meetings.length).toBe(0)
            expect(result.pagination.total).toBe(1)
        })
    })

    describe('combined filters', () => {
        test('combines status and city filters correctly', async () => {
            const city1 = await createCity({ id: 'combined-city-1' })
            const city2 = await createCity({ id: 'combined-city-2' })
            const body1 = await createAdministrativeBody(city1.id)
            const body2 = await createAdministrativeBody(city2.id)

            const user1 = await createUser('combined1@example.com')
            const user2 = await createUser('combined2@example.com')
            await createNotificationPreference({ userId: user1.id, cityId: city1.id })
            await createNotificationPreference({ userId: user2.id, cityId: city2.id })

            const meeting1 = await createMeeting(city1.id, {
                id: 'combined-meeting-1',
                administrativeBodyId: body1.id,
            })
            const meeting2 = await createMeeting(city2.id, {
                id: 'combined-meeting-2',
                administrativeBodyId: body2.id,
            })

            await createSubject(meeting1.id, city1.id, { id: 'combined-subject-1' })
            await createSubject(meeting2.id, city2.id, { id: 'combined-subject-2' })

            // city1: pending notification
            await createNotificationWithDeliveries({
                userId: user1.id,
                cityId: city1.id,
                meetingId: meeting1.id,
                type: 'beforeMeeting',
                deliveryStatus: 'pending',
            })

            // city2: sent notification
            await createNotificationWithDeliveries({
                userId: user2.id,
                cityId: city2.id,
                meetingId: meeting2.id,
                type: 'beforeMeeting',
                deliveryStatus: 'sent',
            })

            // city1 + pending: should find 1
            const city1Pending = await getNotificationsGroupedByMeeting({
                cityId: city1.id,
                status: 'pending',
            })
            expect(city1Pending.meetings.length).toBe(1)
            expect(city1Pending.meetings[0].cityId).toBe(city1.id)

            // city1 + sent: should find 0
            const city1Sent = await getNotificationsGroupedByMeeting({
                cityId: city1.id,
                status: 'sent',
            })
            expect(city1Sent.meetings.length).toBe(0)

            // city2 + pending: should find 0
            const city2Pending = await getNotificationsGroupedByMeeting({
                cityId: city2.id,
                status: 'pending',
            })
            expect(city2Pending.meetings.length).toBe(0)

            // city2 + sent: should find 1
            const city2Sent = await getNotificationsGroupedByMeeting({
                cityId: city2.id,
                status: 'sent',
            })
            expect(city2Sent.meetings.length).toBe(1)
        })
    })
})
