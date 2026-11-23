/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import { countEmailRecipientsForMeeting, createNotificationsForMeeting, getNotificationForView, previewNotificationImpact } from '@/lib/db/notifications'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import {
    createAdministrativeBody,
    createCity,
    createLocation,
    createMeeting,
    createNotificationPreference,
    createSpeakerSegment,
    createSpeakerTag,
    createSubject,
    createTopic,
    createUser,
    createUtterance,
    metersToLatLngOffset,
    signInAsSuperAdmin,
} from '../helpers/factories'

describe('createNotificationsForMeeting - end-to-end', () => {
    const center = { lat: 37.9838, lng: 23.7275 }

    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma as any)
    })

    test('creates notifications, subjects and deliveries with correct reasons and stats', async () => {
        const city = await createCity({ id: 'c3', name_municipality: 'Municipality Test', name_municipality_en: 'Municipality Test', supportsNotifications: true })
        // Verify city exists
        const verifyCity = await prisma.city.findUnique({ where: { id: city.id } })
        if (!verifyCity) throw new Error(`City ${city.id} was not found after creation`)

        const body = await createAdministrativeBody(city.id)
        const meeting = await createMeeting(city.id, { id: 'm1', administrativeBodyId: body.id })

        const topic = await createTopic('t2', { name: 'Parks', name_en: 'Parks' })

        // Subject A: topic normal + proximity near
        const subjALoc = await createLocation({ id: 'sa_loc', lng: center.lng, lat: center.lat })
        const subjectA = await createSubject(meeting.id, city.id, { id: 'sa', topicId: topic.id, locationId: subjALoc.id, name: 'Subject A' })

        // Subject B: high importance (general interest)
        const subjectB = await createSubject(meeting.id, city.id, { id: 'sb', topicId: null, locationId: null, name: 'Subject B' })

        // Users and preferences
        const userEmailOnly = await createUser('emailonly@example.com')
        const verifyUser1 = await prisma.user.findUnique({ where: { id: userEmailOnly.id } })
        if (!verifyUser1) throw new Error(`User ${userEmailOnly.id} was not found after creation`)
        await createNotificationPreference({ userId: userEmailOnly.id, cityId: city.id, topicIds: [topic.id] })

        const userWithPhone = await createUser('phone@example.com', { phone: '+306900000001' })
        const p200 = metersToLatLngOffset(center.lat, 200, 0)
        const phoneLoc = await createLocation({ id: 'phone_loc', lng: center.lng + p200.dLng, lat: center.lat + p200.dLat })
        await createNotificationPreference({ userId: userWithPhone.id, cityId: city.id, locationIds: [phoneLoc.id] })

        const userFar = await createUser('far@example.com')
        const p800 = metersToLatLngOffset(center.lat, 0, 800)
        const farLoc = await createLocation({ id: 'far_loc', lng: center.lng + p800.dLng, lat: center.lat + p800.dLat })
        await createNotificationPreference({ userId: userFar.id, cityId: city.id, locationIds: [farLoc.id] })

        const userInterestedNotNear = await createUser('interested@example.com')
        await createNotificationPreference({ userId: userInterestedNotNear.id, cityId: city.id, topicIds: [topic.id] })

        const overrides = {
            [subjectA.id]: { topicImportance: 'normal' as const, proximityImportance: 'near' as const },
            [subjectB.id]: { topicImportance: 'high' as const, proximityImportance: 'none' as const },
        } as Record<string, { topicImportance: 'doNotNotify' | 'normal' | 'high'; proximityImportance: 'none' | 'near' | 'wide' }>

        const result = await createNotificationsForMeeting(city.id, meeting.id, 'beforeMeeting', overrides)

        // Expect one notification per user with preferences in the city (4 users)
        expect(result.notificationsCreated).toBe(4)
        // subjectsTotal is the sum across users of subject matches; at least 1 per user due to subjectB (high)
        expect(result.subjectsTotal).toBeGreaterThanOrEqual(4)

        const notifications = await prisma.notification.findMany({
            where: { cityId: city.id, meetingId: meeting.id, type: 'beforeMeeting' },
            include: { subjects: true, deliveries: true, user: true },
        })
        expect(notifications).toHaveLength(4)

        const byUser = (email: string) => notifications.find((n) => n.user.email === email)!

        // email-only user: should have topic for A and generalInterest for B; deliveries only email
        const nEmailOnly = byUser('emailonly@example.com')
        expect(nEmailOnly.subjects.some((s) => s.subjectId === subjectA.id && s.reason === 'topic')).toBeTruthy()
        expect(nEmailOnly.subjects.some((s) => s.subjectId === subjectB.id && s.reason === 'generalInterest')).toBeTruthy()
        expect(nEmailOnly.deliveries.some((d) => d.medium === 'email' && d.status === 'pending')).toBeTruthy()
        expect(nEmailOnly.deliveries.some((d) => d.medium === 'message')).toBeFalsy()

        // phone user: should have proximity for A and generalInterest for B; the
        // email delivery only — WhatsApp and SMS are Notis's, never a delivery here
        const nPhone = byUser('phone@example.com')
        expect(nPhone.subjects.some((s) => s.subjectId === subjectA.id && s.reason === 'proximity')).toBeTruthy()
        expect(nPhone.subjects.some((s) => s.subjectId === subjectB.id && s.reason === 'generalInterest')).toBeTruthy()
        expect(nPhone.deliveries.some((d) => d.medium === 'email' && d.status === 'pending')).toBeTruthy()
        expect(nPhone.deliveries.some((d) => d.medium === 'message')).toBeFalsy()

        // far user: picked no topic, so A counts by topic even though it is not near; B by general interest
        const nFar = byUser('far@example.com')
        expect(nFar.subjects).toHaveLength(2)
        expect(nFar.subjects.some((s) => s.subjectId === subjectA.id && s.reason === 'topic')).toBeTruthy()
        expect(nFar.subjects.some((s) => s.subjectId === subjectB.id && s.reason === 'generalInterest')).toBeTruthy()

        // interested not near: topic for A + generalInterest for B
        const nInterested = byUser('interested@example.com')
        expect(nInterested.subjects.some((s) => s.subjectId === subjectA.id && s.reason === 'topic')).toBeTruthy()
        expect(nInterested.subjects.some((s) => s.subjectId === subjectB.id && s.reason === 'generalInterest')).toBeTruthy()
    })

    /**
     * Two councils and one youth council in a city, with a subscriber of the
     * city who also follows the youth council, a subscriber of the city
     * alone, and a reader who follows the youth council and picked nothing
     * else. The follower picked a topic the youth agenda does not carry: the
     * follow, not the topic, decides for the youth meeting.
     */
    async function audienceFixture(cityId: string, supportsNotifications: boolean) {
        const city = await createCity({ id: cityId, name_municipality: cityId, name_municipality_en: cityId, supportsNotifications })
        const youth = await createAdministrativeBody(city.id, { name: 'ΔΣΝ', name_en: 'Youth', type: 'youthCouncil' })
        const council = await createAdministrativeBody(city.id)
        const youthMeeting = await createMeeting(city.id, { id: `${cityId}_youth`, administrativeBodyId: youth.id })
        const councilMeeting = await createMeeting(city.id, { id: `${cityId}_council`, administrativeBodyId: council.id })
        await createSubject(youthMeeting.id, city.id, { id: `${cityId}_sy`, topicId: null, locationId: null, name: 'Youth item' })
        await createSubject(councilMeeting.id, city.id, { id: `${cityId}_sc`, topicId: null, locationId: null, name: 'Council high' })

        const culture = await createTopic(`${cityId}_culture`, { name: 'Πολιτισμός', name_en: 'Culture' })
        const follower = await createUser(`follower@${cityId}.example.com`)
        await createNotificationPreference({ userId: follower.id, cityId: city.id, bodyIds: [youth.id], topicIds: [culture.id] })
        const resident = await createUser(`resident@${cityId}.example.com`)
        await createNotificationPreference({ userId: resident.id, cityId: city.id })
        const youthOnly = await createUser(`youth-only@${cityId}.example.com`)
        await createNotificationPreference({ userId: youthOnly.id, cityId: city.id, bodyIds: [youth.id] })

        const high = { [`${cityId}_sc`]: { topicImportance: 'high' as const, proximityImportance: 'none' as const } }
        const notified = async (meetingId: string) =>
            (await prisma.notification.findMany({ where: { meetingId }, include: { user: true } })).map((n) => n.user.email.split('@')[0]).sort()
        return { city, youthMeeting, councilMeeting, high, notified }
    }

    test('a meeting of a secondary body reaches its followers alone; a council meeting reaches every reader of a city that supports notifications (#829)', async () => {
        const { city, youthMeeting, councilMeeting, high, notified } = await audienceFixture('c5', true)

        // The youth subject keeps a pasted agenda's importance: normal, with no topic.
        expect((await createNotificationsForMeeting(city.id, youthMeeting.id, 'beforeMeeting')).notificationsCreated).toBe(2)
        expect((await createNotificationsForMeeting(city.id, councilMeeting.id, 'beforeMeeting', high)).notificationsCreated).toBe(3)

        expect(await notified(youthMeeting.id)).toEqual(['follower', 'youth-only'])
        // The accepted flip: a reader who follows the youth council alone gets the council's meetings too.
        expect(await notified(councilMeeting.id)).toEqual(['follower', 'resident', 'youth-only'])
    })

    test('a council meeting of a city without notifications reaches nobody, old rows included; its youth council still reaches its followers (#829)', async () => {
        const { city, youthMeeting, councilMeeting, high, notified } = await audienceFixture('c7', false)

        expect((await createNotificationsForMeeting(city.id, councilMeeting.id, 'beforeMeeting', high)).notificationsCreated).toBe(0)
        expect(await countEmailRecipientsForMeeting(city.id, councilMeeting.id, 'beforeMeeting')).toBe(0)
        expect((await createNotificationsForMeeting(city.id, youthMeeting.id, 'beforeMeeting')).notificationsCreated).toBe(2)
        expect(await notified(youthMeeting.id)).toEqual(['follower', 'youth-only'])
    })

    test('the impact preview of a manual send counts the readers the send notifies, a follower whose topic is not on the agenda included (#829)', async () => {
        await signInAsSuperAdmin()
        const { city, youthMeeting, councilMeeting, high } = await audienceFixture('c6', true)
        const normal = { c6_sy: { topicImportance: 'normal' as const, proximityImportance: 'none' as const } }

        for (const [meeting, importances] of [[youthMeeting, normal], [councilMeeting, high]] as const) {
            const preview = await previewNotificationImpact(city.id, meeting.id, importances)
            const sent = await createNotificationsForMeeting(city.id, meeting.id, 'beforeMeeting', importances)
            expect({ meeting: meeting.id, total: preview.totalUsers }).toEqual({ meeting: meeting.id, total: sent.notificationsCreated })
        }
        expect((await previewNotificationImpact(city.id, youthMeeting.id, normal)).subjectImpact).toEqual({ c6_sy: 2 })
    })

    test('the impact preview counts a reader once, however many subjects they match (#829)', async () => {
        await signInAsSuperAdmin()
        const { city, councilMeeting } = await audienceFixture('c8', true)
        await createSubject(councilMeeting.id, city.id, { id: 'c8_sc2', topicId: null, locationId: null, name: 'Council high 2' })
        const high = { topicImportance: 'high' as const, proximityImportance: 'none' as const }
        const importances = { c8_sc: high, c8_sc2: high }

        const preview = await previewNotificationImpact(city.id, councilMeeting.id, importances)
        const sent = await createNotificationsForMeeting(city.id, councilMeeting.id, 'beforeMeeting', importances)
        expect(preview).toEqual({ totalUsers: sent.notificationsCreated, subjectImpact: { c8_sc: 3, c8_sc2: 3 } })
        expect(sent.notificationsCreated).toBe(3)
    })

    test('after a meeting, the email and the notification page list the longest discussion first', async () => {
        const city = await createCity({ id: 'c9', name_municipality: 'c9', name_municipality_en: 'c9', supportsNotifications: true })
        const body = await createAdministrativeBody(city.id)
        const meeting = await createMeeting(city.id, { id: 'c9_m', administrativeBodyId: body.id })
        const segment = await createSpeakerSegment(meeting.id, city.id, { speakerTagId: (await createSpeakerTag()).id })
        // The expected order is not the order of creation, not the order by
        // name, and not the order by the number of speakers.
        for (const [name, seconds, speakers] of [['Brief, many speakers', 60, 3], ['A subject with no speech', 0, 0], ['Long discussion', 600, 1]] as const) {
            const subject = await createSubject(meeting.id, city.id, { name, topicId: null, locationId: null })
            await prisma.subject.update({ where: { id: subject.id }, data: { topicImportance: 'high' } })
            await prisma.speakerContribution.createMany({
                data: Array.from({ length: speakers }, (_, order) => ({ subjectId: subject.id, speakerName: `Speaker ${order}`, text: 'Position', order })),
            })
            if (seconds > 0) {
                const utterance = await createUtterance(segment.id, { startTimestamp: 0, endTimestamp: seconds })
                await prisma.utterance.update({ where: { id: utterance.id }, data: { discussionSubjectId: subject.id, discussionStatus: 'SUBJECT_DISCUSSION' } })
            }
        }
        const reader = await createUser('reader@c9.example.com')
        await createNotificationPreference({ userId: reader.id, cityId: city.id })

        const { notificationIds } = await createNotificationsForMeeting(city.id, meeting.id, 'afterMeeting')
        const delivery = await prisma.notificationDelivery.findFirstOrThrow({ where: { notificationId: notificationIds[0], medium: 'email' } })
        const page = await getNotificationForView(notificationIds[0])

        const expected = ['Long discussion', 'Brief, many speakers', 'A subject with no speech']
        expect(delivery.body?.split('\n')).toEqual(expected)
        expect(page?.subjects.map(({ subject }) => subject.name)).toEqual(expected)
    })

    test("respects the preference's notifyByEmail and the person's notifyByPhone", async () => {
        const city = await createCity({ id: 'c4', name_municipality: 'X', name_municipality_en: 'X', supportsNotifications: true })
        const body = await createAdministrativeBody(city.id)
        const meeting = await createMeeting(city.id, { id: 'm2', administrativeBodyId: body.id })
        await createSubject(meeting.id, city.id, { id: 'sh', topicId: null, locationId: null, name: 'High' })

        const uEmail = await createUser('email@example.com', { phone: '+306900000001', notifyByPhone: false })
        await createNotificationPreference({ userId: uEmail.id, cityId: city.id })
        const uSms = await createUser('sms@example.com', { phone: '+306900000002', notifyByPhone: true })
        await createNotificationPreference({ userId: uSms.id, cityId: city.id })
        const uNone = await createUser('none@example.com', { phone: '+306900000003', notifyByPhone: false })
        await createNotificationPreference({ userId: uNone.id, cityId: city.id })

        await prisma.notificationPreference.updateMany({
            where: { userId: { in: [uSms.id, uNone.id] }, cityId: city.id },
            data: { notifyByEmail: false },
        })

        await createNotificationsForMeeting(city.id, meeting.id, 'beforeMeeting', {
            sh: { topicImportance: 'high', proximityImportance: 'none' },
        })

        const notifs = await prisma.notification.findMany({
            where: { cityId: city.id, meetingId: meeting.id },
            include: { deliveries: true, user: true },
        })
        const byEmail = (e: string) => notifs.find(n => n.user.email === e)!

        expect(byEmail('email@example.com').deliveries.map(d => d.medium).sort()).toEqual(['email'])
        // Phone-only: the in-app notification exists with no deliveries at all —
        // the WhatsApp side is Notis's.
        expect(byEmail('sms@example.com').deliveries).toEqual([])
        expect(notifs.find(n => n.user.email === 'none@example.com')).toBeUndefined()
    })
})
