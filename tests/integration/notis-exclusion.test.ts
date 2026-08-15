/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import { createNotificationsForMeeting } from '@/lib/db/notifications'
import { releaseNotifications } from '@/lib/notifications/deliver'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import {
    createCity,
    createMeeting,
    createNotificationPreference,
    createSubject,
    createTopic,
    createUser,
} from '../helpers/factories'

describe('notis rollout exclusion in the notification pipeline', () => {
    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma as any)
    })

    async function setupMatchingMeeting() {
        const city = await createCity({ id: 'nx_city' })
        const meeting = await createMeeting(city.id, { id: 'nx_meeting' })
        const topic = await createTopic('nx_topic')
        await createSubject(meeting.id, city.id, { id: 'nx_subject', topicId: topic.id })
        return { city, meeting, topic }
    }

    test('an enabled user keeps the email delivery and loses the message delivery', async () => {
        const { city, meeting, topic } = await setupMatchingMeeting()
        const user = await createUser('enabled@example.com', {
            phone: '+306900000001',
            notisEnabledAt: new Date(),
        })
        await createNotificationPreference({ userId: user.id, cityId: city.id, topicIds: [topic.id] })

        const result = await createNotificationsForMeeting(city.id, meeting.id, 'afterMeeting')
        expect(result.notificationsCreated).toBe(1)

        const deliveries = await prisma.notificationDelivery.findMany({
            where: { notification: { userId: user.id } },
        })
        expect(deliveries.map((d) => d.medium)).toEqual(['email'])
    })

    test('a not-enabled user still gets the message delivery', async () => {
        const { city, meeting, topic } = await setupMatchingMeeting()
        const user = await createUser('old-path@example.com', { phone: '+306900000002' })
        await createNotificationPreference({ userId: user.id, cityId: city.id, topicIds: [topic.id] })

        await createNotificationsForMeeting(city.id, meeting.id, 'afterMeeting')

        const deliveries = await prisma.notificationDelivery.findMany({
            where: { notification: { userId: user.id } },
        })
        expect(deliveries.map((d) => d.medium).sort()).toEqual(['email', 'message'])
    })

    test('a pending message delivery is skipped at release when the user got enabled after creation', async () => {
        const { city, meeting, topic } = await setupMatchingMeeting()
        const user = await createUser('flipped@example.com', { phone: '+306900000003' })
        // Phone-only preference: the test must not reach the email send path.
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
        const pending = await prisma.notificationDelivery.findMany({
            where: { notificationId: { in: notificationIds } },
        })
        expect(pending.map((d) => d.medium)).toEqual(['message'])

        await prisma.user.update({ where: { id: user.id }, data: { notisEnabledAt: new Date() } })

        const release = await releaseNotifications(notificationIds)
        expect(release.messagesSent).toBe(0)
        expect(release.failed).toBe(0)

        const after = await prisma.notificationDelivery.findFirst({
            where: { notificationId: { in: notificationIds } },
        })
        expect(after?.status).toBe('skipped')
    })
})
