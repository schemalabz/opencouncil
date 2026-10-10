/** @jest-environment node */
import { NextRequest } from 'next/server'
import { Realm } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import { GET as getCity } from '@/app/api/cities/[cityId]/route'
import { GET as listBodies } from '@/app/api/cities/[cityId]/administrative-bodies/route'
import { GET as listMeetings } from '@/app/api/cities/[cityId]/meetings/route'
import { GET as getMeeting } from '@/app/api/cities/[cityId]/meetings/[meetingId]/route'
import { GET as listMeetingSubjects } from '@/app/api/cities/[cityId]/meetings/[meetingId]/subjects/route'
import { GET as getSubject } from '@/app/api/cities/[cityId]/meetings/[meetingId]/subjects/[subjectId]/route'
import { GET as listCitySubjects } from '@/app/api/cities/[cityId]/subjects/route'
import { GET as listParties } from '@/app/api/cities/[cityId]/parties/route'
import { GET as getParty } from '@/app/api/cities/[cityId]/parties/[partyId]/route'
import { GET as listPeople } from '@/app/api/cities/[cityId]/people/route'
import { GET as getPerson } from '@/app/api/cities/[cityId]/people/[personId]/route'
import { GET as getUtteranceContext } from '@/app/api/utterance/[utteranceId]/context/route'
import { GET as listUpcomingMeetings } from '@/app/api/meetings/upcoming/route'
import { GET as getStatistics } from '@/app/api/statistics/route'
import {
    mcpGetCity, mcpGetMeeting, mcpGetParty, mcpGetPerson, mcpGetSubject, mcpGetSubjectTranscript,
    mcpGetTranscript, mcpListMeetings, mcpListPeople,
} from '@/lib/mcp/data'
import { mcpRealmStore, requestContext } from '@/lib/mcp/realm-context'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting, createSubject, createTaskStatus } from '../helpers/factories'
import { __setSessionEmail } from '../mocks/auth'

// The handlers read through unstable_cache and the request realm, which need
// a Next request scope that a route test does not have.
jest.mock('next/cache', () => ({
    unstable_cache: <T>(fn: T) => fn,
    revalidateTag: jest.fn(),
    revalidatePath: jest.fn(),
}))
jest.mock('@/lib/realm.server', () => ({ getRealm: async () => 'greece' }))

const cityId = 'testcity'
const pastMeetingId = 'past'
const upcomingMeetingId = 'upcoming'
const base = 'http://localhost'

// The municipality's settings for the body. A reader of the public API must
// get none of them: not the field names, and not the values.
const SENSITIVE_FIELDS = ['contactEmails', 'notificationBehavior', 'diavgeiaUnitIds', 'decisionConventions', 'showUnreviewedTranscript']
const CONTACT_EMAILS = ['transcripts.clerk@municipality.example', 'secretary.private@municipality.example']
const DIAVGEIA_SCOPE = '84655:100010590'
const CONVENTIONS_MARKER = 'conventions-marker-roll-call'
// The public name of the body. A read that returns the body carries its id or its name.
const BODY_NAME = 'Body-name-marker'

const ANON = null
const asRequest = <T>(fn: () => Promise<T>) =>
    mcpRealmStore.run(requestContext(Realm.greece, 'opencouncil.gr', ANON), fn)

const get = (url: string) => new NextRequest(`${base}${url}`)
const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) })
const json = async (response: Response) => {
    expect(response.status).toBe(200)
    return response.json() as Promise<unknown>
}

const ids = { bodyId: '', partyId: '', personId: '', subjectId: '', utteranceId: '' }

// Every public read that can return an administrative body, by name.
const reads: Record<string, () => Promise<unknown>> = {
    'GET /api/cities/{cityId}': async () => json(await getCity(get(`/api/cities/${cityId}`), params({ cityId }))),
    'GET /api/cities/{cityId}/administrative-bodies': async () =>
        json(await listBodies(get(`/api/cities/${cityId}/administrative-bodies`), params({ cityId }))),
    'GET /api/cities/{cityId}/meetings': async () =>
        json(await listMeetings(get(`/api/cities/${cityId}/meetings`), params({ cityId }))),
    'GET /api/cities/{cityId}/meetings/{meetingId}': async () =>
        json(await getMeeting(get(`/api/cities/${cityId}/meetings/${pastMeetingId}`), params({ cityId, meetingId: pastMeetingId }))),
    'GET /api/cities/{cityId}/meetings/{meetingId}/subjects': async () =>
        json(await listMeetingSubjects(get(`/api/cities/${cityId}/meetings/${pastMeetingId}/subjects`), params({ cityId, meetingId: pastMeetingId }))),
    'GET /api/cities/{cityId}/meetings/{meetingId}/subjects/{subjectId}': async () =>
        json(await getSubject(
            get(`/api/cities/${cityId}/meetings/${pastMeetingId}/subjects/${ids.subjectId}`),
            params({ cityId, meetingId: pastMeetingId, subjectId: ids.subjectId }),
        )),
    'GET /api/cities/{cityId}/subjects': async () =>
        json(await listCitySubjects(get(`/api/cities/${cityId}/subjects`), params({ cityId }))),
    'GET /api/cities/{cityId}/parties': async () =>
        json(await listParties(get(`/api/cities/${cityId}/parties`), params({ cityId }))),
    'GET /api/cities/{cityId}/parties/{partyId}': async () =>
        json(await getParty(get(`/api/cities/${cityId}/parties/${ids.partyId}`), params({ cityId, partyId: ids.partyId }))),
    'GET /api/cities/{cityId}/people': async () =>
        json(await listPeople(get(`/api/cities/${cityId}/people`), params({ cityId }))),
    'GET /api/cities/{cityId}/people/{personId}': async () =>
        json(await getPerson(get(`/api/cities/${cityId}/people/${ids.personId}`), params({ cityId, personId: ids.personId }))),
    'GET /api/utterance/{utteranceId}/context': async () =>
        json(await getUtteranceContext(get(`/api/utterance/${ids.utteranceId}/context`), params({ utteranceId: ids.utteranceId }))),
    'GET /api/meetings/upcoming': async () => {
        const body = await json(await listUpcomingMeetings())
        expect(JSON.stringify(body)).toContain(upcomingMeetingId)
        return body
    },
    'GET /api/statistics?personId': async () =>
        json(await getStatistics(get(`/api/statistics?personId=${ids.personId}`))),
    'MCP get_city': () => asRequest(() => mcpGetCity(cityId, ANON)),
    'MCP list_people': () => asRequest(() => mcpListPeople(cityId, false)),
    'MCP get_person': () => asRequest(() => mcpGetPerson(ids.personId)),
    'MCP get_party': () => asRequest(() => mcpGetParty(ids.partyId)),
    'MCP list_meetings': () => asRequest(() => mcpListMeetings(cityId, { page: 1, pageSize: 10 }, ANON)),
    'MCP get_meeting': () => asRequest(() => mcpGetMeeting(cityId, pastMeetingId, ANON)),
    'MCP get_subject': () => asRequest(() => mcpGetSubject(ids.subjectId, ANON)),
    'MCP get_subject_transcript': () => asRequest(() => mcpGetSubjectTranscript(ids.subjectId, 1, ANON)),
    'MCP get_transcript': () => asRequest(() =>
        mcpGetTranscript(cityId, pastMeetingId, { page: 1, segmentsPerPage: 10, includeUtteranceIds: true }, ANON)),
}

describe('public reads return only the public fields of an administrative body', () => {
    beforeAll(async () => {
        await ensureTestDb()
        await resetDatabase(prisma)
        // Anonymous: no session, so no editor rights anywhere.
        __setSessionEmail(null)

        await createCity({ id: cityId })
        const body = await createAdministrativeBody(cityId, {
            name: BODY_NAME,
            contactEmails: CONTACT_EMAILS,
            notificationBehavior: 'NOTIFICATIONS_AUTO',
            diavgeiaUnitIds: [DIAVGEIA_SCOPE],
            decisionConventions: { marker: CONVENTIONS_MARKER },
            showUnreviewedTranscript: false,
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
                        { partyId: party.id, administrativeBodyId: body.id },
                        { administrativeBodyId: body.id, electedOrder: 1 },
                    ],
                },
            },
        })
        await createMeeting(cityId, {
            id: pastMeetingId,
            released: true,
            administrativeBodyId: body.id,
            dateTime: new Date('2026-01-15T17:00:00Z'),
        })
        // The body hides an unreviewed transcript, so the transcript reads
        // need a reviewed meeting to return anything.
        await createTaskStatus(pastMeetingId, cityId, { type: 'humanReview', status: 'succeeded' })
        await createMeeting(cityId, {
            id: upcomingMeetingId,
            released: true,
            administrativeBodyId: body.id,
            dateTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        })
        const subject = await createSubject(pastMeetingId, cityId, { agendaItemIndex: 1 })
        await prisma.subject.update({ where: { id: subject.id }, data: { personId: person.id } })
        const speakerTag = await prisma.speakerTag.create({ data: { label: 'Speaker 1', personId: person.id } })
        const segment = await prisma.speakerSegment.create({
            data: {
                startTimestamp: 0,
                endTimestamp: 10,
                meetingId: pastMeetingId,
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
        await prisma.utterance.updateMany({ where: { speakerSegmentId: segment.id }, data: { discussionSubjectId: subject.id } })

        Object.assign(ids, {
            bodyId: body.id,
            partyId: party.id,
            personId: person.id,
            subjectId: subject.id,
            utteranceId: segment.utterances[1].id,
        })
    })

    // A read that returns no body passes the leak check without checking
    // anything, so each read must also show the body, unless it is listed here.
    // These reads return no body today. They stay in the leak check so that a
    // body that a future change adds to them is checked.
    const READS_WITHOUT_BODY = new Set([
        'GET /api/cities/{cityId}',
        'GET /api/cities/{cityId}/meetings/{meetingId}/subjects',
        'GET /api/cities/{cityId}/meetings/{meetingId}/subjects/{subjectId}',
        'GET /api/cities/{cityId}/subjects',
        'GET /api/utterance/{utteranceId}/context',
        'MCP get_party',
        'MCP get_subject_transcript',
        'MCP get_transcript',
    ])

    it.each(Object.keys(reads))('%s', async (read) => {
        const text = JSON.stringify(await reads[read]())
        const showsBody = text.includes(ids.bodyId) || text.includes(BODY_NAME)
        expect(showsBody).toBe(!READS_WITHOUT_BODY.has(read))
        const leaked = [...SENSITIVE_FIELDS, ...CONTACT_EMAILS, DIAVGEIA_SCOPE, CONVENTIONS_MARKER]
            .filter(needle => text.includes(needle))
        expect(leaked).toEqual([])
    })
})
