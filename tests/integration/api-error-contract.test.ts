/** @jest-environment node */
import { NextRequest } from 'next/server'
import * as z from 'zod'
import prisma from '@/lib/db/prisma'
import { errorResponseSchema, searchErrorSchema, validationErrorSchema } from '@/lib/api/errors'
import { GET as listMeetings, POST as createMeetingRoute } from '@/app/api/cities/[cityId]/meetings/route'
import { POST as createBody } from '@/app/api/cities/[cityId]/administrative-bodies/route'
import { PUT as upsertDecision } from '@/app/api/cities/[cityId]/meetings/[meetingId]/decisions/route'
import { POST as updateElectedOrder } from '@/app/api/cities/[cityId]/roles/elected-order/route'
import { POST as searchRoute } from '@/app/api/search/route'
import { POST as createTopic } from '@/app/api/admin/topics/route'
import { POST as updateProfile } from '@/app/api/profile/route'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createCity, createMeeting, createUser, signInAsSuperAdmin } from '../helpers/factories'
import { strictSchema } from '../helpers/strictSchema'
import { __setSessionEmail } from '../mocks/auth'

// The routes revalidate caches and read the request realm, which need a Next
// request scope that a route test does not have.
jest.mock('next/cache', () => ({
    unstable_cache: <T>(fn: T) => fn,
    revalidateTag: jest.fn(),
    revalidatePath: jest.fn(),
}))
jest.mock('@/lib/realm.server', () => ({ getRealm: async () => 'greece' }))
jest.mock('@/lib/search', () => ({ search: jest.fn() }))
jest.mock('@/lib/derivation/persist', () => ({ deriveAndPersist: jest.fn(), explainMeeting: jest.fn() }))

const cityId = 'testcity'
const meetingId = 'meeting1'
const base = 'http://localhost'

const json = (url: string, body: unknown, method = 'POST') => new NextRequest(`${base}${url}`, {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
})
const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) })

/** The body of a response, parsed with a documented error schema that rejects undocumented keys. */
async function expectBody(response: Response, status: number, schema: z.core.$ZodType) {
    expect(response.status).toBe(status)
    const body: unknown = await response.json()
    const result = z.safeParse(strictSchema(schema), body)
    expect(result.success ? [] : result.error.issues).toEqual([])
    return body
}

describe('the API error contract', () => {
    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma as never)
        __setSessionEmail(null)
        await createCity({ id: cityId })
        await createMeeting(cityId, { id: meetingId })
    })

    // Each case is a route that answered a ZodError in its own shape before
    // the contract. Each now answers 400 with a ValidationError.
    describe('a request that fails the zod schema', () => {
        it('a list query, formerly the raw zod issues', async () => {
            const body = await expectBody(
                await listMeetings(new NextRequest(`${base}/api/cities/${cityId}/meetings?limit=0`), params({ cityId })),
                400,
                validationErrorSchema,
            )
            expect(body).toMatchObject({ error: [{ path: ['limit'] }] })
        })

        it('a decision, formerly { error, details }', async () => {
            await signInAsSuperAdmin()
            const body = await expectBody(
                await upsertDecision(json(`/api/cities/${cityId}/meetings/${meetingId}/decisions`, { subjectId: 's1', pdfUrl: 'javascript:alert(1)' }, 'PUT'),
                    params({ cityId, meetingId })),
                400,
                validationErrorSchema,
            )
            expect(body).toMatchObject({ error: [{ path: ['pdfUrl'] }] })
        })

        it('an elected order, formerly { error, details }', async () => {
            await signInAsSuperAdmin()
            await expectBody(
                await updateElectedOrder(json(`/api/cities/${cityId}/roles/elected-order`, { administrativeBodyId: 'b1', rankings: [{ roleId: 'r1', electedOrder: -1 }] }),
                    params({ cityId })),
                400,
                validationErrorSchema,
            )
        })

        it('a topic, formerly the issue messages joined into one string', async () => {
            await signInAsSuperAdmin()
            const body = await expectBody(await createTopic(json('/api/admin/topics', { name: '' })), 400, validationErrorSchema)
            expect(body).toMatchObject({ error: expect.arrayContaining([expect.objectContaining({ path: ['name'] })]) })
        })

        it('a profile, formerly zod flattenError output', async () => {
            const user = await createUser('reader@integration.test')
            __setSessionEmail(user.email)
            const body = await expectBody(await updateProfile(json('/api/profile', { phone: '123' })), 400, validationErrorSchema)
            // The profile form reads the rejection code as the message of the phone issue.
            expect(body).toMatchObject({ error: [{ path: ['phone'], message: expect.stringMatching(/^[a-zA-Z_.]+$/) }] })
        })

        it('a search keeps its documented envelope, with the same issues', async () => {
            const body = await expectBody(await searchRoute(json('/api/search', { query: 'πάρκα', page: 0 })), 400, searchErrorSchema)
            expect(body).toMatchObject({ error: { code: 'INVALID_REQUEST', details: [{ path: ['page'] }] } })
        })
    })

    // withUserAuthorizedToEdit threw a plain Error, which these handlers answered 500.
    describe('a request that the edit guard refuses', () => {
        const bodyRequest = () => json(`/api/cities/${cityId}/administrative-bodies`, { name: 'Επιτροπή', name_en: 'Committee', type: 'committee' })

        it('answers 401 when nobody is signed in', async () => {
            const body = await expectBody(await createBody(bodyRequest(), params({ cityId })), 401, errorResponseSchema)
            expect(body).toEqual({ error: 'Authentication required' })
            expect(await prisma.administrativeBody.count()).toBe(0)
        })

        it('answers 403 when the signed-in user may not edit the city', async () => {
            const user = await createUser('reader@integration.test')
            __setSessionEmail(user.email)
            const body = await expectBody(await createBody(bodyRequest(), params({ cityId })), 403, errorResponseSchema)
            expect(body).toEqual({ error: 'Not authorized' })
            expect(await prisma.administrativeBody.count()).toBe(0)
        })

        it('answers 401 for a handler that had no try block at all', async () => {
            await expectBody(
                await upsertDecision(json(`/api/cities/${cityId}/meetings/${meetingId}/decisions`, {}, 'PUT'), params({ cityId, meetingId })),
                401,
                errorResponseSchema,
            )
        })
    })

    // withServiceOrUserAuth guards the routes that a service key may also call.
    describe('a request that the service-or-user guard refuses', () => {
        const meetingRequest = () => json(`/api/cities/${cityId}/meetings`, { name: 'Συνεδρίαση', name_en: 'Meeting', date: '2026-10-05', meetingId: 'm2' })
        const unreleasedRequest = () => new NextRequest(`${base}/api/cities/${cityId}/meetings?includeUnreleased=true`)

        it('answers 401 when nobody is signed in', async () => {
            const body = await expectBody(await createMeetingRoute(meetingRequest(), params({ cityId })), 401, errorResponseSchema)
            expect(body).toEqual({ error: 'Authentication required' })
            await expectBody(await listMeetings(unreleasedRequest(), params({ cityId })), 401, errorResponseSchema)
            expect(await prisma.councilMeeting.count()).toBe(1)
        })

        it('answers 403 when the signed-in user may not edit the city', async () => {
            const user = await createUser('reader@integration.test')
            __setSessionEmail(user.email)
            const body = await expectBody(await createMeetingRoute(meetingRequest(), params({ cityId })), 403, errorResponseSchema)
            expect(body).toEqual({ error: 'Not authorized' })
            await expectBody(await listMeetings(unreleasedRequest(), params({ cityId })), 403, errorResponseSchema)
            expect(await prisma.councilMeeting.count()).toBe(1)
        })
    })
})
