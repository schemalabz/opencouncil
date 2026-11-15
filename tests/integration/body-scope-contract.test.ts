/** @jest-environment node */
// The contract of the body scope (#829): every builder of a reader query reads
// one scope the same way. The tier is the only switch, and an absent scope is
// the primary tier. A type narrows inside the tier. The three bodies below
// make a builder that reads the type in place of the tier fail.
jest.mock('next/cache', () => ({
    revalidateTag: jest.fn(),
    revalidatePath: jest.fn(),
    unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))
jest.mock('@/lib/realm.server', () => ({
    ...jest.requireActual('@/lib/realm.server'),
    getRealm: jest.fn().mockResolvedValue('greece'),
}))
jest.mock('@/lib/search/core', () => ({
    ...jest.requireActual('@/lib/search/core'),
    searchSubjectsInRealm: jest.fn(),
}))

import { Realm } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import { countCouncilMeetings, getCouncilMeetingsForCity } from '@/lib/db/meetingsList'
import { buildMapSubjectWhere, getGeneralSubjects, getHotSubjectsCached, type GeneralCityRow } from '@/lib/db/subject'
import { computeRecentHotSubjects } from '@/lib/hotSubjects'
import { publicMeetingWhere } from '@/lib/cityStatus'
import { mcpListMeetings } from '@/lib/mcp/data'
import { mcpRealmStore, requestContext } from '@/lib/mcp/realm-context'
import { searchSubjectsInRealm } from '@/lib/search/core'
import { GET as mapSearch } from '@/app/api/map/search/route'
import { GET as generalSubjects } from '@/app/api/map/general-subjects/route'
import type { BodyScope } from '@/lib/utils/bodyTier'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting, createSubject, signInAsSuperAdmin } from '../helpers/factories'

const CITY = 'scope_city'
const SQUARE = 'POLYGON((23 38, 23.1 38, 23.1 38.1, 23 38.1, 23 38))'
const PAST = new Date(Date.now() - 86_400_000)

// One body of each case, named by its role in the contract.
const COUNCIL = 'council'   // council, primary
const YOUTH = 'youth'       // youth council at its default: secondary
const PROMOTED = 'promoted' // youth council set to primary

const SCOPES: { name: string; scope?: BodyScope; rows: string[] }[] = [
    { name: 'no scope', scope: undefined, rows: [COUNCIL, PROMOTED] },
    { name: 'the secondary tier', scope: { tier: 'secondary' }, rows: [YOUTH] },
    { name: 'every tier', scope: { tier: 'all' }, rows: [COUNCIL, PROMOTED, YOUTH] },
    { name: 'a type alone', scope: { types: ['youthCouncil'] }, rows: [PROMOTED] },
    { name: 'a type in every tier', scope: { tier: 'all', types: ['youthCouncil'] }, rows: [PROMOTED, YOUTH] },
]

const sorted = (rows: string[]) => [...rows].sort()
const meetingOf = (row: string) => `${row}_meeting`
const subjectOf = (row: string) => `${row}_subject`
const asRequest = <T>(fn: () => Promise<T>) => mcpRealmStore.run(requestContext(Realm.greece, 'opencouncil.gr', null), fn)
const subjectsOf = (rows: GeneralCityRow[]) => sorted(rows.flatMap(row => row.subjects.map(subject => subject.id)))

describe('the body scope of every reader builder (#829)', () => {
    beforeAll(async () => {
        await ensureTestDb()
        await resetDatabase(prisma)
        await signInAsSuperAdmin()
        await createCity({ id: CITY, status: 'supported', realm: Realm.greece })
        await prisma.$executeRaw`UPDATE "City" SET geometry = ST_GeomFromText(${SQUARE}, 4326) WHERE id = ${CITY}`
        const bodies = {
            [COUNCIL]: await createAdministrativeBody(CITY, { type: 'council', name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council' }),
            [YOUTH]: await createAdministrativeBody(CITY, { type: 'youthCouncil', name: 'Δημοτικό Συμβούλιο Νέων', name_en: 'Youth Council' }),
            [PROMOTED]: await createAdministrativeBody(CITY, { type: 'youthCouncil', tier: 'primary', name: 'Συμβούλιο Νέων Β', name_en: 'Youth Council B' }),
        }
        expect(bodies[YOUTH].tier).toBe('secondary')
        for (const [row, body] of Object.entries(bodies)) {
            await createMeeting(CITY, { id: meetingOf(row), administrativeBodyId: body.id, released: true, dateTime: PAST })
            await createSubject(meetingOf(row), CITY, { id: subjectOf(row), name: `Θέμα ${row}` })
            await prisma.speakerContribution.create({ data: { subjectId: subjectOf(row), text: 'Τοποθέτηση', speakerName: 'Ομιλητής' } })
        }
    })

    describe.each(SCOPES)('$name', ({ scope, rows }) => {
        test('the meeting list and its count', async () => {
            const meetings = await getCouncilMeetingsForCity(CITY, { scope })
            expect(sorted(meetings.map(meeting => meeting.id))).toEqual(sorted(rows.map(meetingOf)))
            expect(await countCouncilMeetings(CITY, { scope })).toBe(rows.length)
        })

        test('the public meeting gate', async () => {
            const meetings = await prisma.councilMeeting.findMany({ where: { cityId: CITY, ...publicMeetingWhere('greece', scope) }, select: { id: true } })
            expect(sorted(meetings.map(meeting => meeting.id))).toEqual(sorted(rows.map(meetingOf)))
        })

        test('the subject, map and hot where', async () => {
            const where = buildMapSubjectWhere('greece', { allTime: true, tier: scope?.tier, bodyTypes: scope?.types })
            const subjects = await prisma.subject.findMany({ where, select: { id: true } })
            expect(sorted(subjects.map(subject => subject.id))).toEqual(sorted(rows.map(subjectOf)))
            const hot = await getHotSubjectsCached('greece', { allTime: true, tier: scope?.tier, bodyTypes: scope?.types }, 10)
            expect(sorted(hot.map(subject => subject.id))).toEqual(sorted(rows.map(subjectOf)))
        })

        test('the hot subjects of a city', async () => {
            const hot = await computeRecentHotSubjects(CITY, { limit: 10, scope })
            expect(sorted(hot.map(item => item.subject.id))).toEqual(sorted(rows.map(subjectOf)))
        })
    })

    test('MCP list_meetings lists a secondary youth council with a tier, and not without', async () => {
        const ids = async (options: Parameters<typeof mcpListMeetings>[1]) =>
            sorted((await asRequest(() => mcpListMeetings(CITY, options, null))).meetings.map(meeting => meeting.id))
        expect(await ids({ page: 1, pageSize: 10 })).toEqual(sorted([COUNCIL, PROMOTED].map(meetingOf)))
        expect(await ids({ page: 1, pageSize: 10, tier: 'all' })).toEqual(sorted([COUNCIL, PROMOTED, YOUTH].map(meetingOf)))
        // A youth council set to primary is listed under its type, the default one is not.
        expect(await ids({ page: 1, pageSize: 10, administrativeBodyTypes: ['youthCouncil'] })).toEqual([meetingOf(PROMOTED)])
    })

    test('the landing tier chip shows the secondary subjects on the map', async () => {
        const read = async (query: string) => subjectsOf(await (await generalSubjects(new Request(`http://localhost/api/map/general-subjects?allTime=1${query}`))).json())
        expect(await read('')).toEqual(sorted([COUNCIL, PROMOTED].map(subjectOf)))
        expect(await read('&tier=secondary')).toEqual([subjectOf(YOUTH)])
    })

    test('the map search keeps the secondary hits it asked for', async () => {
        const search = searchSubjectsInRealm as jest.MockedFunction<typeof searchSubjectsInRealm>
        search.mockResolvedValue({ hits: [{ id: subjectOf(YOUTH) }], total: 1, dropped: 0, derivedFilters: {} } as unknown as Awaited<ReturnType<typeof searchSubjectsInRealm>>)

        const asked = await (await mapSearch(new Request('http://localhost/api/map/search?q=θέμα&tier=secondary'))).json()
        expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ tier: 'secondary' }), 'greece')
        expect(subjectsOf(asked.general)).toEqual([subjectOf(YOUTH)])

        // The same hit, unasked: the hydration keeps the reader default.
        const unasked = await (await mapSearch(new Request('http://localhost/api/map/search?q=θέμα'))).json()
        expect(subjectsOf(unasked.general)).toEqual([])
    })

    test('general subjects read the same scope', async () => {
        const rows = await getGeneralSubjects('greece', { allTime: true, tier: 'all' })
        expect(subjectsOf(rows)).toEqual(sorted([COUNCIL, PROMOTED, YOUTH].map(subjectOf)))
    })
})
