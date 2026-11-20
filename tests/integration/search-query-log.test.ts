/** @jest-environment node */
import { randomUUID } from 'node:crypto'
import prisma from '@/lib/db/prisma'
import { logSearchQuery } from '@/lib/db/searchQueries'
import { __setSessionEmail } from '../mocks/auth'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'

/**
 * The row of a search takes the id that the search picked, so that the log
 * lines, the alert and the page's analytics events can name the row.
 */
describe('logSearchQuery', () => {
    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma)
    })

    afterEach(() => {
        __setSessionEmail(null)
    })

    test('writes the row under the id it is given, without a user when nobody is signed in', async () => {
        const id = randomUUID()

        await logSearchQuery('ποδηλατόδρομος', id)

        expect(await prisma.searchQuery.findUnique({ where: { id } })).toMatchObject({ id, query: 'ποδηλατόδρομος', userId: null })
    })

    test('links the row to the user who is signed in', async () => {
        const user = await prisma.user.create({ data: { email: 'search-log@example.test' } })
        __setSessionEmail(user.email)
        const id = randomUUID()

        await logSearchQuery('πλατεία', id)

        expect(await prisma.searchQuery.findUnique({ where: { id } })).toMatchObject({ userId: user.id })
    })
})
