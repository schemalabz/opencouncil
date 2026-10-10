/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import { POST as createParty } from '@/app/api/cities/[cityId]/parties/route'
import { POST as createPerson } from '@/app/api/cities/[cityId]/people/route'
import { PUT as updateParty } from '@/app/api/cities/[cityId]/parties/[partyId]/route'
import { PUT as updatePerson } from '@/app/api/cities/[cityId]/people/[personId]/route'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createCity, signInAsSuperAdmin } from '../helpers/factories'

// revalidateTag needs a request scope that a route test does not have.
jest.mock('next/cache', () => ({ revalidateTag: jest.fn(), revalidatePath: jest.fn() }))
jest.mock('@/lib/s3', () => ({ uploadFile: jest.fn(async (file: File) => ({ url: `https://cdn.example.com/${file.name}` })) }))

const cityId = 'testcity'
const params = { params: Promise.resolve({ cityId }) }

function formRequest(path: string, fields: Record<string, string | File>, method = 'POST') {
    const body = new FormData()
    for (const [key, value] of Object.entries(fields)) body.append(key, value)
    return new Request(`http://localhost/api/cities/${cityId}/${path}`, { method, body })
}

const party = { name: 'Party', name_en: 'Party', name_short: 'PA', name_short_en: 'PA', colorHex: '#123456' }
const person = { name: 'Councillor', name_en: 'Councillor', name_short: 'Co', name_short_en: 'Co' }

describe('party and person writes validate their input', () => {
    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma as any)
        await signInAsSuperAdmin()
        await createCity({ id: cityId })
    })

    it('creates a valid party', async () => {
        const response = await createParty(formRequest('parties', party), params)
        expect(response.status).toBe(200)
        expect(await prisma.party.count()).toBe(1)
    })

    it('rejects a party with an invalid color and writes nothing', async () => {
        const response = await createParty(formRequest('parties', { ...party, colorHex: 'red' }), params)
        expect(response.status).toBe(400)
        expect((await response.json()).error[0].path).toEqual(['colorHex'])
        expect(await prisma.party.count()).toBe(0)
    })

    it('creates a person with the dates and the elected order of each role', async () => {
        const response = await createPerson(formRequest('people', {
            ...person,
            roles: JSON.stringify([
                { cityId, name: 'Deputy mayor', endDate: '2026-09-24T21:00:00.000Z' },
                { cityId, name: '  ', electedOrder: 3 },
            ]),
        }), params)

        expect(response.status).toBe(200)
        const roles = await prisma.role.findMany({ orderBy: { electedOrder: 'asc' } })
        expect(roles.map(role => ({ name: role.name, endDate: role.endDate?.toISOString() ?? null, electedOrder: role.electedOrder })))
            .toEqual(expect.arrayContaining([
                { name: 'Deputy mayor', endDate: '2026-09-24T21:00:00.000Z', electedOrder: null },
                { name: null, endDate: null, electedOrder: 3 },
            ]))
    })

    it('rejects a person whose role ends before it starts and writes nothing', async () => {
        const response = await createPerson(formRequest('people', {
            ...person,
            roles: JSON.stringify([{ cityId, startDate: '2026-09-25', endDate: '2026-09-24' }]),
        }), params)
        expect(response.status).toBe(400)
        expect(await prisma.person.count()).toBe(0)
    })

    it('rejects a person without a name', async () => {
        const response = await createPerson(formRequest('people', { ...person, name: '', roles: '[]' }), params)
        expect(response.status).toBe(400)
        expect(await prisma.person.count()).toBe(0)
    })

    describe('uploads', () => {
        const image = (name: string) => new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' })

        it('uploads the logo of a new party', async () => {
            const response = await createParty(formRequest('parties', { ...party, logo: image('logo.png') }), params)
            expect(response.status).toBe(200)
            expect((await prisma.party.findFirstOrThrow()).logo).toBe('https://cdn.example.com/logo.png')
        })

        it('uploads the photo of a person on update', async () => {
            const existing = await prisma.person.create({ data: { ...person, cityId } })
            const response = await updatePerson(
                formRequest(`people/${existing.id}`, { ...person, roles: '[]', image: image('photo.png') }, 'PUT'),
                { params: Promise.resolve({ cityId, personId: existing.id }) },
            )
            expect(response.status).toBe(200)
            expect((await prisma.person.findUniqueOrThrow({ where: { id: existing.id } })).image).toBe('https://cdn.example.com/photo.png')
        })

        it('rejects a logo that is text, not a file', async () => {
            const response = await createParty(formRequest('parties', { ...party, logo: 'not-a-file' }), params)
            expect(response.status).toBe(400)
            expect(await prisma.party.count()).toBe(0)
        })
    })

    describe('updates', () => {
        it('updates a party and removes its logo', async () => {
            const existing = await prisma.party.create({ data: { ...party, cityId, logo: 'https://example.com/logo.png' } })
            const response = await updateParty(
                formRequest(`parties/${existing.id}`, { ...party, name: 'Renamed', removeLogo: 'true' }, 'PUT'),
                { params: Promise.resolve({ cityId, partyId: existing.id }) },
            )
            expect(response.status).toBe(200)
            expect(await prisma.party.findUniqueOrThrow({ where: { id: existing.id } }))
                .toMatchObject({ name: 'Renamed', logo: null })
        })

        it('keeps the logo when the update does not remove it', async () => {
            const existing = await prisma.party.create({ data: { ...party, cityId, logo: 'https://example.com/logo.png' } })
            const response = await updateParty(
                formRequest(`parties/${existing.id}`, { ...party, name: 'Renamed' }, 'PUT'),
                { params: Promise.resolve({ cityId, partyId: existing.id }) },
            )
            expect(response.status).toBe(200)
            expect((await prisma.party.findUniqueOrThrow({ where: { id: existing.id } })).logo).toBe('https://example.com/logo.png')
        })

        it('rejects an invalid party update and changes nothing', async () => {
            const existing = await prisma.party.create({ data: { ...party, cityId } })
            const response = await updateParty(
                formRequest(`parties/${existing.id}`, { ...party, name: 'X', colorHex: '#12' }, 'PUT'),
                { params: Promise.resolve({ cityId, partyId: existing.id }) },
            )
            expect(response.status).toBe(400)
            expect((await response.json()).error.map((issue: { path: string[] }) => issue.path[0]).sort()).toEqual(['colorHex', 'name'])
            expect((await prisma.party.findUniqueOrThrow({ where: { id: existing.id } })).name).toBe('Party')
        })

        // The shape PersonForm sends: RoleWithRelations fields, dates serialized from Date objects.
        it('replaces the roles of a person as the person form sends them', async () => {
            const existing = await prisma.person.create({ data: { ...person, cityId, roles: { create: [{ cityId, name: 'Old role' }] } } })
            const partyRow = await prisma.party.create({ data: { ...party, cityId } })
            const roles = [
                { id: 'temp-1', personId: existing.id, cityId, partyId: null, administrativeBodyId: null, isHead: true,
                  name: 'Δήμαρχος', name_en: 'Mayor', startDate: new Date('2023-12-31T22:00:00.000Z'), endDate: null, electedOrder: null },
                { id: 'temp-2', personId: existing.id, cityId: null, partyId: partyRow.id, administrativeBodyId: null, isHead: false,
                  name: null, name_en: null, startDate: null, endDate: new Date('2026-09-24T21:00:00.000Z'), electedOrder: 2 },
            ]
            const response = await updatePerson(
                formRequest(`people/${existing.id}`, { ...person, profileUrl: '', roles: JSON.stringify(roles) }, 'PUT'),
                { params: Promise.resolve({ cityId, personId: existing.id }) },
            )
            expect(response.status).toBe(200)
            const saved = await prisma.role.findMany({ where: { personId: existing.id }, orderBy: { isHead: 'desc' } })
            expect(saved.map(role => ({
                name: role.name, isHead: role.isHead, partyId: role.partyId,
                startDate: role.startDate?.toISOString() ?? null, endDate: role.endDate?.toISOString() ?? null, electedOrder: role.electedOrder,
            }))).toEqual([
                { name: 'Δήμαρχος', isHead: true, partyId: null, startDate: '2023-12-31T22:00:00.000Z', endDate: null, electedOrder: null },
                { name: null, isHead: false, partyId: partyRow.id, startDate: null, endDate: '2026-09-24T21:00:00.000Z', electedOrder: 2 },
            ])
        })

        // A person who claimed their own page sends no roles (#828); the
        // update goes through and the roles stay as they are.
        it('keeps the roles when an update omits them', async () => {
            const existing = await prisma.person.create({ data: { ...person, cityId, roles: { create: [{ cityId, name: 'Kept' }] } } })
            const response = await updatePerson(
                formRequest(`people/${existing.id}`, { ...person }, 'PUT'),
                { params: Promise.resolve({ cityId, personId: existing.id }) },
            )
            expect(response.status).toBe(200)
            expect(await prisma.role.count({ where: { personId: existing.id, name: 'Kept' } })).toBe(1)
        })

        it('still rejects a role that names a party of another city', async () => {
            await createCity({ id: 'othercity' })
            const foreign = await prisma.party.create({ data: { ...party, cityId: 'othercity' } })
            const existing = await prisma.person.create({ data: { ...person, cityId } })
            const response = await updatePerson(
                formRequest(`people/${existing.id}`, { ...person, roles: JSON.stringify([{ partyId: foreign.id }]) }, 'PUT'),
                { params: Promise.resolve({ cityId, personId: existing.id }) },
            )
            expect(response.status).toBe(400)
            expect(await prisma.role.count({ where: { personId: existing.id } })).toBe(0)
        })
    })
})
