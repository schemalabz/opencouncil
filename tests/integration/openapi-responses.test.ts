/** @jest-environment node */
import { NextRequest } from 'next/server'
import * as z from 'zod'
import prisma from '@/lib/db/prisma'
import { paths, getOpenApiSpec } from '@/lib/openapi'
import { search } from '@/lib/search'
import { GET as listCities } from '@/app/api/cities/route'
import { GET as listAllCities } from '@/app/api/cities/all/route'
import { GET as getCity } from '@/app/api/cities/[cityId]/route'
import { GET as listMeetings } from '@/app/api/cities/[cityId]/meetings/route'
import { GET as getMeeting } from '@/app/api/cities/[cityId]/meetings/[meetingId]/route'
import { GET as listMeetingSubjects } from '@/app/api/cities/[cityId]/meetings/[meetingId]/subjects/route'
import { GET as getSubject } from '@/app/api/cities/[cityId]/meetings/[meetingId]/subjects/[subjectId]/route'
import { GET as listParties } from '@/app/api/cities/[cityId]/parties/route'
import { GET as getParty } from '@/app/api/cities/[cityId]/parties/[partyId]/route'
import { GET as listPeople } from '@/app/api/cities/[cityId]/people/route'
import { GET as getPerson } from '@/app/api/cities/[cityId]/people/[personId]/route'
import { GET as listCitySubjects } from '@/app/api/cities/[cityId]/subjects/route'
import { GET as getUtteranceContext } from '@/app/api/utterance/[utteranceId]/context/route'
import { POST as searchRoute } from '@/app/api/search/route'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createLocation, createMeeting, createSubject, createTopic } from '../helpers/factories'
import { strictSchema } from '../helpers/strictSchema'
import { __setSessionEmail } from '../mocks/auth'

// The handlers read through unstable_cache and the request realm, which need
// a Next request scope that a route test does not have.
jest.mock('next/cache', () => ({
    unstable_cache: <T>(fn: T) => fn,
    revalidateTag: jest.fn(),
    revalidatePath: jest.fn(),
}))
jest.mock('@/lib/realm.server', () => ({ getRealm: async () => 'greece' }))
// Elasticsearch is not part of this harness. The search case checks the
// envelope the route builds around the result.
jest.mock('@/lib/search', () => ({ search: jest.fn() }))

const cityId = 'testcity'
const meetingId = 'meeting1'
const base = 'http://localhost'

type Method = 'get' | 'post'

/** The documented 200 response schema of an operation. */
function documentedSchema(path: string, method: Method): z.core.$ZodType {
    const response = paths[path]?.[method]?.responses['200']
    const schema = response && 'content' in response ? response.content?.['application/json']?.schema : undefined
    if (!(schema instanceof z.ZodType)) throw new Error(`${method.toUpperCase()} ${path} documents no zod 200 schema`)
    return schema
}

/** Parse a real response with the documented schema, with unknown keys rejected at every depth. */
async function expectDocumented(response: Response, path: string, method: Method = 'get') {
    expect(response.status).toBe(200)
    const body: unknown = await response.json()
    const result = z.safeParse(strictSchema(documentedSchema(path, method)), body)
    expect(result.success ? [] : result.error.issues).toEqual([])
    return body
}

/** A documented list with at least one element, so the element schema is checked at all. */
async function expectDocumentedList(response: Response, path: string) {
    const body = await expectDocumented(response, path)
    expect(Array.isArray(body) && body.length > 0).toBe(true)
    return body
}

const get = (url: string) => new NextRequest(`${base}${url}`)
const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) })

// Each documented operation that this file checks. The last test fails when
// a documented public read has no case here.
const cases: Record<string, () => Promise<unknown>> = {}
const ids = { partyId: '', personId: '', subjectId: '', utteranceId: '' }

cases['GET /api/cities'] = async () =>
    expectDocumentedList(await listCities(get('/api/cities')), '/api/cities')
cases['GET /api/cities/all'] = async () =>
    expectDocumentedList(await listAllCities(), '/api/cities/all')
cases['GET /api/cities/{cityId}'] = async () => {
    const body = await expectDocumented(
        await getCity(get(`/api/cities/${cityId}`), params({ cityId })),
        '/api/cities/{cityId}',
    )
    expect(body).toMatchObject({ geometry: { type: 'Polygon' } })
}
cases['GET /api/cities/{cityId}/meetings'] = async () => {
    const body = await expectDocumented(
        await listMeetings(get(`/api/cities/${cityId}/meetings`), params({ cityId })),
        '/api/cities/{cityId}/meetings',
    )
    expect(body).toHaveLength(1)
}
cases['GET /api/cities/{cityId}/meetings/{meetingId}'] = async () => {
    const body = await expectDocumented(
        await getMeeting(get(`/api/cities/${cityId}/meetings/${meetingId}`), params({ cityId, meetingId })),
        '/api/cities/{cityId}/meetings/{meetingId}',
    )
    expect(body).toMatchObject({ meeting: { calendarEventId: 'calendar-event-1' } })
}
cases['GET /api/cities/{cityId}/meetings/{meetingId}/subjects'] = async () =>
    expectDocumentedList(
        await listMeetingSubjects(get(`/api/cities/${cityId}/meetings/${meetingId}/subjects`), params({ cityId, meetingId })),
        '/api/cities/{cityId}/meetings/{meetingId}/subjects',
    )
cases['GET /api/cities/{cityId}/meetings/{meetingId}/subjects/{subjectId}'] = async () =>
    expectDocumented(
        await getSubject(
            get(`/api/cities/${cityId}/meetings/${meetingId}/subjects/${ids.subjectId}`),
            params({ cityId, meetingId, subjectId: ids.subjectId }),
        ),
        '/api/cities/{cityId}/meetings/{meetingId}/subjects/{subjectId}',
    )
cases['GET /api/cities/{cityId}/subjects'] = async () =>
    expectDocumentedList(
        await listCitySubjects(get(`/api/cities/${cityId}/subjects`), params({ cityId })),
        '/api/cities/{cityId}/subjects',
    )
cases['GET /api/cities/{cityId}/parties'] = async () =>
    expectDocumentedList(await listParties(get(`/api/cities/${cityId}/parties`), params({ cityId })), '/api/cities/{cityId}/parties')
cases['GET /api/cities/{cityId}/parties/{partyId}'] = async () =>
    expectDocumented(
        await getParty(get(`/api/cities/${cityId}/parties/${ids.partyId}`), params({ cityId, partyId: ids.partyId })),
        '/api/cities/{cityId}/parties/{partyId}',
    )
cases['GET /api/cities/{cityId}/people'] = async () =>
    expectDocumentedList(await listPeople(get(`/api/cities/${cityId}/people`), params({ cityId })), '/api/cities/{cityId}/people')
cases['GET /api/cities/{cityId}/people/{personId}'] = async () =>
    expectDocumented(
        await getPerson(get(`/api/cities/${cityId}/people/${ids.personId}`), params({ cityId, personId: ids.personId })),
        '/api/cities/{cityId}/people/{personId}',
    )
cases['GET /api/utterance/{utteranceId}/context'] = async () =>
    expectDocumented(
        await getUtteranceContext(get(`/api/utterance/${ids.utteranceId}/context`), params({ utteranceId: ids.utteranceId })),
        '/api/utterance/{utteranceId}/context',
    )
cases['POST /api/search'] = async () => {
    jest.mocked(search).mockResolvedValue({
        results: [],
        total: 0,
        dropped: 0,
        derivedFilters: {
            cityIds: [cityId],
            dateRange: { start: '2026-01-01T00:00:00.000Z', end: '2026-12-31T23:59:59.999Z' },
            locations: [{ point: { lat: 37.98, lng: 23.72 }, radiusMeters: 500 }],
        },
    })
    const request = new NextRequest(`${base}/api/search`, { method: 'POST', body: JSON.stringify({ query: 'parks' }) })
    await expectDocumented(await searchRoute(request), '/api/search', 'post')
}

describe('documented responses match the real handlers', () => {
    beforeAll(async () => {
        await ensureTestDb()
        await resetDatabase(prisma)
        __setSessionEmail(null)

        await createCity({ id: cityId })
        await prisma.$executeRaw`
            UPDATE "City" SET geometry = ST_GeomFromGeoJSON(${JSON.stringify({
                type: 'Polygon',
                coordinates: [[[23.7, 37.9], [23.8, 37.9], [23.8, 38.0], [23.7, 37.9]]],
            })}) WHERE id = ${cityId}`
        const body = await createAdministrativeBody(cityId, {
            contactEmails: ['clerk@example.com'],
            diavgeiaUnitIds: ['81689'],
            youtubeChannelUrl: 'https://www.youtube.com/@council',
        })
        const party = await prisma.party.create({
            data: { cityId, name: 'Party', name_en: 'Party', name_short: 'PA', name_short_en: 'PA', colorHex: '#123456' },
        })
        const person = await prisma.person.create({
            data: {
                cityId, name: 'Councillor', name_en: 'Councillor', name_short: 'Co', name_short_en: 'Co',
                roles: {
                    create: [
                        { partyId: party.id },
                        { administrativeBodyId: body.id, electedOrder: 1 },
                        { cityId, name: 'Mayor', name_en: 'Mayor', isHead: true, startDate: new Date('2024-01-01') },
                    ],
                },
            },
        })
        await createTopic('environment')
        await createLocation({ id: 'location1', lng: 23.75, lat: 37.95 })
        await createMeeting(cityId, {
            id: meetingId,
            released: true,
            administrativeBodyId: body.id,
            calendarEventId: 'calendar-event-1',
            youtubeUrl: 'https://www.youtube.com/watch?v=abc',
        })
        const subject = await createSubject(meetingId, cityId, { topicId: 'environment', locationId: 'location1', agendaItemIndex: 1 })
        await prisma.subject.update({ where: { id: subject.id }, data: { personId: person.id } })
        const speakerTag = await prisma.speakerTag.create({ data: { label: 'Speaker 1', personId: person.id } })
        const segment = await prisma.speakerSegment.create({
            data: {
                startTimestamp: 0,
                endTimestamp: 10,
                meetingId,
                cityId,
                speakerTagId: speakerTag.id,
                utterances: {
                    create: [
                        { startTimestamp: 0, endTimestamp: 5, text: 'Good evening.' },
                        { startTimestamp: 5, endTimestamp: 10, text: 'The first item.' },
                    ],
                },
            },
            include: { utterances: { orderBy: { startTimestamp: 'asc' } } },
        })

        Object.assign(ids, {
            partyId: party.id,
            personId: person.id,
            subjectId: subject.id,
            utteranceId: segment.utterances[1].id,
        })
    })

    it.each(Object.keys(cases))('%s', async (operation) => {
        await cases[operation]()
    })

    it('has a case for every documented public read', () => {
        const documented = Object.entries(getOpenApiSpec().paths ?? {}).flatMap(([path, item]) =>
            Object.entries(item as Record<string, { 'x-access-level'?: string }>)
                .filter(([method, operation]) => method === 'get' && (operation['x-access-level'] ?? 'public') === 'public')
                .map(([method]) => `${method.toUpperCase()} ${path}`))
        expect(documented.filter(operation => !(operation in cases))).toEqual([])
    })
})
