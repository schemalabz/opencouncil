/** @jest-environment node */
// The tier is a column of the body (#829), so a body of any type can be
// secondary: a municipal company that the import typed `council`, for one.
// These tests hold the Prisma rules and their raw-SQL twin to the column.
// The map query sits behind Next's cache, which has no store outside a request.
jest.mock('@/lib/cache/index', () => ({
    ...jest.requireActual('@/lib/cache/index'),
    createCache: <T>(fn: () => Promise<T>) => fn,
}))

import prisma from '@/lib/db/prisma'
import { getCouncilMeetingsForCity } from '@/lib/db/meetingsList'
import { getMapCitiesCached, isCityPublicThroughSecondary } from '@/lib/db/cities'
import { PUBLIC_CITY_WHERE } from '@/lib/cityStatus'
import { resetDatabase, ensureTestDb } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting, signInAsSuperAdmin } from '../helpers/factories'

const CITY = 'tiercity'
const PENDING = 'tierpending'
const SQUARE = 'POLYGON((23 38, 23.1 38, 23.1 38.1, 23 38.1, 23 38))'

describe('the tier is the body\'s own column (#829)', () => {
    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma)
        await signInAsSuperAdmin()
    })

    test('a secondary body of type council stays out of the list, of its type\'s chip, and in under every tier', async () => {
        await createCity({ id: CITY, status: 'supported' })
        const council = await createAdministrativeBody(CITY, { type: 'council', name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council' })
        const company = await createAdministrativeBody(CITY, { type: 'council', tier: 'secondary', name: 'Ζήρεια Α.Ε.', name_en: 'Ziria SA' })
        await createMeeting(CITY, { id: 'council_meeting', administrativeBodyId: council.id, released: true })
        await createMeeting(CITY, { id: 'company_meeting', administrativeBodyId: company.id, released: true })

        const ids = async (options: Parameters<typeof getCouncilMeetingsForCity>[1]) =>
            (await getCouncilMeetingsForCity(CITY, options)).map(meeting => meeting.id).sort()

        expect(await ids({})).toEqual(['council_meeting'])
        expect(await ids({ scope: { types: ['council'] } })).toEqual(['council_meeting'])
        expect(await ids({ scope: { tier: 'secondary' } })).toEqual(['company_meeting'])
        expect(await ids({ scope: { tier: 'all' } })).toEqual(['company_meeting', 'council_meeting'])
        expect(await ids({ scope: { tier: 'all', types: ['council'] } })).toEqual(['company_meeting', 'council_meeting'])
    })

    test('a youth council made primary shows by default and under its type', async () => {
        await createCity({ id: CITY, status: 'supported' })
        const youth = await createAdministrativeBody(CITY, { type: 'youthCouncil', tier: 'primary', name: 'Δημοτικό Συμβούλιο Νέων', name_en: 'Youth Council' })
        await createMeeting(CITY, { id: 'youth_meeting', administrativeBodyId: youth.id, released: true })

        expect((await getCouncilMeetingsForCity(CITY, {})).map(meeting => meeting.id)).toEqual(['youth_meeting'])
        expect((await getCouncilMeetingsForCity(CITY, { scope: { types: ['youthCouncil'] } })).map(meeting => meeting.id)).toEqual(['youth_meeting'])
    })

    test('a released meeting of a secondary body makes a pending city public, in Prisma and in the map\'s SQL alike', async () => {
        await createCity({ id: PENDING, status: 'pending' })
        await prisma.$executeRaw`UPDATE "City" SET geometry = ST_GeomFromText(${SQUARE}, 4326) WHERE id = ${PENDING}`
        const company = await createAdministrativeBody(PENDING, { type: 'council', tier: 'secondary', name: 'Ζήρεια Α.Ε.', name_en: 'Ziria SA' })
        const meeting = await createMeeting(PENDING, { id: 'company_meeting', administrativeBodyId: company.id, released: false })

        const publicInPrisma = async () => (await prisma.city.count({ where: { id: PENDING, ...PUBLIC_CITY_WHERE } })) > 0
        const publicInSql = async () => (await getMapCitiesCached('greece')).some(city => city.id === PENDING)

        expect(await publicInPrisma()).toBe(false)
        expect(await publicInSql()).toBe(false)

        await prisma.councilMeeting.update({ where: { cityId_id: { cityId: PENDING, id: meeting.id } }, data: { released: true } })
        expect(await isCityPublicThroughSecondary(PENDING)).toBe(true)
        expect(await publicInPrisma()).toBe(true)
        expect(await publicInSql()).toBe(true)

        // The same body, primary: a pending city stays private, whatever its meetings.
        await prisma.administrativeBody.update({ where: { id: company.id }, data: { tier: 'primary' } })
        expect(await publicInPrisma()).toBe(false)
        expect(await publicInSql()).toBe(false)
    })
})
