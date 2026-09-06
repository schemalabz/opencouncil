/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import {
    getPhoneChannelState,
    saveNotificationPreferences,
    setNotifyByPhoneForUser,
} from '@/lib/db/notifications'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createCity, createTopic, signInAsSuperAdmin } from '../helpers/factories'

/**
 * The signup's delivery step and the profile switch write channel consent
 * through these; Notis reads it back through the notis_fanout_targets view.
 */
describe('notification signup channel consent', () => {
    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma as any)
    })

    test('persists both channel flags on a new preference and on an update', async () => {
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
        expect(first).toMatchObject({ notifyByPhone: true, notifyByEmail: false })
        const user = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })
        expect(user.phone).toBe('+306900000001')

        // Unticking WhatsApp sends no phone: the row loses the channel, the
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
        expect(second).toMatchObject({ notifyByPhone: false, notifyByEmail: true })
        expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).phone).toBe('+306900000001')
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

    test('an older caller that sends no flags keeps the schema defaults', async () => {
        const admin = await signInAsSuperAdmin()
        const city = await createCity({ id: 'ns_city3', supportsNotifications: true })

        const result = await saveNotificationPreferences({ cityId: city.id, locations: [], topicIds: [] })
        expect(result.success).toBe(true)

        const row = await prisma.notificationPreference.findUniqueOrThrow({
            where: { userId_cityId: { userId: admin.id, cityId: city.id } },
        })
        expect(row).toMatchObject({ notifyByPhone: true, notifyByEmail: true })
    })

    test('the profile switch flips notifyByPhone across every city and reads it back', async () => {
        const admin = await signInAsSuperAdmin()
        const a = await createCity({ id: 'ns_a', supportsNotifications: true })
        const b = await createCity({ id: 'ns_b', supportsNotifications: true })
        await prisma.notificationPreference.createMany({
            data: [
                { userId: admin.id, cityId: a.id, notifyByPhone: true },
                { userId: admin.id, cityId: b.id, notifyByPhone: false },
            ],
        })
        await prisma.user.update({ where: { id: admin.id }, data: { phone: '+306900000002' } })

        expect(await getPhoneChannelState(admin.id)).toEqual({ notifyByPhoneAny: true, phone: '+306900000002' })

        await setNotifyByPhoneForUser(admin.id, false)
        expect(await getPhoneChannelState(admin.id)).toEqual({ notifyByPhoneAny: false, phone: '+306900000002' })
        const rows = await prisma.notificationPreference.findMany({ where: { userId: admin.id } })
        expect(rows.map((r) => r.notifyByPhone)).toEqual([false, false])

        await setNotifyByPhoneForUser(admin.id, true)
        expect((await getPhoneChannelState(admin.id)).notifyByPhoneAny).toBe(true)
    })
})
