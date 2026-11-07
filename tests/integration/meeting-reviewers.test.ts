/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import { setMeetingReviewer } from '@/lib/actions/reviews'
import { InvalidReviewerError } from '@/lib/db/meetingReviewers'
import { __setSessionEmail } from '../mocks/auth'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createCity, createMeeting, createUser, signInAsSuperAdmin } from '../helpers/factories'

describe('setMeetingReviewer', () => {
    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma)
        await createCity({ id: 'city1', status: 'supported' })
        await createMeeting('city1', { id: 'm1' })
    })

    async function storedReviewerId() {
        const row = await prisma.meetingReviewer.findUnique({
            where: { meetingCityId_meetingId: { meetingCityId: 'city1', meetingId: 'm1' } },
        })
        return row?.userId ?? null
    }

    it('sets, changes and clears the reviewer of a meeting', async () => {
        await signInAsSuperAdmin()
        const first = await createUser('first@example.com', { isSuperAdmin: true })
        const second = await createUser('second@example.com', { isSuperAdmin: true })

        const assigned = await setMeetingReviewer('city1', 'm1', first.id)
        expect(assigned?.id).toBe(first.id)
        expect(await storedReviewerId()).toBe(first.id)

        await setMeetingReviewer('city1', 'm1', second.id)
        expect(await storedReviewerId()).toBe(second.id)
        expect(await prisma.meetingReviewer.count()).toBe(1)

        expect(await setMeetingReviewer('city1', 'm1', null)).toBeNull()
        expect(await storedReviewerId()).toBeNull()
    })

    it('rejects a target user who is not a superadmin', async () => {
        await signInAsSuperAdmin()
        const reader = await createUser('reader@example.com')

        await expect(setMeetingReviewer('city1', 'm1', reader.id)).rejects.toThrow(InvalidReviewerError)
        await expect(setMeetingReviewer('city1', 'm1', 'no-such-user')).rejects.toThrow(InvalidReviewerError)
        expect(await storedReviewerId()).toBeNull()
    })

    it('rejects a caller who is not a superadmin', async () => {
        const cityAdmin = await createUser('cityadmin@example.com', {
            administers: { create: { cityId: 'city1' } },
        })
        const target = await createUser('target@example.com', { isSuperAdmin: true })
        __setSessionEmail(cityAdmin.email)

        await expect(setMeetingReviewer('city1', 'm1', target.id)).rejects.toThrow()
        expect(await storedReviewerId()).toBeNull()

        __setSessionEmail(null)
        await expect(setMeetingReviewer('city1', 'm1', target.id)).rejects.toThrow()
        expect(await storedReviewerId()).toBeNull()
    })
})
