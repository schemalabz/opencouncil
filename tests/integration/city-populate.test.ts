/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import { populateCity } from '@/lib/db/cityPopulate'
import { cityPopulationSchema } from '@/lib/zod-schemas/cityPopulation'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createCity } from '../helpers/factories'

const cityId = 'testcity'

async function populate(body: unknown) {
    return populateCity(cityPopulationSchema.parse(body))
}

const person = (name: string, roles: Record<string, unknown>[]) => ({
    name,
    name_en: name,
    name_short: name,
    name_short_en: name,
    roles,
})

describe('populateCity', () => {
    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma)
        await createCity({ id: cityId })
    })

    it('saves the dates and the elected order of each role', async () => {
        const stats = await populate({
            cityId,
            parties: [{ name: 'Party', name_en: 'Party', name_short: 'PA', name_short_en: 'PA', colorHex: '#123456' }],
            administrativeBodies: [{ name: 'Council', name_en: 'Council', type: 'council' }],
            people: [
                person('Former deputy mayor', [
                    { type: 'city', name: 'Deputy mayor', endDate: '2026-09-24T21:00:00.000Z' },
                ]),
                person('Councillor', [
                    { type: 'adminBody', administrativeBodyName: 'Council', startDate: '2024-01-01', electedOrder: 2 },
                    { type: 'party', partyName: 'Party' },
                ]),
            ],
        })

        expect(stats).toEqual({ partiesCount: 1, peopleCount: 2, rolesCount: 3, adminBodiesCount: 1 })
        // The factory makes a demo city: an import leaves it pending until a superadmin checks it.
        expect((await prisma.city.findUniqueOrThrow({ where: { id: cityId } })).status).toBe('pending')

        const roles = await prisma.role.findMany({
            include: { person: true },
            orderBy: { person: { name: 'asc' } },
        })
        const byKind = Object.fromEntries(roles.map(role => [
            `${role.person.name}:${role.cityId ? 'city' : role.partyId ? 'party' : 'body'}`,
            { startDate: role.startDate?.toISOString() ?? null, endDate: role.endDate?.toISOString() ?? null, electedOrder: role.electedOrder },
        ]))

        expect(byKind).toEqual({
            'Former deputy mayor:city': { startDate: null, endDate: '2026-09-24T21:00:00.000Z', electedOrder: null },
            'Councillor:body': { startDate: '2024-01-01T00:00:00.000Z', endDate: null, electedOrder: 2 },
            'Councillor:party': { startDate: null, endDate: null, electedOrder: null },
        })
    })

    it('saves the Diavgeia units and the YouTube channel of a body, and none when the payload has none', async () => {
        await populate({
            cityId,
            parties: [],
            administrativeBodies: [
                {
                    name: 'Council', name_en: 'Council', type: 'council',
                    diavgeiaUnitIds: ['83734', '84655:100010590'], youtubeChannelUrl: 'https://www.youtube.com/@city',
                },
                { name: 'Committee', name_en: 'Committee', type: 'committee' },
            ],
            people: [],
        })

        const bodies = await prisma.administrativeBody.findMany({
            where: { cityId },
            select: { name: true, diavgeiaUnitIds: true, youtubeChannelUrl: true },
            orderBy: { name: 'asc' },
        })
        expect(bodies).toEqual([
            { name: 'Committee', diavgeiaUnitIds: [], youtubeChannelUrl: null },
            { name: 'Council', diavgeiaUnitIds: ['83734', '84655:100010590'], youtubeChannelUrl: 'https://www.youtube.com/@city' },
        ])
    })
})
