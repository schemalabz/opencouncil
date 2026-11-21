/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import { ensureRegionFixture, REGION_FIXTURE_CITY_ID } from '@/lib/db/regionFixture'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'

const cityId = REGION_FIXTURE_CITY_ID

async function counts() {
    return {
        cities: await prisma.city.count({ where: { id: cityId } }),
        bodies: await prisma.administrativeBody.count({ where: { cityId } }),
        people: await prisma.person.count({ where: { cityId } }),
        roles: await prisma.role.count({ where: { person: { cityId } } }),
        meetings: await prisma.councilMeeting.count({ where: { cityId } }),
        subjects: await prisma.subject.count({ where: { cityId } }),
        utterances: await prisma.utterance.count({ where: { speakerSegment: { cityId } } }),
        locations: await prisma.location.count({ where: { subjects: { some: { cityId } } } }),
    }
}

describe('ensureRegionFixture (#993)', () => {
    beforeAll(async () => {
        await ensureTestDb()
        await resetDatabase(prisma)
        await ensureRegionFixture(prisma)
    })

    test('adds a pending region with a released meeting, and a second run changes nothing', async () => {
        const first = await counts()
        expect(first).toMatchObject({ cities: 1, bodies: 3, people: 5, meetings: 2, subjects: 2, locations: 2 })
        expect(first.utterances).toBeGreaterThan(0)
        await ensureRegionFixture(prisma)
        expect(await counts()).toEqual(first)

        const city = await prisma.city.findUniqueOrThrow({ where: { id: cityId } })
        expect(city).toMatchObject({ authorityType: 'region', status: 'pending', realm: 'greece' })
        expect(await prisma.councilMeeting.count({ where: { cityId, released: true } })).toBe(2)
    })

    test('has only the body types that a region has', async () => {
        const types = await prisma.administrativeBody.findMany({ where: { cityId }, select: { type: true }, orderBy: { id: 'asc' } })
        expect(types.map(body => body.type).sort()).toEqual(['committee', 'committee', 'council'])
    })

    // The title of the head must come from the catalog, and the deputy keeps a stored name.
    test('stores no role name for the head, and a role name for the deputy', async () => {
        const cityRoles = await prisma.role.findMany({ where: { cityId }, select: { isHead: true, name: true }, orderBy: { isHead: 'desc' } })
        expect(cityRoles).toEqual([
            { isHead: true, name: null },
            { isHead: false, name: 'Αντιπεριφερειάρχης Αγροτικής Ανάπτυξης' },
        ])
    })

    test('stores a MultiPolygon outline, and each subject location is inside it', async () => {
        const [outline] = await prisma.$queryRaw<{ type: string; polygons: number }[]>`
            SELECT GeometryType(geometry) AS type, ST_NumGeometries(geometry)::int AS polygons FROM "City" WHERE id = ${cityId}`
        expect(outline).toEqual({ type: 'MULTIPOLYGON', polygons: 3 })

        const inside = await prisma.$queryRaw<{ text: string; inside: boolean }[]>`
            SELECT l.text, ST_Covers(c.geometry, l.coordinates) AS inside
            FROM "Subject" s JOIN "Location" l ON l.id = s."locationId" JOIN "City" c ON c.id = s."cityId"
            WHERE s."cityId" = ${cityId} ORDER BY l.text`
        expect(inside).toEqual([
            { text: 'Λιμάνι Σκιάθου', inside: true },
            { text: 'Πηνειός, Λάρισα', inside: true },
        ])
    })
})
