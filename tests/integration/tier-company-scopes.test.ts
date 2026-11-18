/** @jest-environment node */
jest.mock('next/cache', () => ({
    revalidateTag: jest.fn(),
    revalidatePath: jest.fn(),
    unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

import prisma from '@/lib/db/prisma'
import { getCities } from '@/lib/db/cities'
import { getUpcomingMeetings } from '@/lib/db/meetings'
import { getMeetingsNeedingReview } from '@/lib/db/reviews'
import { getSubjectCountForCity } from '@/lib/db/subject'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting, createPerson, createSubject, createTaskStatus, signInAsSuperAdmin } from '../helpers/factories'

const CITY = 'company_city'
const DAY = 86_400_000

// body-tier-scopes.test.ts with the motivating case of #829: a municipal
// company typed `council` and stored secondary, and a youth council stored primary.
describe('the default scopes read the stored tier, not the type', () => {
    let councilId: string
    let companyId: string

    beforeAll(async () => { await ensureTestDb() })

    beforeEach(async () => {
        await resetDatabase(prisma)
        await signInAsSuperAdmin()
        await createCity({ id: CITY, status: 'supported' })
        councilId = (await createAdministrativeBody(CITY, { type: 'council', name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council' })).id
        companyId = (await createAdministrativeBody(CITY, { type: 'council', tier: 'secondary', name: 'Ζήρεια Α.Ε.', name_en: 'Ziria SA' })).id
        for (const [body, prefix] of [[councilId, 'council'], [companyId, 'company']] as const) {
            await createMeeting(CITY, { id: `${prefix}_past`, administrativeBodyId: body, released: true, dateTime: new Date(Date.now() - DAY) })
            await createMeeting(CITY, { id: `${prefix}_next`, administrativeBodyId: body, released: true, dateTime: new Date(Date.now() + DAY) })
        }
    })

    // The review queue reads the operator rule, not the tier: the company's
    // pipeline has an operator, and its transcript stays hidden until a review.
    test('upcoming meetings and subject count leave the company out, and the review queue keeps it', async () => {
        expect((await getUpcomingMeetings('greece')).map(m => m.id)).toEqual(['council_next'])
        for (const meetingId of ['council_past', 'company_past']) {
            await createTaskStatus(meetingId, CITY, { type: 'transcribe', status: 'succeeded' })
            const subject = await createSubject(meetingId, CITY, { id: `s_${meetingId}`, name: `Θέμα ${meetingId}` })
            await prisma.speakerContribution.create({ data: { subjectId: subject.id, text: 'Τοποθέτηση', speakerName: 'Ομιλητής' } })
        }
        expect((await getMeetingsNeedingReview({ show: 'all' })).map(m => m.meetingId).sort()).toEqual(['company_past', 'council_past'])
        expect(await getSubjectCountForCity(CITY)).toBe(1)
    })

    test('the counts of a city listing leave the company and its members out', async () => {
        const member = await createPerson(CITY, { name: 'Μέλος Συμβουλίου' })
        const board = await createPerson(CITY, { name: 'Μέλος ΔΣ εταιρείας' })
        await prisma.role.create({ data: { personId: member.id, cityId: CITY, administrativeBodyId: councilId } })
        await prisma.role.create({ data: { personId: board.id, cityId: CITY, administrativeBodyId: companyId } })
        const [city] = await getCities({}, 'greece')
        expect(city._count).toMatchObject({ persons: 1, councilMeetings: 2 })
    })
})
