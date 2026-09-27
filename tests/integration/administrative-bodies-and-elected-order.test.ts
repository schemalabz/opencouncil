/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import { POST as createBody } from '@/app/api/cities/[cityId]/administrative-bodies/route'
import { PUT as updateBody } from '@/app/api/cities/[cityId]/administrative-bodies/[bodyId]/route'
import { POST as updateElectedOrder } from '@/app/api/cities/[cityId]/roles/elected-order/route'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting, createPerson, createSubject, signInAsSuperAdmin } from '../helpers/factories'

// revalidateTag needs a request scope that a route test does not have.
jest.mock('next/cache', () => ({ revalidateTag: jest.fn(), revalidatePath: jest.fn() }))
// after() needs a request scope too; the test runs what the route schedules.
const mockAfter = jest.fn()
jest.mock('next/server', () => ({ ...jest.requireActual('next/server'), after: (fn: () => unknown) => mockAfter(fn) }))
// The derivation has its own tests: here only which meetings it runs on.
const mockDeriveAndPersist = jest.fn()
jest.mock('@/lib/derivation/persist', () => ({ deriveAndPersist: (...a: unknown[]) => mockDeriveAndPersist(...a), explainMeeting: jest.fn() }))

const cityId = 'testcity'

function jsonRequest(path: string, body: unknown, method = 'POST') {
    return new Request(`http://localhost/api/cities/${cityId}/${path}`, {
        method,
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
    })
}

describe('administrative body and elected order routes', () => {
    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma as any)
        await signInAsSuperAdmin()
        await createCity({ id: cityId })
    })

    it('creates a body with the defaults the route applies', async () => {
        const response = await createBody(
            jsonRequest('administrative-bodies', { name: 'Δημοτική Επιτροπή', name_en: 'Municipal Committee', type: 'committee', diavgeiaUnitIds: '81689, 84655:100010590' }) as never,
            { params: Promise.resolve({ cityId }) },
        )
        expect(response.status).toBe(201)
        expect(await prisma.administrativeBody.findFirstOrThrow({ where: { cityId } })).toMatchObject({
            type: 'committee',
            contactEmails: [],
            notificationBehavior: 'NOTIFICATIONS_APPROVAL',
            showUnreviewedTranscript: true,
            diavgeiaUnitIds: ['81689', '84655:100010590'],
            youtubeChannelUrl: null,
        })
    })

    it('updates a body and rejects an invalid one', async () => {
        const body = await createAdministrativeBody(cityId)
        const params = { params: Promise.resolve({ cityId, bodyId: body.id }) }

        const ok = await updateBody(jsonRequest(`administrative-bodies/${body.id}`, {
            name: 'Council', name_en: 'Council', type: 'council', contactEmails: ['clerk@example.com'], youtubeChannelUrl: '',
        }, 'PUT') as never, params)
        expect(ok.status).toBe(200)
        expect((await prisma.administrativeBody.findUniqueOrThrow({ where: { id: body.id } })).contactEmails).toEqual(['clerk@example.com'])

        const bad = await updateBody(jsonRequest(`administrative-bodies/${body.id}`, {
            name: 'C', name_en: 'Council', type: 'parliament',
        }, 'PUT') as never, params)
        expect(bad.status).toBe(400)
        expect((await prisma.administrativeBody.findUniqueOrThrow({ where: { id: body.id } })).name).toBe('Council')
    })

    it('saves an elected order and rejects a negative one', async () => {
        const body = await createAdministrativeBody(cityId)
        const person = await createPerson(cityId)
        const role = await prisma.role.create({ data: { personId: person.id, administrativeBodyId: body.id } })
        const params = { params: Promise.resolve({ cityId }) }

        const ok = await updateElectedOrder(jsonRequest('roles/elected-order', {
            administrativeBodyId: body.id, rankings: [{ roleId: role.id, electedOrder: 5 }],
        }), params)
        expect(ok.status).toBe(200)
        expect((await prisma.role.findUniqueOrThrow({ where: { id: role.id } })).electedOrder).toBe(5)

        const bad = await updateElectedOrder(jsonRequest('roles/elected-order', {
            administrativeBodyId: body.id, rankings: [{ roleId: role.id, electedOrder: -1 }],
        }), params)
        expect(bad.status).toBe(400)
        expect((await prisma.role.findUniqueOrThrow({ where: { id: role.id } })).electedOrder).toBe(5)
    })

    describe('confirming the conventions of a body', () => {
        const conventions = {
            version: 1,
            rollCallLayout: 'present_and_absent',
            presentListMeaning: 'opening',
            attendanceChangeAnchors: ['agenda_item'],
            statesPerDecisionAttendance: false,
            statesPerVoteAbsence: false,
            usesSubstitutes: false,
            namedVoters: 'dissenters_only',
            mayorStatedSeparately: true,
            provenance: { source: 'profile', documentsSampled: 8 },
        }

        /** A meeting of the body with one agenda subject, linked to a page read (or not) by the poll. */
        async function meetingWithLinkedPage(id: string, bodyId: string, read: boolean) {
            await createMeeting(cityId, { id, administrativeBodyId: bodyId })
            const subject = await createSubject(id, cityId, { id: `${id}-s1`, agendaItemIndex: 1 })
            await prisma.decision.create({ data: {
                subjectId: subject.id, pdfUrl: `https://example.com/${id}.pdf`, ada: `ADA-${id}`,
                ...(read ? { extraction: { votes: [] }, extractorVersion: '4' } : {}),
            } })
        }

        async function confirm(bodyId: string) {
            return updateBody(jsonRequest(`administrative-bodies/${bodyId}`, { confirmConventions: true, decisionConventions: conventions }, 'PUT') as never,
                { params: Promise.resolve({ cityId, bodyId }) })
        }

        beforeEach(() => {
            mockAfter.mockReset()
            mockDeriveAndPersist.mockReset().mockResolvedValue(undefined)
        })

        it('derives every meeting of the body again, after the response, and reads no page', async () => {
            const body = await createAdministrativeBody(cityId)
            const other = await createAdministrativeBody(cityId)
            // Linked while the body had no record: the page stays unread until a
            // person polls the meeting. Confirming the record starts no poll.
            await meetingWithLinkedPage('m-unread', body.id, false)
            await meetingWithLinkedPage('m-read', body.id, true)
            await meetingWithLinkedPage('m-other', other.id, false)

            const response = await confirm(body.id)

            expect(response.status).toBe(200)
            // Scheduled, not started: nothing runs before the response.
            expect(mockAfter).toHaveBeenCalledTimes(1)
            expect(mockDeriveAndPersist).not.toHaveBeenCalled()

            await mockAfter.mock.calls[0][0]()
            expect(mockDeriveAndPersist.mock.calls.map(c => c[1]).sort()).toEqual(['m-read', 'm-unread'])
            expect(await prisma.taskStatus.count({ where: { type: 'pollDecisions' } })).toBe(0)
        })

        it('answers the request when a derivation fails', async () => {
            const body = await createAdministrativeBody(cityId)
            await meetingWithLinkedPage('m-unread', body.id, false)
            mockDeriveAndPersist.mockRejectedValue(new Error('derivation failed'))
            const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)

            const response = await confirm(body.id)
            expect(response.status).toBe(200)
            await expect(mockAfter.mock.calls[0][0]()).resolves.toBeUndefined()
            expect(consoleError).toHaveBeenCalled()
            consoleError.mockRestore()
        })
    })
})
