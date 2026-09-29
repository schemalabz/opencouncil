/** @jest-environment node */

// Mock modules with JSX templates that can't be parsed with jsx: "preserve"
jest.mock('@/lib/tasks/generateHighlight', () => ({
    handleGenerateHighlightResult: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
    withUserAuthorizedToEdit: jest.fn(),
    isUserAuthorizedToEdit: jest.fn().mockResolvedValue(true),
}))

// The handler hands follow-ups to after(); run them here and let each test
// await them before asserting.
const mockDeferred: Promise<unknown>[] = []
jest.mock('next/server', () => ({
    ...jest.requireActual('next/server'),
    after: (fn: () => unknown) => { mockDeferred.push(Promise.resolve().then(fn)) },
}))

// The follow-up poll's request goes out through startTask; everything before
// it runs against the database.
jest.mock('@/lib/tasks/tasks', () => ({
    ...jest.requireActual('@/lib/tasks/tasks'),
    startTask: jest.fn().mockResolvedValue(undefined),
}))

import prisma from '@/lib/db/prisma'
import { handlePollDecisionsResult } from '@/lib/tasks/pollDecisions'
import { startTask } from '@/lib/tasks/tasks'
import { resetDatabase } from '../helpers/test-db'
import {
    createAdministrativeBody,
    createCity,
    createMeeting,
    createSubject,
    createTaskStatus,
} from '../helpers/factories'
import { makePollDecisionsResult } from '../helpers/builders'
import type { PollDecisionsReadDecision } from '@/lib/apiTypes'

const mockStartTask = jest.mocked(startTask)

function makeReadDecision(overrides: Partial<PollDecisionsReadDecision> & { ada: string }): PollDecisionsReadDecision {
    return {
        title: `Decision ${overrides.ada}`,
        pdfUrl: `https://diavgeia.gov.gr/doc/${overrides.ada}`,
        protocolNumber: null,
        publishDate: '2025-01-16',
        meetingDate: null,
        decisionNumber: null,
        readStatus: 'ok',
        fromKnown: false,
        subjectId: null,
        confidence: null,
        reasoning: null,
        ...overrides,
    }
}

describe('handlePollDecisionsResult — polls the meetings it places new decisions on', () => {
    const cityId = 'c1'

    beforeEach(async () => {
        await resetDatabase(prisma)
        mockStartTask.mockClear()

        await createCity({ id: cityId, diavgeiaUid: '6104' })
        const body = await createAdministrativeBody(cityId, { notificationBehavior: 'NOTIFICATIONS_DISABLED' })
        // Athens-local dates 2025-01-10 (polled) and 2025-01-17 (neighbour)
        await createMeeting(cityId, { id: 'm1', administrativeBodyId: body.id, dateTime: new Date('2025-01-10T10:00:00Z') })
        await createMeeting(cityId, { id: 'm2', administrativeBodyId: body.id, dateTime: new Date('2025-01-17T10:00:00Z') })
        await createSubject('m2', cityId, { name: 'Undecided subject', agendaItemIndex: 1 })
    })

    async function pollM1(decision: PollDecisionsReadDecision) {
        const task = await createTaskStatus('m1', cityId, { type: 'pollDecisions' })
        await handlePollDecisionsResult(task.id, makePollDecisionsResult({ decisions: [decision] }))
        await Promise.all(mockDeferred.splice(0))
    }

    test('a freshly read decision declaring a neighbour starts a poll for it', async () => {
        await pollM1(makeReadDecision({ ada: 'ADA-N', meetingDate: '2025-01-17' }))

        expect(mockStartTask).toHaveBeenCalledTimes(1)
        expect(mockStartTask).toHaveBeenCalledWith('pollDecisions', expect.anything(), 'm2', cityId, { silent: true })
    })

    test('an echo of a known decision starts nothing', async () => {
        await pollM1(makeReadDecision({ ada: 'ADA-N', meetingDate: '2025-01-17' }))
        mockStartTask.mockClear()

        // The neighbour's own poll would echo it back; so would any later poll.
        await pollM1(makeReadDecision({ ada: 'ADA-N', meetingDate: '2025-01-17', fromKnown: true }))

        expect(mockStartTask).not.toHaveBeenCalled()
    })

    test('a decision declaring the polled meeting itself starts nothing', async () => {
        await pollM1(makeReadDecision({ ada: 'ADA-1', meetingDate: '2025-01-10' }))

        expect(mockStartTask).not.toHaveBeenCalled()
    })

    test('a neighbour with a poll already running is left to it', async () => {
        await createTaskStatus('m2', cityId, { type: 'pollDecisions', status: 'pending' })

        await pollM1(makeReadDecision({ ada: 'ADA-N', meetingDate: '2025-01-17' }))

        expect(mockStartTask).not.toHaveBeenCalled()
    })

    test('a neighbour with every subject decided is not polled', async () => {
        const subject = await prisma.subject.findFirstOrThrow({ where: { councilMeetingId: 'm2' } })
        await prisma.decision.create({ data: { subjectId: subject.id, pdfUrl: 'https://diavgeia.gov.gr/doc/X', ada: 'ADA-X' } })

        await pollM1(makeReadDecision({ ada: 'ADA-N', meetingDate: '2025-01-17' }))

        expect(mockStartTask).not.toHaveBeenCalled()
    })
})
