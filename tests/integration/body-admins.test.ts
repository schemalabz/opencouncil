/**
 * The admins of one administrative body (#828): a body admin invites and
 * removes the admins of their body. The cap and the last-admin rule must
 * hold when two requests arrive at the same time, so these run against a
 * real database.
 */
import prisma from '@/lib/db/prisma'
import { BadRequestError } from '@/lib/api/errors'
import { addBodyAdmin, removeBodyAdmin } from '@/lib/db/bodyAdmins'
import { editPerson } from '@/lib/db/people'
import { GET as listMeetings } from '@/app/api/cities/[cityId]/meetings/route'
import { NextRequest } from 'next/server'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting, createUser } from '../helpers/factories'
import { __setSessionEmail } from '../mocks/auth'

jest.mock('@/lib/auth/invite', () => ({ sendInviteEmail: jest.fn().mockResolvedValue(true) }))

const CITY = 'bodycity'
const MAX_ADMINS_PER_BODY = 20

let bodyId: string

let admin: { id: string; email: string }

async function signInAsBodyAdmin() {
    admin = await createUser('secretary@integration.test')
    await prisma.administers.create({ data: { userId: admin.id, administrativeBodyId: bodyId } })
    __setSessionEmail(admin.email)
    return admin
}

async function fillBody(total: number) {
    const current = await prisma.administers.count({ where: { administrativeBodyId: bodyId } })
    for (let i = current; i < total; i++) {
        const user = await createUser(`filler${i}@integration.test`)
        await prisma.administers.create({ data: { userId: user.id, administrativeBodyId: bodyId } })
    }
}

const adminCount = () => prisma.administers.count({ where: { administrativeBodyId: bodyId } })

describe('body admins', () => {
    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma)
        await createCity({ id: CITY })
        bodyId = (await createAdministrativeBody(CITY, { name: 'Youth council', name_en: 'Youth council', type: 'committee' })).id
        await signInAsBodyAdmin()
    })

    it('holds the cap when invites of new emails arrive at the same time', async () => {
        await fillBody(MAX_ADMINS_PER_BODY - 1)

        const results = await Promise.allSettled(
            ['a', 'b', 'c'].map(name => addBodyAdmin(CITY, bodyId, { email: `${name}@integration.test` })),
        )

        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
        for (const r of results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')) {
            expect(r.reason).toBeInstanceOf(BadRequestError)
        }
        expect(await adminCount()).toBe(MAX_ADMINS_PER_BODY)
    })

    it('counts an existing account against the cap', async () => {
        await fillBody(MAX_ADMINS_PER_BODY)
        await createUser('existing@integration.test')

        await expect(addBodyAdmin(CITY, bodyId, { email: 'existing@integration.test' })).rejects.toThrow(BadRequestError)
        expect(await adminCount()).toBe(MAX_ADMINS_PER_BODY)
    })

    it('returns the existing row for an account that is already an admin, at the cap', async () => {
        await fillBody(MAX_ADMINS_PER_BODY)

        const result = await addBodyAdmin(CITY, bodyId, { email: 'filler5@integration.test' })

        expect(result.created).toBe(false)
        expect(result.admin.email).toBe('filler5@integration.test')
        expect(await adminCount()).toBe(MAX_ADMINS_PER_BODY)
    })

    it('makes one account and one admin row for one new email invited twice at once', async () => {
        const results = await Promise.all([
            addBodyAdmin(CITY, bodyId, { email: 'twice@integration.test' }),
            addBodyAdmin(CITY, bodyId, { email: 'twice@integration.test' }),
        ])

        expect(results.filter(r => r.created)).toHaveLength(1)
        expect(await prisma.user.count({ where: { email: 'twice@integration.test' } })).toBe(1)
        expect(await prisma.administers.count({ where: { administrativeBodyId: bodyId, user: { email: 'twice@integration.test' } } })).toBe(1)
    })

    it('does not let two admins who remove each other at once leave the body with none', async () => {
        const other = await createUser('colleague@integration.test')
        await prisma.administers.create({ data: { userId: other.id, administrativeBodyId: bodyId } })
        const me = await prisma.user.findUniqueOrThrow({ where: { email: 'secretary@integration.test' } })

        const results = await Promise.allSettled([
            removeBodyAdmin(CITY, bodyId, other.id),
            removeBodyAdmin(CITY, bodyId, me.id),
        ])

        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
        expect(await adminCount()).toBe(1)
    })

    describe('the members of the body', () => {
        const details = { name: 'Member', name_en: 'Member', name_short: 'M', name_short_en: 'M', profileUrl: null }
        const role = { name: null, name_en: null, isHead: false, startDate: null, endDate: null, electedOrder: null }
        const personWithRoles = (roles: { cityId?: string; administrativeBodyId?: string; name?: string }[]) =>
            prisma.person.create({ data: { ...details, profileUrl: undefined, cityId: CITY, roles: { create: roles } } })

        it('lets a body admin replace the roles of a person whose roles are all on their body', async () => {
            const person = await personWithRoles([{ administrativeBodyId: bodyId, name: 'Old' }])
            await editPerson(person.id, { ...details, roles: [{ ...role, administrativeBodyId: bodyId, name: 'New' }] })
            expect((await prisma.role.findMany({ where: { personId: person.id } })).map(role => role.name)).toEqual(['New'])
        })

        // An account with a body row and a person row passes the person check.
        // The role gate must still refuse a person with a role outside the body.
        it('does not let a body admin with a person row replace the roles of a councillor', async () => {
            const councillor = await personWithRoles([{ cityId: CITY, name: 'Mayor' }, { administrativeBodyId: bodyId }])
            await prisma.administers.create({ data: { userId: admin.id, personId: councillor.id } })
            await expect(editPerson(councillor.id, { ...details, roles: [{ ...role, administrativeBodyId: bodyId }] }))
                .rejects.toThrow('outside the bodies you administer')
            expect(await prisma.role.count({ where: { personId: councillor.id, name: 'Mayor' } })).toBe(1)
        })
    })

    describe('the meeting list with includeUnreleased', () => {
        const request = () => new NextRequest(`http://localhost/api/cities/${CITY}/meetings?includeUnreleased=true`)
        const params = { params: Promise.resolve({ cityId: CITY }) }

        it("gives a body admin the drafts of their body and no other", async () => {
            const otherBody = await createAdministrativeBody(CITY, { name: 'Other', name_en: 'Other', type: 'committee' })
            await createMeeting(CITY, { id: 'ours', administrativeBodyId: bodyId, released: false })
            await createMeeting(CITY, { id: 'theirs', administrativeBodyId: otherBody.id, released: false })
            await createMeeting(CITY, { id: 'public', administrativeBodyId: otherBody.id, released: true })
            const response = await listMeetings(request(), params)
            expect(response.status).toBe(200)
            expect((await response.json() as { id: string }[]).map(meeting => meeting.id).sort()).toEqual(['ours', 'public'])
        })

        it('gives the municipal minutes of their own meetings only (#876)', async () => {
            const otherBody = await createAdministrativeBody(CITY, { name: 'Άλλη', name_en: 'Other', type: 'committee' })
            await createMeeting(CITY, { id: 'ours', administrativeBodyId: bodyId, released: false, municipalMinutesUrl: 'https://example.com/ours.pdf' })
            await createMeeting(CITY, { id: 'public', administrativeBodyId: otherBody.id, released: true, municipalMinutesUrl: 'https://example.com/private.pdf' })
            await createMeeting(CITY, { id: 'city', administrativeBodyId: null, released: true, municipalMinutesUrl: 'https://example.com/city.pdf' })

            const rows = await (await listMeetings(request(), params)).json() as { id: string; municipalMinutesUrl: string | null }[]
            expect(Object.fromEntries(rows.map(row => [row.id, row.municipalMinutesUrl]))).toEqual({
                ours: 'https://example.com/ours.pdf',
                public: null,
                city: null,
            })
        })

        it('refuses a reader', async () => {
            __setSessionEmail(null)
            expect((await listMeetings(request(), params)).status).toBe(401)
        })
    })
})
