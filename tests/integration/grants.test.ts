/**
 * The grants of a scope (#875), on the rules of the body admins (#828): an
 * admin invites and revokes the grants of their scope. The cap and the
 * last-admin rule must hold when two requests arrive at the same time, so
 * these run against a real database. The last part checks what a body grant
 * reaches: the members of the body and the drafts of the body.
 */
import prisma from '@/lib/db/prisma'
import { BadRequestError } from '@/lib/api/errors'
import { inviteGrant, listGrants, revokeGrant, MAX_GRANTS_PER_SCOPE } from '@/lib/db/grants'
import { editPerson } from '@/lib/db/people'
import { GET as listMeetings } from '@/app/api/cities/[cityId]/meetings/route'
import { NextRequest } from 'next/server'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createGrant, createMeeting, createUser } from '../helpers/factories'
import { __setSessionEmail } from '../mocks/auth'

jest.mock('@/lib/auth/invite', () => ({ sendInviteEmail: jest.fn().mockResolvedValue(true) }))

const CITY = 'bodycity'

let bodyId: string
let scope: { administrativeBodyId: string }

let admin: { id: string; email: string }

async function signInAsBodyAdmin() {
    admin = await createUser('secretary@integration.test')
    await createGrant(admin.id, scope)
    __setSessionEmail(admin.email)
    return admin
}

async function signInAsCityAdmin() {
    const mayor = await createUser('mayor@integration.test')
    await createGrant(mayor.id, { cityId: CITY })
    __setSessionEmail(mayor.email)
    return mayor
}

async function fillBody(total: number) {
    const current = await prisma.administers.count({ where: { ...scope, revokedAt: null } })
    for (let i = current; i < total; i++) {
        const user = await createUser(`filler${i}@integration.test`)
        await createGrant(user.id, scope)
    }
}

const invite = (email: string, role: 'admin' | 'records' = 'admin', target = scope) => inviteGrant({ email, role, scope: target })
const activeCount = () => prisma.administers.count({ where: { ...scope, revokedAt: null } })
const rejected = (results: PromiseSettledResult<unknown>[]) => results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')

describe('grants', () => {
    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma)
        await createCity({ id: CITY })
        bodyId = (await createAdministrativeBody(CITY, { name: 'Youth council', name_en: 'Youth council', type: 'committee' })).id
        scope = { administrativeBodyId: bodyId }
        await signInAsBodyAdmin()
    })

    it('holds the cap when invites of new emails arrive at the same time', async () => {
        await fillBody(MAX_GRANTS_PER_SCOPE - 1)

        const results = await Promise.allSettled(['a', 'b', 'c'].map(name => invite(`${name}@integration.test`)))

        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
        for (const r of rejected(results)) {
            expect(r.reason).toBeInstanceOf(BadRequestError)
            expect(r.reason.message).toBe('cap')
        }
        expect(await activeCount()).toBe(MAX_GRANTS_PER_SCOPE)
    })

    it('counts an existing account against the cap, and a revoked grant not at all', async () => {
        await fillBody(MAX_GRANTS_PER_SCOPE)
        await createUser('existing@integration.test')
        await expect(invite('existing@integration.test')).rejects.toThrow('cap')

        const gone = await prisma.administers.findFirstOrThrow({ where: { ...scope, user: { email: 'filler5@integration.test' } } })
        await revokeGrant(gone.id)
        await expect(invite('existing@integration.test')).resolves.toMatchObject({ status: 'active', user: { email: 'existing@integration.test' } })
        expect(await activeCount()).toBe(MAX_GRANTS_PER_SCOPE)
    })

    it('counts people, not roles: a second role of a holder passes a full scope', async () => {
        await fillBody(MAX_GRANTS_PER_SCOPE)
        await expect(invite('filler5@integration.test', 'records')).resolves.toMatchObject({ role: 'records' })
        await expect(invite('newcomer@integration.test', 'records')).rejects.toThrow('cap')
    })

    it('refuses the same role on the same scope twice, and takes a second role', async () => {
        await expect(invite('filler@integration.test', 'records')).resolves.toMatchObject({ role: 'records' })
        await expect(invite('filler@integration.test', 'records')).rejects.toThrow('duplicate')
        await expect(invite('filler@integration.test', 'admin')).resolves.toMatchObject({ role: 'admin' })
        expect(await prisma.administers.count({ where: { ...scope, user: { email: 'filler@integration.test' } } })).toBe(2)
    })

    it('makes one account for one new email invited to two scopes at once', async () => {
        await signInAsCityAdmin()
        const other = await createAdministrativeBody(CITY, { name: 'Other', name_en: 'Other', type: 'committee' })

        const results = await Promise.all([
            invite('twice@integration.test'),
            invite('twice@integration.test', 'admin', { administrativeBodyId: other.id }),
        ])

        expect(results.map(r => r.status)).toEqual(['active', 'active'])
        expect(await prisma.user.count({ where: { email: 'twice@integration.test' } })).toBe(1)
        expect(await prisma.administers.count({ where: { user: { email: 'twice@integration.test' } } })).toBe(2)
    })

    it('does not let two admins who revoke each other at once leave the body with none', async () => {
        const other = await createUser('colleague@integration.test')
        const theirs = await createGrant(other.id, scope)
        const mine = await prisma.administers.findFirstOrThrow({ where: { ...scope, userId: admin.id } })

        const results = await Promise.allSettled([revokeGrant(theirs.id), revokeGrant(mine.id)])

        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
        expect(rejected(results).map(r => r.reason.message)).toEqual(['last-admin'])
        expect(await activeCount()).toBe(1)
    })

    it('lets a city admin revoke the last admin of the body', async () => {
        const mine = await prisma.administers.findFirstOrThrow({ where: { ...scope, userId: admin.id } })
        await expect(revokeGrant(mine.id)).rejects.toThrow('last-admin')

        const mayor = await signInAsCityAdmin()
        await revokeGrant(mine.id)

        const row = await prisma.administers.findUniqueOrThrow({ where: { id: mine.id } })
        expect(row.revokedAt).toBeInstanceOf(Date)
        expect(row.revokedById).toBe(mayor.id)
        expect(await activeCount()).toBe(0)
    })

    it('keeps a revoked row, out of the list until asked for', async () => {
        const other = await createUser('colleague@integration.test')
        const theirs = await createGrant(other.id, scope)
        await revokeGrant(theirs.id)

        expect(await prisma.administers.count({ where: { id: theirs.id } })).toBe(1)
        // The city admin who reads the list holds a grant of the city too: newest first.
        await signInAsCityAdmin()
        const live = await listGrants({ realms: null, cityId: CITY })
        expect(live.map(g => [g.user.email, g.status])).toEqual([
            ['mayor@integration.test', 'active'],
            ['secretary@integration.test', 'active'],
        ])
        const all = await listGrants({ realms: null, cityId: CITY, includeRevoked: true })
        expect(all.map(g => [g.user.email, g.status])).toEqual([
            ['mayor@integration.test', 'active'],
            ['secretary@integration.test', 'active'],
            ['colleague@integration.test', 'revoked'],
        ])
        expect(all[2].revokedBy?.id).toBe(admin.id)
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
            await createGrant(admin.id, { personId: councillor.id })
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

        it('refuses a reader', async () => {
            __setSessionEmail(null)
            expect((await listMeetings(request(), params)).status).toBe(401)
        })
    })
})
