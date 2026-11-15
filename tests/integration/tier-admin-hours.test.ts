/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import { getAdminDashboardStats } from '@/lib/db/adminStats'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting, createSpeakerSegment, createSpeakerTag, signInAsSuperAdmin } from '../helpers/factories'

const CITY = 'hours_city'

describe('the meeting hours of the admin dashboard', () => {
    beforeAll(async () => { await ensureTestDb() })
    beforeEach(async () => {
        await resetDatabase(prisma)
        await signInAsSuperAdmin()
    })

    test('sum each released primary meeting from its first segment to its last, and leave a secondary body out', async () => {
        await createCity({ id: CITY, status: 'supported' })
        const council = await createAdministrativeBody(CITY, { type: 'council' })
        const company = await createAdministrativeBody(CITY, { type: 'council', tier: 'secondary', name: 'Ζήρεια Α.Ε.', name_en: 'Ziria SA' })
        const tag = await createSpeakerTag()
        const segments = async (meetingId: string, ranges: [number, number][]) => {
            for (const [start, end] of ranges) await createSpeakerSegment(meetingId, CITY, { speakerTagId: tag.id, startTimestamp: start, endTimestamp: end })
        }
        await createMeeting(CITY, { id: 'a', administrativeBodyId: council.id, released: true })
        await createMeeting(CITY, { id: 'b', administrativeBodyId: null, released: true })
        await createMeeting(CITY, { id: 'company', administrativeBodyId: company.id, released: true })
        await createMeeting(CITY, { id: 'draft', administrativeBodyId: council.id, released: false })
        await segments('a', [[0, 1800], [1800, 5400]])          // 1.5 h
        await segments('b', [[600, 4200], [100, 200]])         // 4100 s
        await segments('company', [[0, 36000]])                // 10 h, secondary
        await segments('draft', [[0, 36000]])                  // 10 h, not released

        // 5400 + 4100 = 9500 s = 2.64 h
        expect((await getAdminDashboardStats()).content.meetingHoursThisWeek).toBe(3)
    })
})
