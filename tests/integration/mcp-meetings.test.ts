/** @jest-environment node */
import { Realm } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import { mcpGetCity, mcpListMeetings } from '@/lib/mcp/data'
import { mcpRealmStore, requestContext } from '@/lib/mcp/realm-context'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting } from '../helpers/factories'

// Anonymous, like a public connector: it sees released meetings only.
const ANON = null
// A service key, which sees a city's drafts.
const SERVICE = { type: 'service', keyName: 'test' } as const

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

        const city = await asRequest(() => mcpGetCity('athens', SERVICE))
        expect(city.administrativeBodies.map(b => b.id)).toContain(draftOnly.id)

        // The id has to be usable, or listing it is worse than withholding it.
        const { meetings } = await asRequest(() => mcpListMeetings('athens', {
            ...page, administrativeBodyIds: [draftOnly.id],
        }, SERVICE))
        expect(meetings.map(m => m.id)).toEqual(['draft'])
    })
})
