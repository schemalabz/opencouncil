/** @jest-environment node */
/**
 * What each role of #875 reaches once the guards check its rights, against a
 * real database: the session, the user row, the grant and the meeting all
 * come from the tables, so the test covers the whole chain from `auth()` to
 * the row that a right names.
 */
jest.mock('next/cache', () => ({
    revalidateTag: jest.fn(),
    revalidatePath: jest.fn(),
    unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))
jest.mock('@/lib/google-calendar', () => ({ syncMeetingToCalendar: jest.fn() }))
jest.mock('@/lib/discord', () => ({
    sendMeetingCreatedAdminAlert: jest.fn(),
    sendNotificationsCreatedAdminAlert: jest.fn(),
    sendNotificationsSentAdminAlert: jest.fn(),
}))
jest.mock('@/lib/notifications/deliver', () => ({ releaseNotifications: jest.fn() }))
jest.mock('@/lib/tasks/transcribeInternal', () => ({ requestTranscribeInternal: jest.fn(), deleteExistingSpeakerData: jest.fn() }))
jest.mock('@/lib/tasks/fixTranscriptInternal', () => ({ requestFixTranscriptInternal: jest.fn() }))
jest.mock('@/lib/tasks/autoTrigger', () => ({ autoTriggerTask: jest.fn() }))

import { NextRequest } from 'next/server'
import prisma from '@/lib/db/prisma'
import { ForbiddenError } from '@/lib/api/errors'
import { rightsFor } from '@/lib/auth'
import { ROLE_RIGHTS } from '@/lib/auth/rights'
import { getCouncilMeeting, toggleMeetingRelease } from '@/lib/db/meetings'
import { toggleHighlightShowcase } from '@/lib/db/highlights'
import { requestTranscribe } from '@/lib/tasks/transcribe'
import { processTaskResponse } from '@/lib/tasks/tasks'
import { resolveCandidateConflict } from '@/lib/tasks/pollDecisions'
import { GET as readDecisions, PUT as writeDecision } from '@/app/api/cities/[cityId]/meetings/[meetingId]/decisions/route'
import { PUT as editMeeting } from '@/app/api/cities/[cityId]/meetings/[meetingId]/route'
import { POST as sendNotifications } from '@/app/api/cities/[cityId]/meetings/[meetingId]/notifications/route'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createGrant, createMeeting, createSubject, createTaskStatus, createUser } from '../helpers/factories'
import { __setSessionEmail } from '../mocks/auth'
import type { GrantRole } from '@prisma/client'

const CITY = 'rolecity'
const DRAFT = 'draft'
const RELEASED = 'released'

const params = (meetingId: string) => ({ params: Promise.resolve({ cityId: CITY, meetingId }) })

function request(meetingId: string, path: string, method: 'GET' | 'PUT' | 'POST', body?: unknown) {
    return new NextRequest(new URL(`/api/cities/${CITY}/meetings/${meetingId}${path}`, 'http://localhost'), {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
    })
}

let bodyId: string

async function signInAs(role: GrantRole) {
    const user = await createUser(`${role}@integration.test`)
    await createGrant(user.id, { administrativeBodyId: bodyId }, { role })
    __setSessionEmail(user.email)
    return user
}

// The route answers 403 and the function throws for a held session without the right.
const forbidden = async (promise: Promise<unknown>) => expect(promise).rejects.toBeInstanceOf(ForbiddenError)

describe('the roles', () => {
    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma)
        __setSessionEmail(null)
        await createCity({ id: CITY })
        bodyId = (await createAdministrativeBody(CITY, { name: 'Youth council', name_en: 'Youth council', type: 'committee' })).id
        await createMeeting(CITY, { id: DRAFT, administrativeBodyId: bodyId, released: false })
        await createMeeting(CITY, { id: RELEASED, administrativeBodyId: bodyId, released: true })
    })

    it('lists the rights of the role on a meeting of the body', async () => {
        await signInAs('records')
        expect(await rightsFor({ cityId: CITY, councilMeetingId: DRAFT })).toEqual([...ROLE_RIGHTS.records])
        expect(await rightsFor({ cityId: CITY })).toEqual([])
    })

    it('records: reads and links the decisions, and does not edit the meeting', async () => {
        await signInAs('records')

        const read = await readDecisions(request(DRAFT, '/decisions', 'GET'), params(DRAFT))
        expect(read.status).toBe(200)
        expect(await read.json()).toMatchObject({ decisions: [], candidates: [] })

        const write = await writeDecision(request(DRAFT, '/decisions', 'PUT', { subjectId: 'none', pdfUrl: 'https://example.test/d.pdf' }), params(DRAFT))
        // Past the guard: the subject does not exist.
        expect(write.status).toBe(404)

        const edit = await editMeeting(request(DRAFT, '', 'PUT', { date: '2026-03-12T16:00:00.000Z' }), params(DRAFT))
        expect(edit.status).toBe(403)
    })

    it('viewer: reads the draft and the decisions, and does not link a decision', async () => {
        expect(await getCouncilMeeting(CITY, DRAFT)).toBeNull()

        await signInAs('viewer')
        expect(await getCouncilMeeting(CITY, DRAFT)).toMatchObject({ id: DRAFT, released: false })

        const read = await readDecisions(request(DRAFT, '/decisions', 'GET'), params(DRAFT))
        expect(read.status).toBe(200)

        const write = await writeDecision(request(DRAFT, '/decisions', 'PUT', { subjectId: 'none', pdfUrl: 'https://example.test/d.pdf' }), params(DRAFT))
        expect(write.status).toBe(403)
    })

    it('meetings: releases the meeting and starts a task, and does not send a notification', async () => {
        await signInAs('meetings')

        const hidden = await toggleMeetingRelease(CITY, RELEASED, false)
        expect(hidden.released).toBe(false)

        // Past the guard: the function answers the bad URL instead of throwing.
        expect(await requestTranscribe('not a url', DRAFT, CITY)).toEqual({ ok: false, message: 'The media URL must start with http:// or https://' })

        const send = await sendNotifications(request(DRAFT, '/notifications', 'POST', { type: 'beforeMeeting', subjectImportances: {} }), params(DRAFT))
        expect(send.status).toBe(403)
    })

    it('records: resolves a conflict on the body, and not one whose holder sits on another body', async () => {
        await signInAs('records')
        const council = await createAdministrativeBody(CITY, { name: 'Council', name_en: 'Council', type: 'council' })
        await createMeeting(CITY, { id: 'council', administrativeBodyId: council.id, released: false })
        const holder = await createSubject('council', CITY)
        const pdfUrl = 'https://example.test/holder.pdf'
        await prisma.decision.create({ data: { subjectId: holder.id, ada: 'ADA-1', pdfUrl } })
        const claimant = await createSubject(DRAFT, CITY)
        const candidate = await prisma.decisionCandidate.create({
            data: { cityId: CITY, ada: 'ADA-1', pdfUrl, readStatus: 'ok', councilMeetingId: DRAFT, subjectId: claimant.id },
        })

        // The move deletes the holder's decision, on a meeting of the council.
        await forbidden(resolveCandidateConflict(candidate.id, 'reassign'))
        expect(await resolveCandidateConflict(candidate.id, 'dismiss')).toBe('dismissed')
    })

    it('meetings: replays a meeting task, and not a voiceprint or a poll', async () => {
        const user = await createUser('city-meetings@integration.test')
        await createGrant(user.id, { cityId: CITY }, { role: 'meetings' })
        __setSessionEmail(user.email)

        const summarize = await createTaskStatus(DRAFT, CITY, { type: 'summarize', status: 'failed' })
        // Past the guard: the task has no payload to replay.
        await expect(processTaskResponse('summarize', summarize.id)).rejects.toThrow('has no result to replay')

        const voiceprint = await createTaskStatus(DRAFT, CITY, { type: 'generateVoiceprint', status: 'failed' })
        await forbidden(processTaskResponse('generateVoiceprint', voiceprint.id))
        const poll = await createTaskStatus(DRAFT, CITY, { type: 'pollDecisions', status: 'failed' })
        await forbidden(processTaskResponse('pollDecisions', poll.id))
    })

    it('highlights: showcases a highlight, and does not edit or release the meeting', async () => {
        const user = await signInAs('highlights')
        const highlight = await prisma.highlight.create({
            data: { name: 'Clip', meetingId: RELEASED, cityId: CITY, createdById: user.id, muxPlaybackId: 'mux' },
        })

        expect((await toggleHighlightShowcase(highlight.id)).isShowcased).toBe(true)

        const edit = await editMeeting(request(DRAFT, '', 'PUT', { date: '2026-03-12T16:00:00.000Z' }), params(DRAFT))
        expect(edit.status).toBe(403)
        await forbidden(toggleMeetingRelease(CITY, DRAFT, true))
        await forbidden(requestTranscribe('https://example.test/video', DRAFT, CITY))
    })
})
