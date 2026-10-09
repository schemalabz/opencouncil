/** @jest-environment node */

// Mock modules with JSX templates that can't be parsed with jsx: "preserve"
jest.mock('@/lib/tasks/generateHighlight', () => ({
    handleGenerateHighlightResult: jest.fn(),
}))

import prisma from '@/lib/db/prisma'
import { findDecisionPollCandidates } from '@/lib/tasks/pollDecisions'
import { getPollableMeetingDateRange } from '@/lib/tasks/pollDecisionsBackoff'
import { resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting, createSubject } from '../helpers/factories'

describe('findDecisionPollCandidates', () => {
    beforeEach(async () => {
        await resetDatabase(prisma)
    })

    /** A meeting inside the pollable window, with one undecided agenda item. */
    async function pollableMeeting(id: string, data: Parameters<typeof createMeeting>[1]) {
        const { gte, lte } = getPollableMeetingDateRange()
        const dateTime = new Date((gte.getTime() + lte.getTime()) / 2)
        const meeting = await createMeeting('c1', { id, dateTime, ...data })
        await createSubject(meeting.id, 'c1', { agendaItemIndex: 1 })
        return meeting
    }

    test('skips λογοδοσία by the kind, not by the name', async () => {
        await createCity({ id: 'c1', diavgeiaUid: 'DIAV-1' })
        const council = await createAdministrativeBody('c1', { type: 'council' })
        const administrativeBodyId = council.id

        await pollableMeeting('unknown', { name: 'Δημοτικό Συμβούλιο 12/03/2026', kind: null, administrativeBodyId })
        await pollableMeeting('regular', { name: 'Δημοτικό Συμβούλιο 12/03/2026', kind: 'regular', administrativeBodyId })
        // A record of two meetings keeps a null kind and is polled for its regular part.
        await pollableMeeting('combined', { name: 'Λογοδοσία και Δημοτικό Συμβούλιο 04/02/26', kind: null, administrativeBodyId })
        await pollableMeeting('logodosia', { name: 'Δημοτικό Συμβούλιο 25/06/2026', kind: 'accountability', administrativeBodyId })

        const ids = (await findDecisionPollCandidates()).map((m) => m.id).sort()
        expect(ids).toEqual(['combined', 'regular', 'unknown'])
    })

    test('skips every meeting that takes no decisions, and its later parts', async () => {
        await createCity({ id: 'c1', diavgeiaUid: 'DIAV-1' })
        const council = await createAdministrativeBody('c1', { type: 'council' })
        const administrativeBodyId = council.id
        const { gte } = getPollableMeetingDateRange()
        const day = 24 * 60 * 60 * 1000

        await pollableMeeting('apologismos', { kind: 'activityReport', administrativeBodyId })
        await pollableMeeting('budget', { kind: 'budget', administrativeBodyId })
        const first = await createMeeting('c1', { id: 'logodosia-1', dateTime: new Date(gte.getTime() + day), kind: 'accountability', administrativeBodyId })
        const part = await createMeeting('c1', { id: 'logodosia-2', dateTime: new Date(gte.getTime() + 2 * day), kind: null, continuationOfId: first.id, administrativeBodyId })
        await createSubject(part.id, 'c1', { agendaItemIndex: 1 })
        const regular = await createMeeting('c1', { id: 'regular-1', dateTime: new Date(gte.getTime() + day), kind: 'regular', administrativeBodyId })
        const regularPart = await createMeeting('c1', { id: 'regular-2', dateTime: new Date(gte.getTime() + 2 * day), kind: null, continuationOfId: regular.id, administrativeBodyId })
        await createSubject(regularPart.id, 'c1', { agendaItemIndex: 1 })

        const ids = (await findDecisionPollCandidates()).map((m) => m.id).sort()
        expect(ids).toEqual(['budget', 'regular-2'])
    })
})
