/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import {
    disableAllNotificationPreferences,
    getPhoneChannelState,
    saveNotificationPreferences,
    setNotifyByPhoneForUser,
} from '@/lib/db/notifications'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createCity, createTopic, signInAsSuperAdmin } from '../helpers/factories'

/**
 * The signup's delivery step and the profile switch write channel consent
 * through these; Notis reads it back through the notis_fanout_targets view.
 * The WhatsApp consent is the person's (User.notifyByPhone), the email
 * summary is the municipality's (NotificationPreference.notifyByEmail).
 */
describe('notification signup channel consent', () => {
    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma)
    })

    test('writes the email flag on the preference and the WhatsApp consent on the person, on create and on update', async () => {
        const admin = await signInAsSuperAdmin()
        const city = await createCity({ id: 'ns_city', supportsNotifications: true })
        const topic = await createTopic('ns_topic')

        const created = await saveNotificationPreferences({
            cityId: city.id,
            locations: [],
            topicIds: [topic.id],
            phone: '+306900000001',
            notifyByPhone: true,
            notifyByEmail: false,
        })
        expect(created.success).toBe(true)

        const first = await prisma.notificationPreference.findUniqueOrThrow({
            where: { userId_cityId: { userId: admin.id, cityId: city.id } },
        })
        expect(first.notifyByEmail).toBe(false)
        const user = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })
        expect(user).toMatchObject({ phone: '+306900000001', notifyByPhone: true })

        // Unticking WhatsApp sends no phone: the person loses the channel, the
        // account keeps its number.
        const updated = await saveNotificationPreferences({
            cityId: city.id,
            locations: [],
            topicIds: [],
            notifyByPhone: false,
            notifyByEmail: true,
        })
        expect(updated.success).toBe(true)
        const second = await prisma.notificationPreference.findUniqueOrThrow({
            where: { userId_cityId: { userId: admin.id, cityId: city.id } },
        })
        expect(second.notifyByEmail).toBe(true)
        expect(await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).toMatchObject({
            phone: '+306900000001',
            notifyByPhone: false,
        })
    })

    test('the WhatsApp consent is one per person: a second municipality reads the same tick', async () => {
        const admin = await signInAsSuperAdmin()
        const a = await createCity({ id: 'ns_a', supportsNotifications: true })
        const b = await createCity({ id: 'ns_b', supportsNotifications: true })

        await saveNotificationPreferences({ cityId: a.id, locations: [], topicIds: [], phone: '+306900000002', notifyByPhone: true })
        await saveNotificationPreferences({ cityId: b.id, locations: [], topicIds: [], notifyByPhone: false, notifyByEmail: true })

        expect(await getPhoneChannelState(admin.id)).toEqual({ notifyByPhone: false, phone: '+306900000002' })
        expect(await prisma.notificationPreference.count({ where: { userId: admin.id } })).toBe(2)
    })

    test('refuses WhatsApp consent without a number to reach', async () => {
        await signInAsSuperAdmin()
        const city = await createCity({ id: 'ns_city2', supportsNotifications: true })

        const result = await saveNotificationPreferences({
            cityId: city.id,
            locations: [],
            topicIds: [],
            notifyByPhone: true,
            notifyByEmail: true,
        })

        expect(result).toEqual({ success: false, error: 'phone_empty' })
        expect(await prisma.notificationPreference.count()).toBe(0)
    })

    test('an older caller that sends no flags keeps the defaults', async () => {
        const admin = await signInAsSuperAdmin()
        const city = await createCity({ id: 'ns_city3', supportsNotifications: true })
        await prisma.user.update({ where: { id: admin.id }, data: { notifyByPhone: false } })

        const result = await saveNotificationPreferences({ cityId: city.id, locations: [], topicIds: [] })
        expect(result.success).toBe(true)

        const row = await prisma.notificationPreference.findUniqueOrThrow({
            where: { userId_cityId: { userId: admin.id, cityId: city.id } },
        })
        expect(row.notifyByEmail).toBe(true)
        // The person's consent is not touched by a caller that did not ask about it.
        expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).notifyByPhone).toBe(false)
    })

    test('the profile switch flips the one consent and reads it back', async () => {
        const admin = await signInAsSuperAdmin()
        await prisma.user.update({ where: { id: admin.id }, data: { phone: '+306900000003' } })

        expect(await getPhoneChannelState(admin.id)).toEqual({ notifyByPhone: true, phone: '+306900000003' })

        await setNotifyByPhoneForUser(admin.id, false)
        expect(await getPhoneChannelState(admin.id)).toEqual({ notifyByPhone: false, phone: '+306900000003' })

        await setNotifyByPhoneForUser(admin.id, true)
        expect((await getPhoneChannelState(admin.id)).notifyByPhone).toBe(true)
    })

    test("the email's «all notifications» link turns off every email summary and the WhatsApp consent", async () => {
        const admin = await signInAsSuperAdmin()
        const a = await createCity({ id: 'ns_off_a', supportsNotifications: true })
        const b = await createCity({ id: 'ns_off_b', supportsNotifications: true })
        await prisma.notificationPreference.createMany({
            data: [
                { userId: admin.id, cityId: a.id, notifyByEmail: true },
                { userId: admin.id, cityId: b.id, notifyByEmail: true },
            ],
        })

        await disableAllNotificationPreferences(admin.id)

        const rows = await prisma.notificationPreference.findMany({ where: { userId: admin.id } })
        expect(rows.map((r) => r.notifyByEmail)).toEqual([false, false])
        expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).notifyByPhone).toBe(false)
    })
})
