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
import { requestPollDecisions } from '@/lib/tasks/pollDecisions'
import { startTask } from '@/lib/tasks/tasks'
import { resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting, createSubject, createTaskStatus } from '../helpers/factories'

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
