/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import { createNotificationsForMeeting } from '@/lib/db/notifications'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import {
    createAdministrativeBody,
    createCity,
    createLocation,
    createMeeting,
    createNotificationPreference,
    createSubject,
    createTopic,
    createUser,
    metersToLatLngOffset,
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
        const city = await createCity({ id: 'c3', name_municipality: 'Municipality Test', name_municipality_en: 'Municipality Test' })
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

        // phone user: should have proximity for A and generalInterest for B; deliveries include message
        const nPhone = byUser('phone@example.com')
        expect(nPhone.subjects.some((s) => s.subjectId === subjectA.id && s.reason === 'proximity')).toBeTruthy()
        expect(nPhone.subjects.some((s) => s.subjectId === subjectB.id && s.reason === 'generalInterest')).toBeTruthy()
        expect(nPhone.deliveries.some((d) => d.medium === 'email' && d.status === 'pending')).toBeTruthy()
        expect(nPhone.deliveries.some((d) => d.medium === 'message' && d.status === 'pending')).toBeTruthy()

        // far user: only generalInterest for B
        const nFar = byUser('far@example.com')
        expect(nFar.subjects.length).toBe(1)
        expect(nFar.subjects[0].subjectId).toBe(subjectB.id)
        expect(nFar.subjects[0].reason).toBe('generalInterest')

        // interested not near: topic for A + generalInterest for B
        const nInterested = byUser('interested@example.com')
        expect(nInterested.subjects.some((s) => s.subjectId === subjectA.id && s.reason === 'topic')).toBeTruthy()
        expect(nInterested.subjects.some((s) => s.subjectId === subjectB.id && s.reason === 'generalInterest')).toBeTruthy()
    })
})


