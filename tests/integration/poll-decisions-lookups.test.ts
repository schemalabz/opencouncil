/** @jest-environment node */

jest.mock('@/lib/tasks/generateHighlight', () => ({ handleGenerateHighlightResult: jest.fn() }))
jest.mock('@/lib/auth', () => ({
    withUserAuthorizedToEdit: jest.fn(),
    isUserAuthorizedToEdit: jest.fn().mockResolvedValue(true),
    getCurrentUser: jest.fn().mockResolvedValue({ id: 'u1', isSuperAdmin: true }),
}))
const mockDeferred: Promise<unknown>[] = []
jest.mock('next/server', () => ({
    ...jest.requireActual('next/server'),
    after: (fn: () => unknown) => { mockDeferred.push(Promise.resolve().then(fn)) },
}))
jest.mock('@/lib/tasks/tasks', () => ({
    ...jest.requireActual('@/lib/tasks/tasks'),
    startTask: jest.fn(),
}))

import prisma from '@/lib/db/prisma'
import { handlePollDecisionsResult, requestPollDecisions } from '@/lib/tasks/pollDecisions'
import { startTask } from '@/lib/tasks/tasks'
import { resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting, createSubject, createTaskStatus } from '../helpers/factories'
import { makeExtractedDecision, makePollDecisionsResult } from '../helpers/builders'
import { PollDecisionsReadDecision } from '@/lib/apiTypes'

const mockStartTask = jest.mocked(startTask)
const cityId = 'c1'

describe('requestPollDecisions', () => {
    beforeEach(async () => {
        await resetDatabase(prisma)
        mockStartTask.mockReset()
        mockStartTask.mockImplementation(async (_type, _body, meetingId, city) =>
            prisma.taskStatus.create({
                data: { type: 'pollDecisions', requestBody: '{}', councilMeetingId: meetingId, cityId: city },
                // Matches taskStatusWithMeetingInclude in lib/tasks/tasks.ts: startTask's real
                // return shape, so the mock satisfies the same type without an `any` escape hatch.
                include: { councilMeeting: { select: { name_en: true, city: { select: { name_en: true } } } } },
            }))
        await createCity({ id: cityId, diavgeiaUid: '6104' })
        const body = await createAdministrativeBody(cityId, { notificationBehavior: 'NOTIFICATIONS_DISABLED' })
        await createMeeting(cityId, { id: 'm1', administrativeBodyId: body.id, dateTime: new Date('2025-01-10T10:00:00Z') })
    })

    it('sends lookups and a linked decision without an ΑΔΑ, and returns the task id', async () => {
        const manual = await createSubject('m1', cityId, { id: 's1', name: 'Manual', agendaItemIndex: 1 })
        await createSubject('m1', cityId, { id: 's2', name: 'Open', agendaItemIndex: 2 })
        await prisma.decision.create({ data: { subjectId: manual.id, pdfUrl: 'https://files.example/a.pdf', decisionNumber: '12/2025' } })

        const start = await requestPollDecisions(cityId, 'm1', { lookupAdas: ['9ΩΡΤΩΞ1-0ΥΣ'] })

        expect(start.status).toBe('started')
        const body = mockStartTask.mock.calls[0][1]
        expect(body.lookupAdas).toEqual(['9ΩΡΤΩΞ1-0ΥΣ'])
        expect(body.subjects.find((s: { subjectId: string }) => s.subjectId === 's1').existingDecision).toEqual({
            decisionTitle: '', pdfUrl: 'https://files.example/a.pdf', needsExtraction: true,
        })
    })

    it('does not start a second poll while one is pending', async () => {
        await createSubject('m1', cityId, { name: 'Open', agendaItemIndex: 1 })
        const running = await createTaskStatus('m1', cityId, { type: 'pollDecisions', status: 'processing' })

        const start = await requestPollDecisions(cityId, 'm1', { lookupAdas: ['9ΩΡΤΩΞ1-0ΥΣ'] })

        expect(start).toEqual({ status: 'alreadyRunning', taskId: running.id })
        expect(mockStartTask).not.toHaveBeenCalled()
    })
})

function readDecision(overrides: Partial<PollDecisionsReadDecision> & { ada: string }): PollDecisionsReadDecision {
    return {
        title: `Decision ${overrides.ada}`, pdfUrl: `https://diavgeia.gov.gr/doc/${overrides.ada}`,
        protocolNumber: null, publishDate: '2025-01-16', meetingDate: null, decisionNumber: null,
        readStatus: 'ok', fromKnown: false, subjectId: null, confidence: null, reasoning: null,
        ...overrides,
    }
}

describe('handlePollDecisionsResult — typed ΑΔΑ values', () => {
    beforeEach(async () => {
        await resetDatabase(prisma)
        await createCity({ id: cityId, diavgeiaUid: '6104' })
        const body = await createAdministrativeBody(cityId, { notificationBehavior: 'NOTIFICATIONS_DISABLED' })
        await createMeeting(cityId, { id: 'm1', administrativeBodyId: body.id, dateTime: new Date('2025-01-10T10:00:00Z') })
        await createMeeting(cityId, { id: 'm2', administrativeBodyId: body.id, dateTime: new Date('2025-01-17T10:00:00Z') })
        await createSubject('m1', cityId, { id: 's1', name: 'Subject', agendaItemIndex: 1 })
        await createSubject('m2', cityId, { id: 's2', name: 'Other', agendaItemIndex: 1 })
    })

    async function pollM1(decisions: PollDecisionsReadDecision[], lookupAdas: string[]) {
        const task = await createTaskStatus('m1', cityId, { type: 'pollDecisions', requestBody: JSON.stringify({ lookupAdas }) })
        await handlePollDecisionsResult(task.id, makePollDecisionsResult({ decisions }))
        await Promise.all(mockDeferred.splice(0))
    }

    it('files a looked-up document on the polled meeting even when it declares another session', async () => {
        await pollM1([readDecision({ ada: 'ΑΑΑ1-ΒΒ1', meetingDate: '2025-01-17' })], ['ΑΑΑ1-ΒΒ1'])

        const candidate = await prisma.decisionCandidate.findUniqueOrThrow({ where: { cityId_ada: { cityId, ada: 'ΑΑΑ1-ΒΒ1' } } })
        expect(candidate.councilMeetingId).toBe('m1')
        expect(candidate.meetingDate?.toISOString().slice(0, 10)).toBe('2025-01-17')
    })

    it('files a document nobody typed by its reading, as before', async () => {
        await pollM1([readDecision({ ada: 'ΑΑΑ1-ΒΒ1', meetingDate: '2025-01-17' })], [])

        const candidate = await prisma.decisionCandidate.findUniqueOrThrow({ where: { cityId_ada: { cityId, ada: 'ΑΑΑ1-ΒΒ1' } } })
        expect(candidate.councilMeetingId).toBe('m2')
    })

    it('brings back a dismissed candidate that someone typed again', async () => {
        await prisma.decisionCandidate.create({ data: {
            cityId, ada: 'ΑΑΑ1-ΒΒ1', pdfUrl: 'x', readStatus: 'ok', councilMeetingId: 'm2', dismissedAt: new Date(),
        } })

        await pollM1([readDecision({ ada: 'ΑΑΑ1-ΒΒ1', fromKnown: true })], ['ΑΑΑ1-ΒΒ1'])

        const candidate = await prisma.decisionCandidate.findUniqueOrThrow({ where: { cityId_ada: { cityId, ada: 'ΑΑΑ1-ΒΒ1' } } })
        expect(candidate.councilMeetingId).toBe('m1')
        expect(candidate.dismissedAt).toBeNull()
    })

    it('leaves a candidate that a decision already holds where it is', async () => {
        const decision = await prisma.decision.create({ data: { subjectId: 's2', ada: 'ΑΑΑ1-ΒΒ1', pdfUrl: 'x' } })
        await prisma.decisionCandidate.create({ data: {
            cityId, ada: 'ΑΑΑ1-ΒΒ1', pdfUrl: 'x', readStatus: 'ok', councilMeetingId: 'm2', decisionId: decision.id,
        } })

        await pollM1([readDecision({ ada: 'ΑΑΑ1-ΒΒ1', meetingDate: '2025-01-17' })], ['ΑΑΑ1-ΒΒ1'])

        const candidate = await prisma.decisionCandidate.findUniqueOrThrow({ where: { cityId_ada: { cityId, ada: 'ΑΑΑ1-ΒΒ1' } } })
        expect(candidate.councilMeetingId).toBe('m2')
    })

    it('keeps the typed number of a decision without an ΑΔΑ', async () => {
        await prisma.decision.create({ data: { subjectId: 's1', pdfUrl: 'https://files.example/a.pdf', decisionNumber: '12/2025' } })
        const task = await createTaskStatus('m1', cityId, { type: 'pollDecisions', requestBody: '{}' })

        await handlePollDecisionsResult(task.id, makePollDecisionsResult({
            extractions: {
                decisions: [makeExtractedDecision({ subjectId: 's1', excerpt: 'ΑΠΟΦΑΣΙΖΕΙ', decisionNumber: '13/2025' })],
                warnings: [],
            },
        }))

        const decision = await prisma.decision.findUniqueOrThrow({ where: { subjectId: 's1' } })
        expect(decision.decisionNumber).toBe('12/2025')
        expect(decision.excerpt).toBe('ΑΠΟΦΑΣΙΖΕΙ')
    })
})
