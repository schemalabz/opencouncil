/** @jest-environment node */
import { NextRequest } from 'next/server'
import prisma from '@/lib/db/prisma'
import { POST } from '@/app/api/cities/[cityId]/populate/route'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createCity, signInAsSuperAdmin } from '../helpers/factories'

const cityId = 'testcity'

function populate(body: unknown) {
    const request = new NextRequest(`http://localhost/api/cities/${cityId}/populate`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
    })
    return POST(request, { params: Promise.resolve({ cityId }) })
}

const person = (name: string, roles: Record<string, unknown>[]) => ({
    name,
    name_en: name,
    name_short: name,
    name_short_en: name,
    roles,
})

describe('POST /api/cities/[cityId]/populate', () => {
    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma as any)
        await signInAsSuperAdmin()
        await createCity({ id: cityId })
    })

    it('saves the dates and the elected order of each role', async () => {
        const response = await populate({
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

        expect(response.status).toBe(200)

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

    it('rejects a role that ends before it starts and writes nothing', async () => {
        const response = await populate({
            cityId,
            parties: [],
            administrativeBodies: [{ name: 'Council', name_en: 'Council', type: 'council' }],
            people: [person('Councillor', [
                { type: 'adminBody', administrativeBodyName: 'Council', startDate: '2026-09-25', endDate: '2026-09-24' },
            ])],
        })

        expect(response.status).toBe(400)
        expect(await prisma.person.count()).toBe(0)
    })
})
