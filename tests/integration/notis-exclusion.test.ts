/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import { createNotificationsForMeeting, getNotificationsGroupedByMeeting } from '@/lib/db/notifications'
import { releaseNotifications } from '@/lib/notifications/deliver'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import {
    createCity,
    createMeeting,
    createNotificationPreference,
    createSubject,
    createTopic,
    createUser,
    signInAsSuperAdmin,
} from '../helpers/factories'

/**
 * The notification pipeline never sends WhatsApp or SMS: every reader's
 * messages are Notis's (services/notis). This app keeps the in-app
 * notification and the email delivery, and nothing else.
 */
describe('message deliveries are Notis\'s, never this app\'s', () => {
    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma as any)
        await signInAsSuperAdmin()
    })

    async function setupMatchingMeeting() {
        const city = await createCity({ id: 'nx_city' })
        const meeting = await createMeeting(city.id, { id: 'nx_meeting' })
        const topic = await createTopic('nx_topic')
        await createSubject(meeting.id, city.id, { id: 'nx_subject', topicId: topic.id })
        return { city, meeting, topic }
    }

    test('a reader with a phone gets the email delivery and no message delivery', async () => {
        const { city, meeting, topic } = await setupMatchingMeeting()
        const user = await createUser('reader@example.com', { phone: '+306900000001' })
        await createNotificationPreference({ userId: user.id, cityId: city.id, topicIds: [topic.id] })

        const result = await createNotificationsForMeeting(city.id, meeting.id, 'afterMeeting')
        expect(result.notificationsCreated).toBe(1)

        const deliveries = await prisma.notificationDelivery.findMany({
            where: { notification: { userId: user.id } },
        })
        expect(deliveries.map((d) => d.medium)).toEqual(['email'])
    })

    test('a phone-only reader keeps the in-app notification, gets no deliveries, and reads as skipped', async () => {
        const { city, meeting, topic } = await setupMatchingMeeting()
        const user = await createUser('phone-only@example.com', { phone: '+306900000009' })
        await prisma.notificationPreference.create({
            data: {
                userId: user.id,
                cityId: city.id,
                notifyByEmail: false,
                notifyByPhone: true,
                interests: { connect: [{ id: topic.id }] },
            },
        })

        const result = await createNotificationsForMeeting(city.id, meeting.id, 'afterMeeting')
        expect(result.notificationsCreated).toBe(1)
        const deliveries = await prisma.notificationDelivery.findMany({
            where: { notification: { userId: user.id } },
        })
        expect(deliveries).toHaveLength(0)

        // Admin stats must not report this as "sent" — nothing was dispatched.
        const grouped = await getNotificationsGroupedByMeeting({ cityId: city.id })
        expect(grouped.meetings).toHaveLength(1)
        expect(grouped.meetings[0].after?.skipped).toBe(1)
        expect(grouped.meetings[0].after?.sent).toBe(0)

        // The skipped FILTER finds it too, even with zero delivery rows.
        const filtered = await getNotificationsGroupedByMeeting({ cityId: city.id, status: 'skipped' })
        expect(filtered.meetings).toHaveLength(1)
    })

    test('a message delivery left over from before the switch is skipped at release, never sent', async () => {
        const { city, meeting, topic } = await setupMatchingMeeting()
        const user = await createUser('leftover@example.com', { phone: '+306900000003' })
        await prisma.notificationPreference.create({
            data: {
                userId: user.id,
                cityId: city.id,
                notifyByEmail: false,
                notifyByPhone: true,
                interests: { connect: [{ id: topic.id }] },
            },
        })
        const { notificationIds } = await createNotificationsForMeeting(
            city.id,
            meeting.id,
            'afterMeeting',
        )
        // The row an older build created before the switch.
        await prisma.notificationDelivery.create({
            data: {
                notificationId: notificationIds[0],
                medium: 'message',
                status: 'pending',
                phone: user.phone,
                body: 'παλιό μήνυμα',
            },
        })

        const release = await releaseNotifications(notificationIds)
        expect(release.messagesSent).toBe(0)
        expect(release.skipped).toBe(1)
        expect(release.failed).toBe(0)

        const after = await prisma.notificationDelivery.findFirst({
            where: { notificationId: { in: notificationIds } },
        })
        expect(after?.status).toBe('skipped')
    })
})
