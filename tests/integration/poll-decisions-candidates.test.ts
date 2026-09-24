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

    test('keeps a meeting whose name is null', async () => {
        await createCity({ id: 'c1', diavgeiaUid: 'DIAV-1' })
        const council = await createAdministrativeBody('c1', { type: 'council' })
        const administrativeBodyId = council.id

        // The SQL null trap: `NOT (name LIKE …)` is not true for a null name,
        // so a filter on the name would drop both derived-name meetings.
        await pollableMeeting('derived-unknown', { name: null, name_en: null, kind: null, administrativeBodyId })
        await pollableMeeting('derived-regular', { name: null, name_en: null, kind: 'regular', administrativeBodyId })
        await pollableMeeting('derived-logodosia', { name: null, name_en: null, kind: 'accountability', administrativeBodyId })

        const ids = (await findDecisionPollCandidates()).map((m) => m.id).sort()
        expect(ids).toEqual(['derived-regular', 'derived-unknown'])
    })
})
