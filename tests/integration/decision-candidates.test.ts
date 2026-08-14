/** @jest-environment node */

// Mock modules with JSX templates that can't be parsed with jsx: "preserve"
jest.mock('@/lib/tasks/generateHighlight', () => ({
    handleGenerateHighlightResult: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
    withUserAuthorizedToEdit: jest.fn(),
    isUserAuthorizedToEdit: jest.fn().mockResolvedValue(true),
}))

import prisma from '@/lib/db/prisma'
import { handlePollDecisionsResult } from '@/lib/tasks/pollDecisions'
import { resetDatabase } from '../helpers/test-db'
import {
    createAdministrativeBody,
    createCity,
    createMeeting,
    createSubject,
    createTaskStatus,
} from '../helpers/factories'
import { makePollDecisionsMatch, makePollDecisionsResult } from '../helpers/builders'
import type { PollDecisionsReadDecision } from '@/lib/apiTypes'

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

describe('handlePollDecisionsResult — decisions list (DecisionCandidate ingestion)', () => {
    let cityId: string
    let meetingId: string
    let otherMeetingId: string

    beforeEach(async () => {
        await resetDatabase(prisma as any)

        const city = await createCity({ id: 'c1' })
        cityId = city.id
        const body = await createAdministrativeBody(cityId, {
            notificationBehavior: 'NOTIFICATIONS_DISABLED',
        })
        // Meeting dates are Athens-local midnights: 2025-01-10 and 2025-01-17
        const meeting = await createMeeting(cityId, {
            id: 'm1',
            administrativeBodyId: body.id,
            dateTime: new Date('2025-01-10T10:00:00Z'),
        })
        const other = await createMeeting(cityId, {
            id: 'm2',
            administrativeBodyId: body.id,
            dateTime: new Date('2025-01-17T10:00:00Z'),
        })
        meetingId = meeting.id
        otherMeetingId = other.id
    })

    test('every read decision becomes a candidate; matched ones are promoted with decisionId', async () => {
        const subjectA = await createSubject(meetingId, cityId, { name: 'Subject A', agendaItemIndex: 1 })
        const task = await createTaskStatus(meetingId, cityId, { type: 'pollDecisions' })

        await handlePollDecisionsResult(task.id, makePollDecisionsResult({
            matches: [makePollDecisionsMatch({ subjectId: subjectA.id, ada: 'ADA-1' })],
            decisions: [
                makeReadDecision({
                    ada: 'ADA-1',
                    meetingDate: '2025-01-10',
                    decisionNumber: '42/2025',
                    subjectId: subjectA.id,
                    confidence: 0.9,
                    reasoning: 'Title matches',
                }),
                makeReadDecision({ ada: 'ADA-2', meetingDate: '2025-01-10' }),
            ],
        }))

        // Matched decision promoted: candidate linked via decisionId, reading copied onto the Decision
        const decision = await prisma.decision.findUnique({ where: { subjectId: subjectA.id } })
        expect(decision).not.toBeNull()
        expect(decision!.decisionNumber).toBe('42/2025')
        expect(decision!.meetingDate?.toISOString()).toBe('2025-01-10T00:00:00.000Z')

        const promoted = await prisma.decisionCandidate.findUnique({ where: { cityId_ada: { cityId, ada: 'ADA-1' } } })
        expect(promoted!.decisionId).toBe(decision!.id)
        expect(promoted!.subjectId).toBe(subjectA.id)
        expect(promoted!.confidence).toBe(0.9)
        expect(promoted!.reasoning).toBe('Title matches')
        expect(promoted!.councilMeetingId).toBe(meetingId)

        // Unmatched decision persists as an unresolved candidate for the meeting
        const unplaced = await prisma.decisionCandidate.findUnique({ where: { cityId_ada: { cityId, ada: 'ADA-2' } } })
        expect(unplaced!.decisionId).toBeNull()
        expect(unplaced!.subjectId).toBeNull()
        expect(unplaced!.councilMeetingId).toBe(meetingId)
    })

    test('a decision declaring a neighbouring meeting resolves to that meeting', async () => {
        const task = await createTaskStatus(meetingId, cityId, { type: 'pollDecisions' })

        await handlePollDecisionsResult(task.id, makePollDecisionsResult({
            decisions: [makeReadDecision({ ada: 'ADA-N', meetingDate: '2025-01-17' })],
        }))

        const candidate = await prisma.decisionCandidate.findUnique({ where: { cityId_ada: { cityId, ada: 'ADA-N' } } })
        expect(candidate!.councilMeetingId).toBe(otherMeetingId)
    })

    test('a decision declaring an unknown session keeps councilMeetingId null', async () => {
        const task = await createTaskStatus(meetingId, cityId, { type: 'pollDecisions' })

        await handlePollDecisionsResult(task.id, makePollDecisionsResult({
            decisions: [makeReadDecision({ ada: 'ADA-U', meetingDate: '2024-06-01' })],
        }))

        const candidate = await prisma.decisionCandidate.findUnique({ where: { cityId_ada: { cityId, ada: 'ADA-U' } } })
        expect(candidate).not.toBeNull()
        expect(candidate!.councilMeetingId).toBeNull()
    })

    test('a knownDecisions echo never blanks a stored reading', async () => {
        // First poll reads the document
        const task1 = await createTaskStatus(meetingId, cityId, { type: 'pollDecisions' })
        await handlePollDecisionsResult(task1.id, makePollDecisionsResult({
            decisions: [makeReadDecision({ ada: 'ADA-E', meetingDate: '2025-01-10', decisionNumber: '7/2025' })],
        }))

        // Second poll echoes it from knownDecisions: reading fields carry no new information
        const task2 = await createTaskStatus(meetingId, cityId, { type: 'pollDecisions' })
        await handlePollDecisionsResult(task2.id, makePollDecisionsResult({
            decisions: [makeReadDecision({
                ada: 'ADA-E',
                meetingDate: '2025-01-10',
                decisionNumber: null,   // the echo does not carry the number
                fromKnown: true,
            })],
        }))

        const candidate = await prisma.decisionCandidate.findUnique({ where: { cityId_ada: { cityId, ada: 'ADA-E' } } })
        expect(candidate!.decisionNumber).toBe('7/2025')
    })

    test('an unaccepted suggestion refreshes; a promoted one is preserved as made', async () => {
        const subjectA = await createSubject(meetingId, cityId, { name: 'Subject A', agendaItemIndex: 1 })
        const subjectB = await createSubject(meetingId, cityId, { name: 'Subject B', agendaItemIndex: 2 })

        // Poll 1 suggests subjectA; poll 2 changes its mind to subjectB —
        // nothing was accepted yet, so the latest pipeline opinion wins.
        const task1 = await createTaskStatus(meetingId, cityId, { type: 'pollDecisions' })
        await handlePollDecisionsResult(task1.id, makePollDecisionsResult({
            decisions: [makeReadDecision({ ada: 'ADA-S', meetingDate: '2025-01-10', subjectId: subjectA.id, confidence: 0.7, reasoning: 'first' })],
        }))
        const task2 = await createTaskStatus(meetingId, cityId, { type: 'pollDecisions' })
        await handlePollDecisionsResult(task2.id, makePollDecisionsResult({
            decisions: [makeReadDecision({ ada: 'ADA-S', meetingDate: '2025-01-10', decisionNumber: '9/2025', subjectId: subjectB.id, confidence: 0.9, reasoning: 'second' })],
        }))

        let candidate = await prisma.decisionCandidate.findUnique({ where: { cityId_ada: { cityId, ada: 'ADA-S' } } })
        expect(candidate!.decisionNumber).toBe('9/2025')
        expect(candidate!.subjectId).toBe(subjectB.id)
        expect(candidate!.reasoning).toBe('second')

        // Poll 3 promotes the match to subjectB. From now on the suggestion is
        // the record of what was accepted — poll 4's different opinion is ignored.
        const task3 = await createTaskStatus(meetingId, cityId, { type: 'pollDecisions' })
        await handlePollDecisionsResult(task3.id, makePollDecisionsResult({
            matches: [makePollDecisionsMatch({ subjectId: subjectB.id, ada: 'ADA-S' })],
            decisions: [makeReadDecision({ ada: 'ADA-S', meetingDate: '2025-01-10', subjectId: subjectB.id, confidence: 0.9, reasoning: 'second' })],
        }))
        const task4 = await createTaskStatus(meetingId, cityId, { type: 'pollDecisions' })
        await handlePollDecisionsResult(task4.id, makePollDecisionsResult({
            decisions: [makeReadDecision({ ada: 'ADA-S', meetingDate: '2025-01-10', subjectId: subjectA.id, confidence: 0.5, reasoning: 'revisionist' })],
        }))

        candidate = await prisma.decisionCandidate.findUnique({ where: { cityId_ada: { cityId, ada: 'ADA-S' } } })
        expect(candidate!.decisionId).not.toBeNull()
        expect(candidate!.subjectId).toBe(subjectB.id)
        expect(candidate!.confidence).toBe(0.9)
        expect(candidate!.reasoning).toBe('second')
    })

    test('retried callback is idempotent', async () => {
        const subjectA = await createSubject(meetingId, cityId, { name: 'Subject A', agendaItemIndex: 1 })
        const task = await createTaskStatus(meetingId, cityId, { type: 'pollDecisions' })
        const result = makePollDecisionsResult({
            matches: [makePollDecisionsMatch({ subjectId: subjectA.id, ada: 'ADA-R' })],
            decisions: [makeReadDecision({ ada: 'ADA-R', meetingDate: '2025-01-10', subjectId: subjectA.id, confidence: 0.9 })],
        })

        await handlePollDecisionsResult(task.id, result)
        await handlePollDecisionsResult(task.id, result)

        expect(await prisma.decisionCandidate.count()).toBe(1)
        expect(await prisma.decision.count()).toBe(1)
    })
})
