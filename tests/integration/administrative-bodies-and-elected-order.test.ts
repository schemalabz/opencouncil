/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import { POST as createBody } from '@/app/api/cities/[cityId]/administrative-bodies/route'
import { PUT as updateBody } from '@/app/api/cities/[cityId]/administrative-bodies/[bodyId]/route'
import { POST as updateElectedOrder } from '@/app/api/cities/[cityId]/roles/elected-order/route'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createPerson, signInAsSuperAdmin } from '../helpers/factories'

// revalidateTag needs a request scope that a route test does not have.
jest.mock('next/cache', () => ({ revalidateTag: jest.fn(), revalidatePath: jest.fn() }))

const cityId = 'testcity'

function jsonRequest(path: string, body: unknown, method = 'POST') {
    return new Request(`http://localhost/api/cities/${cityId}/${path}`, {
        method,
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
    })
}

describe('administrative body and elected order routes', () => {
    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma as any)
        await signInAsSuperAdmin()
        await createCity({ id: cityId })
    })

    it('creates a body with the defaults the route applies', async () => {
        const response = await createBody(
            jsonRequest('administrative-bodies', { name: 'Δημοτική Επιτροπή', name_en: 'Municipal Committee', type: 'committee', diavgeiaUnitIds: '81689, 84655:100010590' }) as never,
            { params: Promise.resolve({ cityId }) },
        )
        expect(response.status).toBe(201)
        expect(await prisma.administrativeBody.findFirstOrThrow({ where: { cityId } })).toMatchObject({
            type: 'committee',
            contactEmails: [],
            notificationBehavior: 'NOTIFICATIONS_APPROVAL',
            showUnreviewedTranscript: true,
            diavgeiaUnitIds: ['81689', '84655:100010590'],
            youtubeChannelUrl: null,
        })
    })

    it('updates a body and rejects an invalid one', async () => {
        const body = await createAdministrativeBody(cityId)
        const params = { params: Promise.resolve({ cityId, bodyId: body.id }) }

        const ok = await updateBody(jsonRequest(`administrative-bodies/${body.id}`, {
            name: 'Council', name_en: 'Council', type: 'council', contactEmails: ['clerk@example.com'], youtubeChannelUrl: '',
        }, 'PUT') as never, params)
        expect(ok.status).toBe(200)
        expect((await prisma.administrativeBody.findUniqueOrThrow({ where: { id: body.id } })).contactEmails).toEqual(['clerk@example.com'])

        const bad = await updateBody(jsonRequest(`administrative-bodies/${body.id}`, {
            name: 'C', name_en: 'Council', type: 'parliament',
        }, 'PUT') as never, params)
        expect(bad.status).toBe(400)
        expect((await prisma.administrativeBody.findUniqueOrThrow({ where: { id: body.id } })).name).toBe('Council')
    })

    it('saves an elected order and rejects a negative one', async () => {
        const body = await createAdministrativeBody(cityId)
        const person = await createPerson(cityId)
        const role = await prisma.role.create({ data: { personId: person.id, administrativeBodyId: body.id } })
        const params = { params: Promise.resolve({ cityId }) }

        const ok = await updateElectedOrder(jsonRequest('roles/elected-order', {
            administrativeBodyId: body.id, rankings: [{ roleId: role.id, electedOrder: 5 }],
        }), params)
        expect(ok.status).toBe(200)
        expect((await prisma.role.findUniqueOrThrow({ where: { id: role.id } })).electedOrder).toBe(5)

        const bad = await updateElectedOrder(jsonRequest('roles/elected-order', {
            administrativeBodyId: body.id, rankings: [{ roleId: role.id, electedOrder: -1 }],
        }), params)
        expect(bad.status).toBe(400)
        expect((await prisma.role.findUniqueOrThrow({ where: { id: role.id } })).electedOrder).toBe(5)
    })
})
