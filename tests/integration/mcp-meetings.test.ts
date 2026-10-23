/** @jest-environment node */
import { Realm } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import { mcpGetCity, mcpGetMeeting, mcpGetSubjectTranscript, mcpGetTranscript, mcpListMeetings } from '@/lib/mcp/data'
import { mcpRealmStore, requestContext } from '@/lib/mcp/realm-context'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import {
    createAdministrativeBody,
    createCity,
    createMeeting,
    createPerson,
    createSpeakerSegment,
    createSpeakerTag,
    createSubject,
    createUtterance,
    createUser,
} from '../helpers/factories'

// Anonymous, like a public connector: it sees released meetings only.
const ANON = null
// The token of a superadmin account, which sees every city's drafts.
let SUPERADMIN: { userId: string }

/** Run a tool implementation inside the realm scope the route handler opens. */
const asRequest = <T>(fn: () => Promise<T>) =>
    mcpRealmStore.run(requestContext(Realm.greece, 'opencouncil.gr', ANON), fn)

const page = { page: 1, pageSize: 10 }

describe('MCP meeting listing by administrative body - integration', () => {
    let communityId: string
    let committeeId: string

    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma)
        SUPERADMIN = { userId: (await createUser('bot@example.com', { isSuperAdmin: true })).id }
        await createCity({ id: 'athens', realm: Realm.greece })

        const community = await createAdministrativeBody('athens', {
            name: '3η Δημοτική Κοινότητα',
            name_en: '3rd Municipal Community',
            type: 'community',
        })
        const committee = await createAdministrativeBody('athens', {
            name: 'Δημοτική Επιτροπή',
            name_en: 'Municipal Committee',
            type: 'committee',
        })
        communityId = community.id
        committeeId = committee.id

        // The incident's shape: the community met in January and again in
        // July, while the committee kept meeting through August. Any
        // recent-weeks window returns committee meetings only, which is what
        // sent an assistant to relevance-ranked search and a stale answer.
        await createMeeting('athens', {
            id: 'jan28', dateTime: new Date('2026-01-28T16:30:00Z'),
            administrativeBodyId: communityId, released: true,
        })
        await createMeeting('athens', {
            id: 'jul14', dateTime: new Date('2026-07-14T15:30:00Z'),
            administrativeBodyId: communityId, released: true,
        })
        await createMeeting('athens', {
            id: 'aug18', dateTime: new Date('2026-08-18T07:30:00Z'),
            administrativeBodyId: committeeId, released: true,
        })
        // The community also has a session still to come, as the real one did
        // three days after the conversation that started this.
        await createMeeting('athens', {
            id: 'future', dateTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            administrativeBodyId: communityId, released: true,
        })
    })

    test('reports how many meetings match over every page', async () => {
        const { meetings, pagination } = await asRequest(() =>
            mcpListMeetings('athens', { page: 2, pageSize: 2, administrativeBodyIds: [communityId] }, ANON))
        expect(meetings).toHaveLength(1)
        expect(pagination).toEqual({ total: 3, page: 2, pageSize: 2, totalPages: 2 })
    })

    test('the total counts drafts for a caller who can see them, and for no one else', async () => {
        await createMeeting('athens', {
            id: 'draft', dateTime: new Date('2026-03-03T15:00:00Z'),
            administrativeBodyId: communityId, released: false,
        })
        const anonymous = await asRequest(() =>
            mcpListMeetings('athens', { ...page, administrativeBodyIds: [communityId] }, ANON))
        const service = await asRequest(() =>
            mcpListMeetings('athens', { ...page, administrativeBodyIds: [communityId] }, SUPERADMIN))
        expect(anonymous.pagination.total).toBe(3)
        expect(service.pagination.total).toBe(4)
    })

    test('the total follows the time filter and the date range', async () => {
        const past = await asRequest(() =>
            mcpListMeetings('athens', { ...page, administrativeBodyIds: [communityId], timeFilter: 'past' }, ANON))
        const upcoming = await asRequest(() =>
            mcpListMeetings('athens', { ...page, administrativeBodyIds: [communityId], timeFilter: 'upcoming' }, ANON))
        const range = await asRequest(() =>
            mcpListMeetings('athens', { ...page, administrativeBodyIds: [communityId], from: '2026-02-01', to: '2026-07-31' }, ANON))
        expect(past.pagination).toEqual({ total: 2, page: 1, pageSize: 10, totalPages: 1 })
        expect(upcoming.pagination).toEqual({ total: 1, page: 1, pageSize: 10, totalPages: 1 })
        expect(range.pagination).toEqual({ total: 1, page: 1, pageSize: 10, totalPages: 1 })
    })

    test('administrativeBodyIds returns that body\'s meetings, newest first', async () => {
        const { meetings } = await asRequest(() =>
            mcpListMeetings('athens', { ...page, administrativeBodyIds: [communityId] }, ANON))

        expect(meetings.map(m => m.id)).toEqual(['future', 'jul14', 'jan28'])
    })

    test('the body filter alone puts a scheduled meeting first, timeFilter separates them', async () => {
        // Why the tool description tells a caller to pair the two: a bare body
        // filter answers "when did this body last meet" with a date that has
        // not happened yet.
        const bare = await asRequest(() =>
            mcpListMeetings('athens', { ...page, administrativeBodyIds: [communityId] }, ANON))
        const past = await asRequest(() =>
            mcpListMeetings('athens', {
                ...page, administrativeBodyIds: [communityId], timeFilter: 'past',
            }, ANON))
        const upcoming = await asRequest(() =>
            mcpListMeetings('athens', {
                ...page, administrativeBodyIds: [communityId], timeFilter: 'upcoming',
            }, ANON))

        expect(bare.meetings[0].id).toBe('future')
        expect(past.meetings.map(m => m.id)).toEqual(['jul14', 'jan28'])
        expect(upcoming.meetings.map(m => m.id)).toEqual(['future'])
    })

    test('administrativeBodyTypes separates κοινότητες from επιτροπές', async () => {
        const community = await asRequest(() => mcpListMeetings('athens', {
            ...page, administrativeBodyTypes: ['community'], timeFilter: 'past',
        }, ANON))
        const committee = await asRequest(() => mcpListMeetings('athens', {
            ...page, administrativeBodyTypes: ['committee'], timeFilter: 'past',
        }, ANON))

        expect(community.meetings.map(m => m.id)).toEqual(['jul14', 'jan28'])
        expect(committee.meetings.map(m => m.id)).toEqual(['aug18'])
    })

    test('an unknown body id is an error, not an empty list', async () => {
        // An empty list would read as "this body never met" — the inference
        // that produced the incident in the first place.
        await expect(asRequest(() => mcpListMeetings('athens', {
            ...page, administrativeBodyIds: ['no-such-body'],
        }, ANON))).rejects.toThrow(/Unknown administrative body.*get_city/)
    })

    test('a body id from another city is rejected too', async () => {
        await createCity({ id: 'chania', realm: Realm.greece })
        const foreign = await createAdministrativeBody('chania', { type: 'council' })

        await expect(asRequest(() => mcpListMeetings('athens', {
            ...page, administrativeBodyIds: [foreign.id],
        }, ANON))).rejects.toThrow(/Unknown administrative body/)
    })

    test('ids take precedence over types, matching the data layer', async () => {
        const { meetings } = await asRequest(() => mcpListMeetings('athens', {
            ...page,
            administrativeBodyIds: [committeeId],
            administrativeBodyTypes: ['community'],
            timeFilter: 'past',
        }, ANON))

        expect(meetings.map(m => m.id)).toEqual(['aug18'])
    })

    test('the filter composes with a date window', async () => {
        const { meetings } = await asRequest(() => mcpListMeetings('athens', {
            ...page,
            administrativeBodyIds: [communityId],
            from: '2026-02-01',
        }, ANON))

        expect(meetings.map(m => m.id)).toEqual(['future', 'jul14'])
    })

    test('both date bounds are inclusive of meetings held that day', async () => {
        // jul14 is at 15:30. A bound parsed as bare midnight would drop it
        // from either end, though both are documented as inclusive.
        const to = await asRequest(() => mcpListMeetings('athens', {
            ...page, administrativeBodyIds: [communityId], to: '2026-07-14',
        }, ANON))
        const from = await asRequest(() => mcpListMeetings('athens', {
            ...page, administrativeBodyIds: [communityId], from: '2026-07-14',
        }, ANON))

        expect(to.meetings.map(m => m.id)).toEqual(['jul14', 'jan28'])
        expect(from.meetings.map(m => m.id)).toEqual(['future', 'jul14'])
    })

    test('get_city hands back body ids that list_meetings accepts', async () => {
        // The round trip is the point: a caller resolves «3η Δημοτική
        // Κοινότητα» to an id here and filters with it, without guessing.
        const city = await asRequest(() => mcpGetCity('athens', ANON))
        const resolved = city.administrativeBodies.find(b => b.name === '3η Δημοτική Κοινότητα')

        expect(resolved).toMatchObject({ id: communityId, type: 'community' })

        const { meetings } = await asRequest(() => mcpListMeetings('athens', {
            ...page, administrativeBodyIds: [resolved!.id], timeFilter: 'past',
        }, ANON))
        expect(meetings.map(m => m.id)).toEqual(['jul14', 'jan28'])
    })

    test('get_city withholds a body whose meetings are all drafts', async () => {
        const draftOnly = await createAdministrativeBody('athens', {
            name: 'Επιτροπή Ποιότητας Ζωής',
            name_en: 'Quality of Life Committee',
            type: 'committee',
        })
        await createMeeting('athens', {
            id: 'draft', dateTime: new Date('2026-08-20T07:30:00Z'),
            administrativeBodyId: draftOnly.id, released: false,
        })

        const city = await asRequest(() => mcpGetCity('athens', ANON))

        // Anonymous callers cannot see the drafts, so offering the body would
        // only produce an empty filter.
        expect(city.administrativeBodies.map(b => b.id)).not.toContain(draftOnly.id)
        expect(city.administrativeBodies.map(b => b.id)).toEqual(
            expect.arrayContaining([communityId, committeeId]))
    })

    test('get_city offers a draft-only body to a caller who can see drafts', async () => {
        const draftOnly = await createAdministrativeBody('athens', {
            name: 'Επιτροπή Ποιότητας Ζωής',
            name_en: 'Quality of Life Committee',
            type: 'committee',
        })
        await createMeeting('athens', {
            id: 'draft', dateTime: new Date('2026-08-20T07:30:00Z'),
            administrativeBodyId: draftOnly.id, released: false,
        })

        const city = await asRequest(() => mcpGetCity('athens', SUPERADMIN))
        expect(city.administrativeBodies.map(b => b.id)).toContain(draftOnly.id)

        // The id has to be usable, or listing it is worse than withholding it.
        const { meetings } = await asRequest(() => mcpListMeetings('athens', {
            ...page, administrativeBodyIds: [draftOnly.id],
        }, SUPERADMIN))
        expect(meetings.map(m => m.id)).toEqual(['draft'])
    })
})

describe('MCP meeting tools report the record of a meeting - integration', () => {
    beforeEach(async () => {
        await resetDatabase(prisma)
        SUPERADMIN = { userId: (await createUser('bot@example.com', { isSuperAdmin: true })).id }
        await createCity({ id: 'athens', realm: Realm.greece })
        const council = await createAdministrativeBody('athens', {
            name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council', type: 'council', place: 'Δημαρχείο',
        })
        await createMeeting('athens', {
            id: 'mar12_2026', dateTime: new Date('2026-03-12T16:00:00Z'), administrativeBodyId: council.id,
            name: null, name_en: null, kind: 'ordinary', scheduleStatus: 'postponed', released: false,
        })
        await createMeeting('athens', {
            id: 'mar19_2026', dateTime: new Date('2026-03-19T16:00:00Z'), administrativeBodyId: council.id,
            name: null, name_en: null, kind: 'ordinary', sessionNumber: 15, postponedFromId: 'mar12_2026', released: true,
        })
        await createMeeting('athens', {
            id: 'mar26_2026', dateTime: new Date('2026-03-26T16:00:00Z'), administrativeBodyId: council.id,
            name: null, name_en: null, kind: 'ordinary', urgent: true, format: 'inPerson', scheduleStatus: 'cancelled', scheduleStatusReason: 'Λόγω απεργίας', released: true,
        })
    })

    test('list_meetings marks a cancelled meeting and never names the postponed one', async () => {
        const { meetings } = await asRequest(() => mcpListMeetings('athens', page, ANON))
        expect(meetings.map((m) => m.id)).toEqual(['mar26_2026', 'mar19_2026'])
        expect(meetings[0]).toMatchObject({
            name: 'Δημοτικό Συμβούλιο · Έκτακτη Συνεδρίαση · 26/03/2026',
            title: 'Έκτακτη Συνεδρίαση',
            scheduleStatus: 'cancelled', scheduleStatusReason: 'Λόγω απεργίας', kind: 'ordinary', urgent: true, format: 'inPerson',
        })
        expect(meetings[1]).toMatchObject({
            scheduleStatus: 'scheduled', sessionNumber: 15, place: 'Δημαρχείο', postponedFromDate: '2026-03-12T16:00:00.000Z',
        })
        expect(JSON.stringify(meetings)).not.toContain('mar12_2026')
    })

    test('get_meeting says that a cancelled meeting did not take place', async () => {
        const meeting = await asRequest(() => mcpGetMeeting('athens', 'mar26_2026', ANON))
        expect(meeting).toMatchObject({ scheduleStatus: 'cancelled', kind: 'ordinary', urgent: true })
        expect(meeting.note).toMatch(/cancelled/)
    })

    test('get_meeting of the new meeting carries the original date, not the id', async () => {
        const meeting = await asRequest(() => mcpGetMeeting('athens', 'mar19_2026', SUPERADMIN))
        expect(meeting.postponedFromDate).toBe('2026-03-12T16:00:00.000Z')
        expect(JSON.stringify(meeting)).not.toContain('mar12_2026')
    })
})

describe('MCP transcript tools page the record - integration', () => {
    let personId: string
    let subjectId: string

    beforeEach(async () => {
        await resetDatabase(prisma)
        SUPERADMIN = { userId: (await createUser('bot@example.com', { isSuperAdmin: true })).id }
        await createCity({ id: 'athens', realm: Realm.greece })
        await createMeeting('athens', { id: 'long', dateTime: new Date('2026-05-05T15:00:00Z'), released: true })
        await createMeeting('athens', { id: 'silent', dateTime: new Date('2026-05-12T15:00:00Z'), released: true })

        personId = (await createPerson('athens', { name: 'Μαρία Παππά' })).id
        const mayor = await createSpeakerTag({ label: 'Δήμαρχος' })
        const councillor = await createSpeakerTag({ label: 'Σύμβουλος', personId })
        // Seven segments; the councillor speaks in the 2nd, 4th and 6th.
        const segmentIds: string[] = []
        for (let i = 0; i < 7; i++) {
            const segment = await createSpeakerSegment('long', 'athens', {
                speakerTagId: i % 2 === 1 ? councillor.id : mayor.id, startTimestamp: i * 60, endTimestamp: i * 60 + 50,
            })
            await createUtterance(segment.id, { text: `Τμήμα ${i}`, startTimestamp: i * 60, endTimestamp: i * 60 + 10 })
            segmentIds.push(segment.id)
        }

        // A subject discussed over one utterance more than a page of get_subject_transcript holds.
        subjectId = (await createSubject('long', 'athens', { name: 'Προϋπολογισμός' })).id
        await prisma.utterance.createMany({
            data: Array.from({ length: 151 }, (_, i) => ({
                speakerSegmentId: segmentIds[0], text: `Θέμα ${i}`, startTimestamp: 1000 + i, endTimestamp: 1000 + i + 0.5,
                discussionSubjectId: subjectId, discussionStatus: 'SUBJECT_DISCUSSION' as const,
            })),
        })
    })

    test('get_transcript pages the segments by the page size asked for', async () => {
        const result = await asRequest(() =>
            mcpGetTranscript('athens', 'long', { page: 2, pageSize: 3, includeUtteranceIds: false }, SUPERADMIN))
        expect(result.pagination).toEqual({ total: 7, page: 2, pageSize: 3, totalPages: 3 })
        expect(result.segments.map(s => s.text)).toEqual(['Τμήμα 3', 'Τμήμα 4', 'Τμήμα 5'])
    })

    test('get_transcript counts only the segments of the person asked for', async () => {
        const result = await asRequest(() =>
            mcpGetTranscript('athens', 'long', { page: 2, pageSize: 2, includeUtteranceIds: false, personId }, SUPERADMIN))
        expect(result.pagination).toEqual({ total: 3, page: 2, pageSize: 2, totalPages: 2 })
        expect(result.segments.map(s => s.text)).toEqual(['Τμήμα 5'])
    })

    test('get_transcript of a meeting with no transcript reports no pages', async () => {
        const result = await asRequest(() =>
            mcpGetTranscript('athens', 'silent', { page: 1, pageSize: 40, includeUtteranceIds: false }, SUPERADMIN))
        expect(result.pagination).toEqual({ total: 0, page: 1, pageSize: 40, totalPages: 0 })
        expect(result.segments).toEqual([])
    })

    test('get_subject_transcript reports the utterances over every page', async () => {
        const result = await asRequest(() => mcpGetSubjectTranscript(subjectId, 2, SUPERADMIN))
        expect(result.pagination).toEqual({ total: 151, page: 2, pageSize: 150, totalPages: 2 })
        expect(result.utterances.map(u => u.text)).toEqual(['Θέμα 150'])
    })
})
