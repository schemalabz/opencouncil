/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import { matchUsersToSubjects } from '@/lib/notifications/matching'
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

describe('notifications matching - proximity and topics', () => {
    const center = { lat: 37.9838, lng: 23.7275 } // Athens approx

    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma as any)
    })

    test('proximity: near (250m) matches within ~200m, not 800m; wide (1000m) matches both', async () => {
        const city = await createCity({ id: 'c1' })
        const verifyCity = await prisma.city.findUnique({ where: { id: city.id } })
        if (!verifyCity) throw new Error(`City ${city.id} was not found after creation`)
        const body = await createAdministrativeBody(city.id)
        const meeting = await createMeeting(city.id, { id: 'm1', administrativeBodyId: body.id })

        // Subject location at center
        const subjLoc = await createLocation({ id: 's_loc', lng: center.lng, lat: center.lat })
        const subject = await createSubject(meeting.id, city.id, { id: 's1', locationId: subjLoc.id })

        // User 1 within ~200m east
        const east200 = metersToLatLngOffset(center.lat, 200, 0)
        const u1Loc = await createLocation({ id: 'u1_loc', lng: center.lng + east200.dLng, lat: center.lat + east200.dLat })
        const u1 = await createUser('u1@example.com')
        await createNotificationPreference({ userId: u1.id, cityId: city.id, locationIds: [u1Loc.id] })

        // User 2 at ~800m north
        const north800 = metersToLatLngOffset(center.lat, 0, 800)
        const u2Loc = await createLocation({ id: 'u2_loc', lng: center.lng + north800.dLng, lat: center.lat + north800.dLat })
        const u2 = await createUser('u2@example.com')
        await createNotificationPreference({ userId: u2.id, cityId: city.id, locationIds: [u2Loc.id] })

        // Gather subjects and user prefs in the shape expected by matcher
        const subjects = [{ id: subject.id, topicId: null, locationId: subjLoc.id }]
        const prefs = await prisma.notificationPreference.findMany({
            where: { cityId: city.id },
            include: { locations: true, interests: true },
        })
        const usersWithPreferences = prefs.map((np) => ({
            userId: np.userId,
            locations: np.locations.map((l) => ({ id: l.id })),
            interests: np.interests.map((t) => ({ id: t.id })),
        }))

        // Near: only u1 should match
        const nearOverrides = { [subject.id]: { topicImportance: 'doNotNotify', proximityImportance: 'near' as const } } as Record<string, { topicImportance: 'doNotNotify' | 'normal' | 'high'; proximityImportance: 'none' | 'near' | 'wide' }>
        const nearMatches = await matchUsersToSubjects(subjects as any, usersWithPreferences as any, nearOverrides)
        expect(nearMatches.get(u1.id)?.size).toBe(1)
        expect(Array.from(nearMatches.get(u1.id) ?? [])[0]).toEqual({ subjectId: subject.id, reason: 'proximity' })
        expect(nearMatches.get(u2.id)?.size ?? 0).toBe(0)

        // Wide: both should match
        const wideOverrides = { [subject.id]: { topicImportance: 'doNotNotify', proximityImportance: 'wide' as const } } as Record<string, { topicImportance: 'doNotNotify' | 'normal' | 'high'; proximityImportance: 'none' | 'near' | 'wide' }>
        const wideMatches = await matchUsersToSubjects(subjects as any, usersWithPreferences as any, wideOverrides)
        expect(wideMatches.get(u1.id)?.size).toBe(1)
        expect(wideMatches.get(u2.id)?.size).toBe(1)
    })

    test('topic rules: normal requires interest; high notifies all; reasons are correct', async () => {
        const city = await createCity({ id: 'c2' })
        const verifyCity = await prisma.city.findUnique({ where: { id: city.id } })
        if (!verifyCity) throw new Error(`City ${city.id} was not found after creation`)
        const body = await createAdministrativeBody(city.id)
        const meeting = await createMeeting(city.id, { id: 'm2', administrativeBodyId: body.id })

        const topic = await createTopic('t1', { name: 'Transport', name_en: 'Transport' })
        const subject = await createSubject(meeting.id, city.id, { id: 's2', topicId: topic.id })

        const interested = await createUser('u3@example.com')
        await createNotificationPreference({ userId: interested.id, cityId: city.id, topicIds: [topic.id] })

        const notInterested = await createUser('u4@example.com')
        await createNotificationPreference({ userId: notInterested.id, cityId: city.id })

        const subjects = [{ id: subject.id, topicId: topic.id, locationId: null }]
        const prefs = await prisma.notificationPreference.findMany({ where: { cityId: city.id }, include: { locations: true, interests: true } })
        const usersWithPreferences = prefs.map((np) => ({
            userId: np.userId,
            locations: np.locations.map((l) => ({ id: l.id })),
            interests: np.interests.map((t) => ({ id: t.id })),
        }))

        // normal: only interested user
        const normalOverrides = { [subject.id]: { topicImportance: 'normal' as const, proximityImportance: 'none' as const } } as Record<string, { topicImportance: 'doNotNotify' | 'normal' | 'high'; proximityImportance: 'none' | 'near' | 'wide' }>
        const normalMatches = await matchUsersToSubjects(subjects as any, usersWithPreferences as any, normalOverrides)
        expect(Array.from(normalMatches.get(interested.id) ?? []).find((m) => m.subjectId === subject.id && m.reason === 'topic')).toBeTruthy()
        expect((normalMatches.get(notInterested.id)?.size ?? 0)).toBe(0)

        // high: everyone; reason generalInterest
        const highOverrides = { [subject.id]: { topicImportance: 'high' as const, proximityImportance: 'none' as const } } as Record<string, { topicImportance: 'doNotNotify' | 'normal' | 'high'; proximityImportance: 'none' | 'near' | 'wide' }>
        const highMatches = await matchUsersToSubjects(subjects as any, usersWithPreferences as any, highOverrides)
        expect(Array.from(highMatches.get(interested.id) ?? []).find((m) => m.reason === 'generalInterest')).toBeTruthy()
        expect(Array.from(highMatches.get(notInterested.id) ?? []).find((m) => m.reason === 'generalInterest')).toBeTruthy()
    })
})


