/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import { ensureTestUsers, testUserId } from '@/lib/db/testUsers'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting, createPerson, createSpeakerSegment, createSpeakerTag, createTopic, createUser } from '../helpers/factories'

async function createParty(id: string, cityId: string, roleHolders: string[]) {
    await prisma.party.create({ data: { id, cityId, name: id, name_en: id, name_short: id, name_short_en: id, colorHex: '#123456' } })
    for (const personId of roleHolders) await prisma.role.create({ data: { personId, partyId: id } })
}

async function giveSegments(personId: string, meetingId: string, cityId: string, count: number) {
    const tag = await createSpeakerTag({ personId })
    for (let i = 0; i < count; i++) await createSpeakerSegment(meetingId, cityId, { speakerTagId: tag.id, startTimestamp: i * 10, endTimestamp: i * 10 + 5 })
}

async function rightsOf(email: string) {
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { administers: { select: { cityId: true, partyId: true, personId: true, claimedAt: true } } } })
    return user.administers
}

describe('ensureTestUsers', () => {
    let quiet: { id: string }
    let busy: { id: string }
    let other: { id: string }

    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma)
        await createCity({ id: 'alpha', status: 'supported' })
        await createCity({ id: 'beta', status: 'supported' })
        await createCity({ id: 'pending-town', status: 'pending' })
        await createTopic('topic-a')
        await createTopic('topic-b')

        // In alpha, `busy` speaks most and `big` has the most roles.
        quiet = await createPerson('alpha', { name: 'Quiet' })
        busy = await createPerson('alpha', { name: 'Busy' })
        // The council of alpha has more meetings, but the body admin gets the committee:
        // the city admin already covers the council. beta has only a council.
        await createAdministrativeBody('alpha', { id: 'alpha-council', type: 'council' })
        await createAdministrativeBody('alpha', { id: 'alpha-committee', type: 'committee' })
        await createAdministrativeBody('beta', { id: 'beta-council', type: 'council' })
        const alphaMeeting = await createMeeting('alpha', { id: 'alpha-m', administrativeBodyId: 'alpha-council' })
        await createMeeting('alpha', { id: 'alpha-m2', administrativeBodyId: 'alpha-council' })
        await createMeeting('alpha', { id: 'alpha-committee-m', administrativeBodyId: 'alpha-committee' })
        await giveSegments(quiet.id, alphaMeeting.id, 'alpha', 1)
        await giveSegments(busy.id, alphaMeeting.id, 'alpha', 3)
        await createParty('small', 'alpha', [quiet.id])
        await createParty('big', 'alpha', [quiet.id, busy.id])

        // beta has a party without roles, and one speaking person.
        other = await createPerson('beta', { name: 'Other' })
        const betaMeeting = await createMeeting('beta', { id: 'beta-m' })
        await giveSegments(other.id, betaMeeting.id, 'beta', 1)
        await createParty('lonely', 'beta', [])

        // A pending city is not supported, so no test account administers it.
        const pendingPerson = await createPerson('pending-town', { name: 'Pending' })
        const pendingMeeting = await createMeeting('pending-town', { id: 'pending-m' })
        await giveSegments(pendingPerson.id, pendingMeeting.id, 'pending-town', 5)
        await createParty('pending-party', 'pending-town', [pendingPerson.id])
    })

    test('scopes each account to the supported cities', async () => {
        const users = await ensureTestUsers(prisma)
        expect(users.map((u) => [u.adminType, u.id])).toEqual([
            ['superadmin', testUserId('superadmin')],
            ['city', testUserId('city')],
            ['party', testUserId('party')],
            ['person', testUserId('person')],
            ['body', testUserId('body')],
            ['readonly', testUserId('readonly')],
        ])
        const byType = Object.fromEntries(users.map((u) => [u.adminType, u]))
        expect(byType.superadmin.isSuperAdmin).toBe(true)
        expect(byType.city.administers.map((a) => a.cityId)).toEqual(['alpha', 'beta'])
        expect(byType.party.administers.map((a) => a.partyId).sort()).toEqual(['big', 'lonely'])
        expect(byType.person.administers.map((a) => a.personId).sort()).toEqual([busy.id, other.id].sort())
        expect((await rightsOf('person@test.com')).every((a) => a.claimedAt !== null)).toBe(true)
        expect(byType.body.administers.map((a) => a.administrativeBodyId)).toEqual(['alpha-committee', 'beta-council'])
        expect(byType.readonly.administers).toEqual([])
        // The superadmin follows two cities; the others follow the first.
        expect(byType.superadmin.notificationPreferences.map((p) => p.cityId)).toEqual(['alpha', 'beta'])
        expect(byType.readonly.notificationPreferences.map((p) => p.cityId)).toEqual(['alpha'])
        expect(byType.readonly.phone).toBe('+306990000005')
    })

    test('a second run adds nothing, and a run after a removal puts the right back', async () => {
        await ensureTestUsers(prisma)
        const before = await prisma.administers.count()
        await ensureTestUsers(prisma)
        expect(await prisma.administers.count()).toBe(before)

        await prisma.administers.deleteMany({ where: { userId: testUserId('city'), cityId: 'beta' } })
        await ensureTestUsers(prisma)
        expect((await rightsOf('city@test.com')).map((a) => a.cityId).sort()).toEqual(['alpha', 'beta'])
        expect(await prisma.administers.count()).toBe(before)
    })

    // On staging, councillors claim their own pages, and a person has at most one claim.
    test('claims the busiest person that no other account has claimed, and keeps that claim', async () => {
        const councillor = await createUser('councillor@example.org')
        await prisma.administers.create({ data: { userId: councillor.id, personId: busy.id, claimedAt: new Date() } })
        await ensureTestUsers(prisma)
        expect((await rightsOf('person@test.com')).map((a) => a.personId).sort()).toEqual([quiet.id, other.id].sort())
        expect(await rightsOf('councillor@example.org')).toEqual([expect.objectContaining({ personId: busy.id })])

        // The person admin's own claim from an earlier run does not count as another account's.
        await prisma.administers.deleteMany({ where: { userId: councillor.id } })
        await ensureTestUsers(prisma)
        expect((await rightsOf('person@test.com')).map((a) => a.personId).sort()).toEqual([quiet.id, busy.id, other.id].sort())
        const before = await prisma.administers.count()
        await ensureTestUsers(prisma)
        expect(await prisma.administers.count()).toBe(before)
    })

    test('keeps the id of an account that an earlier seed created, and a right added by hand', async () => {
        const earlier = await createUser('city@test.com', { name: 'Chania Admin (chania)' })
        await prisma.administers.create({ data: { userId: earlier.id, cityId: 'pending-town' } })
        const users = await ensureTestUsers(prisma)
        const cityAdmin = users.find((u) => u.adminType === 'city')
        expect(cityAdmin?.id).toBe(earlier.id)
        expect(cityAdmin?.administers.map((a) => a.cityId)).toEqual(['alpha', 'beta', 'pending-town'])
    })
})
