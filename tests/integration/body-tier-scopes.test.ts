/** @jest-environment node */
jest.mock('next/cache', () => ({
    revalidateTag: jest.fn(),
    revalidatePath: jest.fn(),
    unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

import prisma from '@/lib/db/prisma'
import { getCities } from '@/lib/db/cities'
import { getUpcomingMeetings } from '@/lib/db/meetings'
import { getCouncilMeetingsForCity, getCouncilMeetingsWithSubjectPreview } from '@/lib/db/meetingsList'
import { getMeetingsNeedingReview } from '@/lib/db/reviews'
import { getSubjectCountForCity } from '@/lib/db/subject'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting, createPerson, createSubject, createTaskStatus, signInAsSuperAdmin } from '../helpers/factories'

const CITY = 'tier_city'
const DAY = 86_400_000

/**
 * The first rule of #829: the content of a secondary body shows only where a
 * reader asks for it. Each default scope below reads primaryMeetingWhere or
 * primaryPresenceWhere (src/lib/utils/bodyTier.ts). The unit suite exercises
 * none of them against a database, so a dropped filter stayed green; this
 * suite puts a youth council next to the council and reads every default.
 */
describe('the default scopes leave the secondary tier out (#829)', () => {
    let councilId: string
    let youthId: string

    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma)
        await signInAsSuperAdmin()
        await createCity({ id: CITY, status: 'supported' })
        councilId = (await createAdministrativeBody(CITY, { type: 'council', name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council' })).id
        youthId = (await createAdministrativeBody(CITY, { type: 'youthCouncil', name: 'Δημοτικό Συμβούλιο Νέων', name_en: 'Youth Council' })).id
        // One past and one upcoming released meeting per body.
        for (const [body, prefix] of [[councilId, 'council'], [youthId, 'youth']] as const) {
            await createMeeting(CITY, { id: `${prefix}_past`, administrativeBodyId: body, released: true, dateTime: new Date(Date.now() - DAY) })
            await createMeeting(CITY, { id: `${prefix}_next`, administrativeBodyId: body, released: true, dateTime: new Date(Date.now() + DAY) })
        }
    })

    test('the meeting list of a city is the primary tier unless a type is named', async () => {
        const defaults = await getCouncilMeetingsForCity(CITY, {})
        expect(defaults.map((m) => m.id).sort()).toEqual(['council_next', 'council_past'])

        const youth = await getCouncilMeetingsForCity(CITY, { administrativeBodyTypes: ['youthCouncil'] })
        expect(youth.map((m) => m.id).sort()).toEqual(['youth_next', 'youth_past'])
    })

    test('a list by ids keeps a secondary meeting: the ids come from a search under the reader\'s own filter', async () => {
        const rows = await getCouncilMeetingsWithSubjectPreview(CITY, { meetingIds: ['youth_past', 'council_past'] })
        expect(rows.map((m) => m.id).sort()).toEqual(['council_past', 'youth_past'])
    })

    test('the upcoming meetings of the realm are the primary tier', async () => {
        const upcoming = await getUpcomingMeetings('greece')
        expect(upcoming.map((m) => m.id)).toEqual(['council_next'])
    })

    test('the review queue holds no meeting of a secondary body', async () => {
        // The queue lists transcribed meetings.
        for (const meetingId of ['council_past', 'youth_past']) {
            await createTaskStatus(meetingId, CITY, { type: 'transcribe', status: 'succeeded' })
        }
        const queue = await getMeetingsNeedingReview({ show: 'all' })
        expect(queue.map((m) => m.meetingId)).toEqual(['council_past'])
    })

    test('the counts of a city listing are its own roster and its own meetings', async () => {
        const member = await createPerson(CITY, { name: 'Μέλος Συμβουλίου' })
        const youthMember = await createPerson(CITY, { name: 'Μέλος Νέων' })
        await prisma.role.create({ data: { personId: member.id, cityId: CITY, administrativeBodyId: councilId } })
        await prisma.role.create({ data: { personId: youthMember.id, cityId: CITY, administrativeBodyId: youthId } })

        const [city] = await getCities({}, 'greece')
        expect(city.id).toBe(CITY)
        expect(city._count).toMatchObject({ persons: 1, councilMeetings: 2 })
    })

    test('the subject count of a city reads the primary tier', async () => {
        for (const meetingId of ['council_past', 'youth_past']) {
            const subject = await createSubject(meetingId, CITY, { id: `s_${meetingId}`, name: `Θέμα ${meetingId}` })
            await prisma.speakerContribution.create({ data: { subjectId: subject.id, text: 'Τοποθέτηση', speakerName: 'Ομιλητής' } })
        }
        expect(await getSubjectCountForCity(CITY)).toBe(1)
    })
})
