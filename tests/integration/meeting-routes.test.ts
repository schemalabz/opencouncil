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
import { PUT } from '@/app/api/cities/[cityId]/meetings/[meetingId]/route'
import { getCouncilMeetingsForCityPublicCached } from '@/lib/cache/queries'
import { getCouncilMeetingsForCity } from '@/lib/db/meetingsList'
import { setMeetingReleased } from '@/lib/db/meetingLifecycle'
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

    test('creates two meetings on one day when no id is sent, with a regular kind and no stored name', async () => {
        const body = { date: '2026-03-12T16:00:00.000Z', administrativeBodyId: councilId }
        const first = await POST(request(`/api/cities/${CITY}/meetings`, body), cityParams)
        const second = await POST(request(`/api/cities/${CITY}/meetings`, body), cityParams)
        expect([first.status, second.status]).toEqual([201, 201])
        const [a, b] = [await first.json(), await second.json()]
        expect([a.id, b.id]).toEqual(['mar12_2026', 'mar12_2026_2'])
        expect(a).toMatchObject({ kind: 'regular', name: null, name_en: null, scheduleStatus: 'scheduled', format: 'inPerson' })
    })

    test('refuses a rule violation with 422 and the code of the rule', async () => {
        await createMeeting(CITY, { id: 'a', dateTime: new Date('2026-03-12T16:00:00Z'), administrativeBodyId: councilId, kind: 'regular' })
        const linked = await POST(request(`/api/cities/${CITY}/meetings`, {
            date: '2026-03-19T16:00:00.000Z', administrativeBodyId: councilId, postponedFromId: 'a',
        }), cityParams)
        expect(linked.status).toBe(422)
        expect(await linked.json()).toMatchObject({ code: 'postponedFromNotPostponed' })

        await createMeeting(CITY, { id: 'm', dateTime: new Date('2026-03-12T16:00:00Z'), administrativeBodyId: committeeId, kind: 'regular' })
        const put = await PUT(request(`/api/cities/${CITY}/meetings/m`, {
            date: '2026-03-12T16:00:00.000Z', administrativeBodyId: committeeId, kind: 'accountability',
        }), meetingParams('m'))
        expect(put.status).toBe(422)
        expect(await put.json()).toMatchObject({ code: 'councilOnlyKind' })
    })

    test('PUT keeps the fields that the request leaves out', async () => {
        await createMeeting(CITY, {
            id: 'm', dateTime: new Date('2026-03-12T16:00:00Z'), administrativeBodyId: councilId,
            kind: 'urgent', sessionNumber: 33, scheduleStatus: 'cancelled', scheduleStatusReason: 'Λόγω απεργίας',
            youtubeUrl: 'https://youtu.be/abc', agendaUrl: 'https://example.com/agenda.pdf',
        })
        const put = await PUT(request(`/api/cities/${CITY}/meetings/m`, {
            date: '2026-03-12T16:00:00.000Z',
        }), meetingParams('m'))
        expect(put.status).toBe(200)
        expect(await put.json()).toMatchObject({
            kind: 'urgent', sessionNumber: 33, scheduleStatus: 'cancelled', scheduleStatusReason: 'Λόγω απεργίας',
            youtubeUrl: 'https://youtu.be/abc', agendaUrl: 'https://example.com/agenda.pdf', administrativeBodyId: councilId,
        })

        // An empty value clears a field, and null clears the body.
        const cleared = await PUT(request(`/api/cities/${CITY}/meetings/m`, {
            date: '2026-03-12T16:00:00.000Z', youtubeUrl: '', administrativeBodyId: null,
        }), meetingParams('m'))
        expect(await cleared.json()).toMatchObject({ youtubeUrl: null, administrativeBodyId: null, agendaUrl: 'https://example.com/agenda.pdf' })
    })

    describe('the public list', () => {
        async function postponedAndReleased() {
            await createMeeting(CITY, { id: 'mar12_2026', dateTime: new Date('2026-03-12T16:00:00Z'), administrativeBodyId: councilId, kind: 'regular', scheduleStatus: 'postponed', released: true, name: null, name_en: null })
            await createMeeting(CITY, { id: 'mar19_2026', dateTime: new Date('2026-03-19T16:00:00Z'), administrativeBodyId: councilId, kind: 'regular', postponedFromId: 'mar12_2026', name: null, name_en: null })
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
                    name: 'Δημοτικό Συμβούλιο 19/03/2026',
                    name_en: 'Municipal Council 19/03/2026',
                    postponedFromDate: '2026-03-12T16:00:00.000Z',
                }),
            ])
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
