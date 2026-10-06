/**
 * The admins of one administrative body (#828): a body admin invites and
 * removes the admins of their body. The cap and the last-admin rule must
 * hold when two requests arrive at the same time, so these run against a
 * real database.
 */
import prisma from '@/lib/db/prisma'
import { BadRequestError } from '@/lib/api/errors'
import { addBodyAdmin, removeBodyAdmin } from '@/lib/db/bodyAdmins'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createUser } from '../helpers/factories'
import { __setSessionEmail } from '../mocks/auth'

jest.mock('@/lib/auth/invite', () => ({ sendInviteEmail: jest.fn().mockResolvedValue(true) }))

const CITY = 'bodycity'
const MAX_ADMINS_PER_BODY = 20

let bodyId: string

async function signInAsBodyAdmin() {
    const admin = await createUser('secretary@integration.test')
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
})
