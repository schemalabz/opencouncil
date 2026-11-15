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

import { NextRequest } from 'next/server'
import { Realm } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import { countCouncilMeetings, getCouncilMeetingsForCity } from '@/lib/db/meetingsList'
import { buildMapSubjectWhere, getGeneralSubjects, getHotSubjectsCached, type GeneralCityRow } from '@/lib/db/subject'
import { computeRecentHotSubjects } from '@/lib/hotSubjects'
import { publicMeetingWhere } from '@/lib/cityStatus'
import { mcpListMeetings, mcpListPeople } from '@/lib/mcp/data'
import { mcpRealmStore, requestContext } from '@/lib/mcp/realm-context'
import { searchSubjectsInRealm } from '@/lib/search/core'
import { buildFilters } from '@/lib/search/query'
import type { QueryContainer } from '@/lib/search/types'
import type { estypes } from '@elastic/elasticsearch'
import { getSecondaryBodyIdsCached } from '@/lib/db/administrativeBodies'
import { countPeopleOfCity, listPeopleOfCity } from '@/lib/db/people'
import { CITY_COUNT_SELECT } from '@/lib/db/cityListing'
import { getMeetingDataCore } from '@/lib/getMeetingData'
import { GET as listPeopleApi } from '@/app/api/cities/[cityId]/people/route'
import { GET as mapSearch } from '@/app/api/map/search/route'
import { GET as generalSubjects } from '@/app/api/map/general-subjects/route'
import { GET as listMeetingSubjects } from '@/app/api/cities/[cityId]/meetings/[meetingId]/subjects/route'
import { GET as getMeetingSubject } from '@/app/api/cities/[cityId]/meetings/[meetingId]/subjects/[subjectId]/route'
import { GET as listCitySubjects } from '@/app/api/cities/[cityId]/subjects/route'
import type { AdministrativeBody } from '@prisma/client'
import type { BodyScope } from '@/lib/utils/bodyTier'
import { getAboutPageStats } from '@/lib/db/cities'
import { getCityCoverage } from '@/lib/db/coverage'
import { getStatisticsFor } from '@/lib/statistics'
import { GET as statisticsApi } from '@/app/api/statistics/route'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting, createSpeakerSegment, createSpeakerTag, createSubject, signInAsSuperAdmin } from '../helpers/factories'

const CITY = 'scope_city'
const SQUARE = 'POLYGON((23 38, 23.1 38, 23.1 38.1, 23 38.1, 23 38))'
const PAST = new Date(Date.now() - 86_400_000)
// The youth council met first, so a total that counts it shows its date.
const EARLIER = new Date(Date.now() - 2 * 86_400_000)

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

// The people of each body, and a youth member who also holds a role off any
// body (a party, a city office): such a person is on the primary roster.
const MIXED = 'mixed'
const PEOPLE_SCOPES: { name: string; tier?: BodyScope['tier']; rows: string[] }[] = [
    { name: 'no scope', tier: undefined, rows: [COUNCIL, PROMOTED, MIXED] },
    { name: 'the secondary tier', tier: 'secondary', rows: [YOUTH] },
    { name: 'every tier', tier: 'all', rows: [COUNCIL, PROMOTED, YOUTH, MIXED] },
]

const sorted = (rows: string[]) => [...rows].sort()
const personOf = (row: string) => `${row}_person`
const createPersonOf = (row: string) => prisma.person.create({
    data: { id: personOf(row), cityId: CITY, name: `Μέλος ${row}`, name_en: `Member ${row}`, name_short: row, name_short_en: row },
})
const meetingOf = (row: string) => `${row}_meeting`
const subjectOf = (row: string) => `${row}_subject`
const asRequest = <T>(fn: () => Promise<T>) => mcpRealmStore.run(requestContext(Realm.greece, 'opencouncil.gr', null), fn)
const subjectsOf = (rows: GeneralCityRow[]) => sorted(rows.flatMap(row => row.subjects.map(subject => subject.id)))

// The body fields of an index document, and the clauses of buildFilters that
// read them. A clause on another field passes: the test documents are released
// subjects of the city, and only the body decides here.
type IndexDocument = { administrative_body_id: string | null; administrative_body_type: string | null }
const BODY_FIELDS = ['administrative_body_id', 'administrative_body_type']
function admits(clause: QueryContainer, doc: IndexDocument): boolean {
    const field = (fields: object) => Object.keys(fields)[0] as keyof IndexDocument
    if (clause.term) {
        const name = field(clause.term)
        return !BODY_FIELDS.includes(name) || doc[name] === clause.term[name]
    }
    if (clause.terms) {
        const name = field(clause.terms)
        return !BODY_FIELDS.includes(name) || (clause.terms[name] as string[]).includes(doc[name] ?? '')
    }
    if (clause.exists) return doc[clause.exists.field as keyof IndexDocument] != null
    if (clause.bool) {
        const list = (value: estypes.QueryDslQueryContainer | estypes.QueryDslQueryContainer[] | undefined): QueryContainer[] =>
            (Array.isArray(value) ? value : [value]).filter((inner): inner is QueryContainer => inner != null)
        const should = list(clause.bool.should)
        return list(clause.bool.filter).every(inner => admits(inner, doc))
            && !list(clause.bool.must_not).some(inner => admits(inner, doc))
            && (should.length === 0 || should.some(inner => admits(inner, doc)))
    }
    return true
}

describe('the body scope of every reader builder (#829)', () => {
    let bodies: Record<string, AdministrativeBody>

    beforeAll(async () => {
        await ensureTestDb()
        await resetDatabase(prisma)
        await signInAsSuperAdmin()
        await createCity({ id: CITY, status: 'supported', realm: Realm.greece })
        await prisma.$executeRaw`UPDATE "City" SET geometry = ST_GeomFromText(${SQUARE}, 4326) WHERE id = ${CITY}`
        bodies = {
            [COUNCIL]: await createAdministrativeBody(CITY, { type: 'council', name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council' }),
            [YOUTH]: await createAdministrativeBody(CITY, { type: 'youthCouncil', name: 'Δημοτικό Συμβούλιο Νέων', name_en: 'Youth Council' }),
            [PROMOTED]: await createAdministrativeBody(CITY, { type: 'youthCouncil', tier: 'primary', name: 'Συμβούλιο Νέων Β', name_en: 'Youth Council B' }),
        }
        expect(bodies[YOUTH].tier).toBe('secondary')
        for (const [row, body] of Object.entries(bodies)) {
            await createMeeting(CITY, { id: meetingOf(row), administrativeBodyId: body.id, released: true, dateTime: row === YOUTH ? EARLIER : PAST })
            await createSubject(meetingOf(row), CITY, { id: subjectOf(row), name: `Θέμα ${row}` })
            await prisma.speakerContribution.create({ data: { subjectId: subjectOf(row), text: 'Τοποθέτηση', speakerName: 'Ομιλητής' } })
            await createPersonOf(row)
            await prisma.role.create({ data: { personId: personOf(row), cityId: CITY, administrativeBodyId: body.id } })
            // One hour of the body's member speaking.
            const tag = await createSpeakerTag({ personId: personOf(row) })
            await createSpeakerSegment(meetingOf(row), CITY, { speakerTagId: tag.id, startTimestamp: 0, endTimestamp: 3600 })
        }
        await createPersonOf(MIXED)
        await prisma.role.create({ data: { personId: personOf(MIXED), cityId: CITY, administrativeBodyId: bodies[YOUTH].id } })
        await prisma.role.create({ data: { personId: personOf(MIXED), cityId: CITY, name: 'Αντιδήμαρχος' } })
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

        // The index holds the id and the type of a body, and not its tier.
        test('the search filters', async () => {
            const filters = buildFilters({ query: 'θέμα', tier: scope?.tier, administrativeBodyTypes: scope?.types }, await getSecondaryBodyIdsCached('greece'))
            const found = Object.entries(bodies)
                .filter(([, body]) => filters.every(clause => admits(clause, { administrative_body_id: body.id, administrative_body_type: body.type })))
                .map(([row]) => row)
            expect(sorted(found)).toEqual(sorted(rows))
        })

        test('the hot subjects of a city', async () => {
            const hot = await computeRecentHotSubjects(CITY, { limit: 10, scope })
            expect(sorted(hot.map(item => item.subject.id))).toEqual(sorted(rows.map(subjectOf)))
        })
    })

    describe.each(PEOPLE_SCOPES)('the people listing, $name', ({ tier, rows }) => {
        test('the builder, its count, the people API and MCP list_people', async () => {
            const expected = sorted(rows.map(personOf))
            const ids = (people: { id: string }[]) => sorted(people.map(person => person.id))
            expect(ids(await listPeopleOfCity(CITY, { scope: { tier } }))).toEqual(expected)
            expect(await countPeopleOfCity(CITY, { tier })).toBe(rows.length)
            const response = await listPeopleApi(new Request(`http://localhost/api/cities/${CITY}/people${tier ? `?tier=${tier}` : ''}`), { params: Promise.resolve({ cityId: CITY }) })
            expect(ids(await response.json())).toEqual(expected)
            expect(ids((await asRequest(() => mcpListPeople(CITY, false, tier))).people)).toEqual(expected)
        })
    })

    test('the people API lists by default the number of people that the identity band counts', async () => {
        const city = await prisma.city.findUniqueOrThrow({ where: { id: CITY }, include: { _count: CITY_COUNT_SELECT } })
        const response = await listPeopleApi(new Request(`http://localhost/api/cities/${CITY}/people`), { params: Promise.resolve({ cityId: CITY }) })
        expect((await response.json()).length).toBe(city._count.persons)
    })

    // The lookup is not a listing: a youth council's meeting names its members.
    test('the meeting data of a secondary youth council keeps its members', async () => {
        const data = await getMeetingDataCore(CITY, meetingOf(YOUTH))
        expect(data.people.map(person => person.id)).toEqual(expect.arrayContaining([personOf(YOUTH), personOf(MIXED)]))
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

    test('search keeps a subject with no body in the primary tier', async () => {
        const secondaryIds = await getSecondaryBodyIdsCached('greece')
        const noBody: IndexDocument = { administrative_body_id: null, administrative_body_type: null }
        const found = (tier?: BodyScope['tier']) => buildFilters({ query: 'θέμα', tier }, secondaryIds).every(clause => admits(clause, noBody))
        expect([found(), found('all'), found('secondary')]).toEqual([true, true, false])
    })

    // A meeting named in the URL is read in any tier, as its page reads it.
    test('the subjects API reads a named secondary meeting, and keeps the city listing primary', async () => {
        const read = async (response: Response) => {
            expect(response.status).toBe(200)
            return response.json()
        }
        const meetingId = meetingOf(YOUTH)
        const listed = await read(await listMeetingSubjects(
            new NextRequest(`http://localhost/api/cities/${CITY}/meetings/${meetingId}/subjects`),
            { params: Promise.resolve({ cityId: CITY, meetingId }) },
        ))
        expect(listed.map((subject: { id: string }) => subject.id)).toEqual([subjectOf(YOUTH)])
        const one = await read(await getMeetingSubject(
            new NextRequest(`http://localhost/api/cities/${CITY}/meetings/${meetingId}/subjects/${subjectOf(YOUTH)}`),
            { params: Promise.resolve({ cityId: CITY, meetingId, subjectId: subjectOf(YOUTH) }) },
        ))
        expect(one.id).toBe(subjectOf(YOUTH))
        const city = await read(await listCitySubjects(
            new NextRequest(`http://localhost/api/cities/${CITY}/subjects`),
            { params: Promise.resolve({ cityId: CITY }) },
        ))
        expect(sorted(city.map((subject: { id: string }) => subject.id))).toEqual(sorted([COUNCIL, PROMOTED].map(subjectOf)))
    })

    // The reader totals count the primary tier, as the lists do.
    test('the about page totals count the primary tier', async () => {
        expect(await getAboutPageStats()).toMatchObject({ meetingCount: 2, subjectCount: 2, meetingHours: 2 })
    })

    test('the statistics of a city count the primary tier, and those of a person every tier', async () => {
        const speakers = (statistics: { people?: { item: { id: string } }[] }) => sorted((statistics.people ?? []).map(stat => stat.item.id))
        expect(speakers(await getStatisticsFor({ cityId: CITY }, ['person']))).toEqual(sorted([COUNCIL, PROMOTED].map(personOf)))
        expect(speakers(await getStatisticsFor({ cityId: CITY, scope: { tier: 'all' } }, ['person']))).toEqual(sorted([COUNCIL, PROMOTED, YOUTH].map(personOf)))

        const api = async (query: string) => (await statisticsApi(new NextRequest(`http://localhost/api/statistics?${query}`))).json()
        expect(speakers(await api(`cityId=${CITY}`))).toEqual(sorted([COUNCIL, PROMOTED].map(personOf)))
        expect(speakers(await api(`cityId=${CITY}&tier=secondary`))).toEqual([personOf(YOUTH)])
        // The person page reads the statistics of the person it names, in every tier.
        expect((await api(`cityId=${CITY}&personId=${personOf(YOUTH)}`)).speakingSeconds).toBe(3600)
        expect((await api(`cityId=${CITY}&meetingId=${meetingOf(YOUTH)}`)).speakingSeconds).toBe(3600)
    })

    test('the coverage table lists the bodies of the primary tier', async () => {
        const rows = await getCityCoverage('greece')
        expect(rows.map(row => [row.bodyType, row.fromDate])).toEqual([
            ['council', PAST.toISOString()],
            ['youthCouncil', PAST.toISOString()],
        ])
    })

    test('general subjects read the same scope', async () => {
        const rows = await getGeneralSubjects('greece', { allTime: true, tier: 'all' })
        expect(subjectsOf(rows)).toEqual(sorted([COUNCIL, PROMOTED, YOUTH].map(subjectOf)))
    })
})
