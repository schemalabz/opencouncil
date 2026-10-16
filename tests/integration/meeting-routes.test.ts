/** @jest-environment node */
jest.mock('next/cache', () => ({
    revalidateTag: jest.fn(),
    revalidatePath: jest.fn(),
    // No Next.js cache in a test: the wrapped function runs every time.
    unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))
jest.mock('@/lib/google-calendar', () => ({ syncMeetingToCalendar: jest.fn() }))
jest.mock('@/lib/tasks/processAgendaInternal', () => ({ requestProcessAgendaInternal: jest.fn() }))
jest.mock('@/lib/discord', () => ({ sendMeetingCreatedAdminAlert: jest.fn() }))

import { NextRequest } from 'next/server'
import prisma from '@/lib/db/prisma'
import { POST, GET as LIST } from '@/app/api/cities/[cityId]/meetings/route'
import { GET as READ, PUT } from '@/app/api/cities/[cityId]/meetings/[meetingId]/route'
import { getCouncilMeetingsForCityPublicCached } from '@/lib/cache/queries'
import { getCouncilMeetingsForCity } from '@/lib/db/meetingsList'
import { setMeetingReleased } from '@/lib/db/meetingLifecycle'
import { syncMeetingToCalendar } from '@/lib/google-calendar'
import { resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting, signInAsSuperAdmin } from '../helpers/factories'

const CITY = 'c1'

function request(url: string, body?: unknown) {
    return new NextRequest(new URL(url, 'http://localhost'), body === undefined
        ? undefined
        : { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
}

const cityParams = { params: Promise.resolve({ cityId: CITY }) }
const meetingParams = (meetingId: string) => ({ params: Promise.resolve({ cityId: CITY, meetingId }) })

describe('meeting API routes', () => {
    let councilId: string
    let committeeId: string

    beforeEach(async () => {
        await resetDatabase(prisma)
        await signInAsSuperAdmin()
        await createCity({ id: CITY })
        councilId = (await createAdministrativeBody(CITY, { type: 'council', name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council' })).id
        committeeId = (await createAdministrativeBody(CITY, { type: 'committee', name: 'Δημοτική Επιτροπή', name_en: 'Municipal Committee' })).id
    })

    test('creates two meetings on one day when no id is sent, with no stored name and an unstated kind and format', async () => {
        const body = { date: '2026-03-12T16:00:00.000Z', administrativeBodyId: councilId }
        const first = await POST(request(`/api/cities/${CITY}/meetings`, body), cityParams)
        const second = await POST(request(`/api/cities/${CITY}/meetings`, body), cityParams)
        expect([first.status, second.status]).toEqual([201, 201])
        const [a, b] = [await first.json(), await second.json()]
        expect([a.id, b.id]).toEqual(['mar12_2026', 'mar12_2026_2'])
        expect(a).toMatchObject({ kind: null, urgent: false, name: null, name_en: null, scheduleStatus: 'scheduled', format: null })
    })

    test('accepts an urgent meeting of a committee', async () => {
        const created = await POST(request(`/api/cities/${CITY}/meetings`, {
            date: '2026-03-12T16:00:00.000Z', administrativeBodyId: committeeId, kind: 'ordinary', urgent: true, sessionNumber: 2,
        }), cityParams)
        expect(created.status).toBe(201)
        expect(await created.json()).toMatchObject({ kind: 'ordinary', urgent: true })

        const put = await PUT(request(`/api/cities/${CITY}/meetings/mar12_2026`, {
            date: '2026-03-12T16:00:00.000Z', urgent: false,
        }), meetingParams('mar12_2026'))
        expect(put.status).toBe(200)
        expect(await put.json()).toMatchObject({ kind: 'ordinary', urgent: false })
    })

    test('refuses the urgency on a later part of a meeting with 422', async () => {
        await createMeeting(CITY, { id: 'first', dateTime: new Date('2026-03-12T16:00:00Z'), administrativeBodyId: councilId, kind: 'ordinary', urgent: true })
        const part = await POST(request(`/api/cities/${CITY}/meetings`, {
            date: '2026-03-13T16:00:00.000Z', administrativeBodyId: councilId, continuationOfId: 'first', urgent: true,
        }), cityParams)
        expect(part.status).toBe(422)
        expect(await part.json()).toMatchObject({ code: 'continuationOwnsNothing' })
    })

    test('refuses a rule violation with 422 and the code of the rule', async () => {
        await createMeeting(CITY, { id: 'a', dateTime: new Date('2026-03-12T16:00:00Z'), administrativeBodyId: councilId, kind: 'ordinary' })
        const linked = await POST(request(`/api/cities/${CITY}/meetings`, {
            date: '2026-03-19T16:00:00.000Z', administrativeBodyId: councilId, postponedFromId: 'a',
        }), cityParams)
        expect(linked.status).toBe(422)
        expect(await linked.json()).toMatchObject({ code: 'postponedFromNotPostponed' })

        await createMeeting(CITY, { id: 'm', dateTime: new Date('2026-03-12T16:00:00Z'), administrativeBodyId: committeeId, kind: 'ordinary' })
        const put = await PUT(request(`/api/cities/${CITY}/meetings/m`, {
            date: '2026-03-12T16:00:00.000Z', administrativeBodyId: committeeId, kind: 'accountability',
        }), meetingParams('m'))
        expect(put.status).toBe(422)
        expect(await put.json()).toMatchObject({ code: 'councilOnlyKind' })
    })

    test('refuses a body of another city with 422, instead of reading it as the council', async () => {
        await createCity({ id: 'c2' })
        const otherCommittee = await createAdministrativeBody('c2', { type: 'committee' })
        const created = await POST(request(`/api/cities/${CITY}/meetings`, {
            date: '2026-03-12T16:00:00.000Z', administrativeBodyId: otherCommittee.id, kind: 'budget',
        }), cityParams)
        expect(created.status).toBe(422)
        expect(await created.json()).toMatchObject({ code: 'bodyMissing' })
    })

    test('refuses the kind, the urgency and the session number outside Greece with 422', async () => {
        const rennes = 'rennes'
        await createCity({ id: rennes, realm: 'france', timezone: 'Europe/Paris' })
        const params = { params: Promise.resolve({ cityId: rennes }) }
        const date = '2026-04-27T16:00:00.000Z'
        for (const fact of [{ kind: 'ordinary' }, { urgent: true }, { sessionNumber: 3 }]) {
            const refused = await POST(request(`/api/cities/${rennes}/meetings`, { date, ...fact }), params)
            expect(refused.status).toBe(422)
            expect(await refused.json()).toMatchObject({ code: 'greekRealmOnly' })
        }
        expect(await prisma.councilMeeting.count({ where: { cityId: rennes } })).toBe(0)

        // Every other fact stays open, on create and on update.
        const created = await POST(request(`/api/cities/${rennes}/meetings`, { date, format: 'remote', closedToPublic: true }), params)
        expect(created.status).toBe(201)
        expect(await created.json()).toMatchObject({ kind: null, urgent: false, sessionNumber: null, format: 'remote' })
        const meetingId = { params: Promise.resolve({ cityId: rennes, meetingId: 'apr27_2026' }) }
        const cancelled = await PUT(request(`/api/cities/${rennes}/meetings/apr27_2026`, { date, scheduleStatus: 'cancelled' }), meetingId)
        expect(cancelled.status).toBe(200)
        const urgent = await PUT(request(`/api/cities/${rennes}/meetings/apr27_2026`, { date, urgent: true }), meetingId)
        expect(urgent.status).toBe(422)
        expect(await urgent.json()).toMatchObject({ code: 'greekRealmOnly' })
    })

    test('refuses a meeting by circulation, as the form and MCP do', async () => {
        const created = await POST(request(`/api/cities/${CITY}/meetings`, {
            date: '2026-03-19T16:00:00.000Z', administrativeBodyId: councilId, format: 'byCirculation',
        }), cityParams)
        expect(created.status).toBe(400)
        expect(await prisma.councilMeeting.count({ where: { cityId: CITY } })).toBe(0)
    })

    test('POST and PUT write no name, and a PUT keeps the legacy stored name', async () => {
        const names = { name: 'Ειδική Συνεδρίαση για το Λιμάνι', name_en: 'Special Meeting on the Port' }
        const created = await POST(request(`/api/cities/${CITY}/meetings`, {
            date: '2026-03-12T16:00:00.000Z', administrativeBodyId: councilId, meetingId: 'm', ...names,
        }), cityParams)
        expect(created.status).toBe(201)
        const stored = () => prisma.councilMeeting.findUniqueOrThrow({ where: { cityId_id: { cityId: CITY, id: 'm' } }, select: { name: true, name_en: true } })
        expect(await stored()).toEqual({ name: null, name_en: null })

        const put = await PUT(request(`/api/cities/${CITY}/meetings/m`, { date: '2026-03-12T16:00:00.000Z', ...names }), meetingParams('m'))
        expect(put.status).toBe(200)
        expect(await stored()).toEqual({ name: null, name_en: null })

        // A legacy record keeps its stored name through an edit, and a name in the request does not replace it.
        await createMeeting(CITY, { id: 'legacy', dateTime: new Date('2026-03-19T16:00:00Z'), administrativeBodyId: councilId, name: 'Δημοτικό Συμβούλιο 19/03/26', name_en: null })
        const edit = await PUT(request(`/api/cities/${CITY}/meetings/legacy`, { date: '2026-03-19T17:00:00.000Z', ...names }), meetingParams('legacy'))
        expect(edit.status).toBe(200)
        expect(await prisma.councilMeeting.findUniqueOrThrow({ where: { cityId_id: { cityId: CITY, id: 'legacy' } }, select: { name: true, name_en: true } }))
            .toEqual({ name: 'Δημοτικό Συμβούλιο 19/03/26', name_en: null })
    })

    test('PUT keeps the fields that the request leaves out', async () => {
        await createMeeting(CITY, {
            id: 'm', dateTime: new Date('2026-03-12T16:00:00Z'), administrativeBodyId: councilId,
            kind: 'budget', urgent: true, sessionNumber: 33, scheduleStatus: 'cancelled', scheduleStatusReason: 'Λόγω απεργίας',
            youtubeUrl: 'https://youtu.be/abc', agendaUrl: 'https://example.com/agenda.pdf',
        })
        const put = await PUT(request(`/api/cities/${CITY}/meetings/m`, {
            date: '2026-03-12T16:00:00.000Z',
        }), meetingParams('m'))
        expect(put.status).toBe(200)
        expect(await put.json()).toMatchObject({
            kind: 'budget', urgent: true, sessionNumber: 33, scheduleStatus: 'cancelled', scheduleStatusReason: 'Λόγω απεργίας',
            youtubeUrl: 'https://youtu.be/abc', agendaUrl: 'https://example.com/agenda.pdf', administrativeBodyId: councilId,
        })

        // An empty value clears a field, and null clears the body.
        const cleared = await PUT(request(`/api/cities/${CITY}/meetings/m`, {
            date: '2026-03-12T16:00:00.000Z', youtubeUrl: '', administrativeBodyId: null,
        }), meetingParams('m'))
        expect(await cleared.json()).toMatchObject({ youtubeUrl: null, administrativeBodyId: null, agendaUrl: 'https://example.com/agenda.pdf' })
    })

    test('PUT lets the calendar create the event when a meeting becomes scheduled, and only then', async () => {
        const sync = syncMeetingToCalendar as jest.MockedFunction<typeof syncMeetingToCalendar>
        sync.mockClear()
        await createMeeting(CITY, { id: 'm', dateTime: new Date(Date.now() + 86_400_000), administrativeBodyId: councilId, kind: 'ordinary', scheduleStatus: 'cancelled' })
        const date = new Date(Date.now() + 86_400_000).toISOString()
        await PUT(request(`/api/cities/${CITY}/meetings/m`, { date, scheduleStatus: 'scheduled' }), meetingParams('m'))
        expect(sync).toHaveBeenLastCalledWith(CITY, 'm', { allowCreate: true })
        await PUT(request(`/api/cities/${CITY}/meetings/m`, { date, scheduleStatus: 'scheduled' }), meetingParams('m'))
        expect(sync).toHaveBeenLastCalledWith(CITY, 'm', { allowCreate: false })
    })

    describe('the public list', () => {
        async function postponedAndReleased() {
            await createMeeting(CITY, { id: 'mar12_2026', dateTime: new Date('2026-03-12T16:00:00Z'), administrativeBodyId: councilId, kind: 'ordinary', scheduleStatus: 'postponed', released: true, name: null, name_en: null })
            await createMeeting(CITY, { id: 'mar19_2026', dateTime: new Date('2026-03-19T16:00:00Z'), administrativeBodyId: councilId, kind: 'ordinary', postponedFromId: 'mar12_2026', name: null, name_en: null })
            await setMeetingReleased(CITY, 'mar19_2026', true)
        }

        test('names every meeting and never names the postponed meeting', async () => {
            await postponedAndReleased()
            const response = await LIST(request(`/api/cities/${CITY}/meetings`), cityParams)
            const text = await response.text()
            expect(text).not.toContain('mar12_2026')
            expect(text).not.toContain('postponedFromId')
            expect(JSON.parse(text)).toEqual([
                expect.objectContaining({
                    id: 'mar19_2026',
                    name: 'Δημοτικό Συμβούλιο · Τακτική Συνεδρίαση · 19/03/2026',
                    name_en: 'Municipal Council · Regular Meeting · 19/03/2026',
                    title: 'Τακτική Συνεδρίαση',
                    postponedFromDate: '2026-03-12T16:00:00.000Z',
                }),
            ])
        })

        test('keeps the municipal minutes out of the public list, the public meeting and the cached list (#876)', async () => {
            const minutes = 'https://example.com/private-minutes.pdf'
            await createMeeting(CITY, { id: 'mar26_2026', dateTime: new Date('2026-03-26T16:00:00Z'), administrativeBodyId: councilId, kind: 'ordinary', name: null, name_en: null, municipalMinutesUrl: minutes })
            await setMeetingReleased(CITY, 'mar26_2026', true)

            expect(await (await LIST(request(`/api/cities/${CITY}/meetings`), cityParams)).text()).not.toContain('private-minutes')
            expect(await (await READ(request(`/api/cities/${CITY}/meetings/mar26_2026`), meetingParams('mar26_2026'))).text()).not.toContain('private-minutes')
            expect(JSON.stringify(await getCouncilMeetingsForCityPublicCached(CITY))).not.toContain('private-minutes')

            // The editor list carries it: the edit form reads it from there.
            const rows = await (await LIST(request(`/api/cities/${CITY}/meetings?includeUnreleased=true`), cityParams)).json()
            expect(rows.find((r: { id: string }) => r.id === 'mar26_2026').municipalMinutesUrl).toBe(minutes)
        })

        test('gives an editor the raw rows, links included', async () => {
            await postponedAndReleased()
            const response = await LIST(request(`/api/cities/${CITY}/meetings?includeUnreleased=true`), cityParams)
            const rows = await response.json()
            expect(rows.map((r: { id: string }) => r.id).sort()).toEqual(['mar12_2026', 'mar19_2026'])
            expect(rows.find((r: { id: string }) => r.id === 'mar19_2026').postponedFromId).toBe('mar12_2026')
        })

        test.each(['editor first', 'public first'])('keeps the public cached list apart from the editor list (%s)', async (order) => {
            await postponedAndReleased()
            const readPublic = () => getCouncilMeetingsForCityPublicCached(CITY)
            const readEditor = () => getCouncilMeetingsForCity(CITY, { includeUnreleased: true })
            const [publicRows, editorRows] = order === 'editor first'
                ? await readEditor().then(async (editor) => [await readPublic(), editor])
                : await readPublic().then(async (pub) => [pub, await readEditor()])
            expect(publicRows.map((r) => r.id)).toEqual(['mar19_2026'])
            expect(JSON.stringify(publicRows)).not.toContain('mar12_2026')
            expect(editorRows).toHaveLength(2)
        })
    })
})
