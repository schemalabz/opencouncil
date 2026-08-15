/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createCity, createNotificationPreference, createUser } from '../helpers/factories'

// The release panel actions are superadmin-gated; the gate itself is not
// under test here.
jest.mock('@/lib/auth', () => ({
    withUserAuthorizedToEdit: jest.fn(async () => true),
}))

import {
    enableNextBatch,
    getNotisRolloutOverview,
    getNotisRolloutUsers,
    setNotisEnabled,
} from '@/lib/db/notis-rollout'

describe('notis release panel data layer', () => {
    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma as any)
    })

    async function createEligibleUsers(count: number, cityId: string) {
        const users = []
        for (let i = 0; i < count; i++) {
            const user = await createUser(`eligible${i}@example.com`, {
                phone: `+30690000${String(i).padStart(4, '0')}`,
            })
            await createNotificationPreference({ userId: user.id, cityId })
            users.push(user)
        }
        return users
    }

    test('eligibility requires a phone and a notifyByPhone preference', async () => {
        const city = await createCity({ id: 'nr_city' })
        await createEligibleUsers(2, city.id)

        // A phone but no preference — not eligible.
        await createUser('nopref@example.com', { phone: '+306911111111' })
        // A preference but no phone — not eligible.
        const phoneless = await createUser('nophone@example.com')
        await createNotificationPreference({ userId: phoneless.id, cityId: city.id })
        // A preference with phone delivery off — not eligible.
        const optedOut = await createUser('optout@example.com', { phone: '+306922222222' })
        await prisma.notificationPreference.create({
            data: { userId: optedOut.id, cityId: city.id, notifyByPhone: false },
        })

        const overview = await getNotisRolloutOverview()
        expect(overview.eligible).toBe(2)
        expect(overview.enabled).toBe(0)
    })

    test('enableNextBatch clamps to the remaining eligible users', async () => {
        const city = await createCity({ id: 'nr_city' })
        await createEligibleUsers(3, city.id)

        const first = await enableNextBatch(2)
        expect(first).toEqual({ enabled: 2, remaining: 1 })

        // Asks for far more than remain — clamps to 1, then to 0.
        const second = await enableNextBatch(200)
        expect(second).toEqual({ enabled: 1, remaining: 0 })
        const third = await enableNextBatch(200)
        expect(third).toEqual({ enabled: 0, remaining: 0 })

        const overview = await getNotisRolloutOverview()
        expect(overview.enabled).toBe(3)
    })

    test('the per-user toggle sets and clears the timestamp', async () => {
        const city = await createCity({ id: 'nr_city' })
        const [user] = await createEligibleUsers(1, city.id)

        await setNotisEnabled(user.id, true)
        let row = await prisma.user.findUnique({ where: { id: user.id } })
        expect(row?.notisEnabledAt).toBeInstanceOf(Date)

        await setNotisEnabled(user.id, false)
        row = await prisma.user.findUnique({ where: { id: user.id } })
        expect(row?.notisEnabledAt).toBeNull()
    })

    test('an enabled user who lost eligibility stays listed for reversal', async () => {
        const city = await createCity({ id: 'nr_city' })
        const user = await createUser('lost@example.com', { notisEnabledAt: new Date() })
        void city

        const { users, total } = await getNotisRolloutUsers({ page: 1, pageSize: 10 })
        expect(total).toBe(1)
        expect(users[0].id).toBe(user.id)
        expect(users[0].notisEnabledAt).toBeInstanceOf(Date)
    })
})
