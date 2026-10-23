/** @jest-environment node */

// The agenda handler schedules the meeting's illustrations with after(), which needs
// the request scope these direct calls do not have.
jest.mock('next/server', () => ({ ...jest.requireActual('next/server'), after: () => {} }))
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn(), isUserAuthorizedToEdit: jest.fn().mockResolvedValue(true) }))

import prisma from '@/lib/db/prisma'
import { getSummarizeRequestBody, saveSubjectsForMeeting } from '@/lib/db/utils'
import { handleProcessAgendaResult } from '@/lib/tasks/processAgenda'
import { Subject } from '@/lib/apiTypes'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting, createTaskStatus } from '../helpers/factories'
import { makeProcessAgendaResult, makeSubject } from '../helpers/builders'

describe('getSummarizeRequestBody - subject descriptions', () => {
    const cityId = 'c1'
    const meetingId = 'm1'

    const agenda: Subject[] = [
        makeSubject({ name: 'Donation', agendaItemIndex: 1, description: 'Agenda text: a donation from school A.' }),
        makeSubject({ name: 'Roads', agendaItemIndex: 2, description: 'Agenda text: road works.' }),
    ]

    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma)
        await createCity({ id: cityId })
        const body = await createAdministrativeBody(cityId)
        await createMeeting(cityId, { id: meetingId, administrativeBodyId: body.id })
    })

    /** A processAgenda callback: the route stores the response, then the handler writes the subjects. */
    async function runProcessAgenda(subjects: Subject[], createdAt: Date) {
        const result = makeProcessAgendaResult(subjects)
        const task = await createTaskStatus(meetingId, cityId, {
            type: 'processAgenda',
            status: 'succeeded',
            responseBody: JSON.stringify(result),
            createdAt,
        })
        await handleProcessAgendaResult(task.id, result)
    }

    /** A summary that rewrites both descriptions, renames item 2 and adds an out-of-agenda subject. */
    async function runSummarize() {
        await saveSubjectsForMeeting([
            makeSubject({ name: 'Donation', agendaItemIndex: 1, description: 'Summary text: a donation from school B.' }),
            makeSubject({ name: 'Road works on Main Street', agendaItemIndex: 2, description: 'Summary text: road works.' }),
            makeSubject({ name: 'Urgent item', agendaItemIndex: 'OUT_OF_AGENDA', description: 'Summary text: an urgent item.' }),
        ], cityId, meetingId)
    }

    /** A re-run of summarize needs force once a summary exists, so the re-run tests pass it. */
    async function descriptionsSent({ force }: { force: boolean }) {
        const body = await getSummarizeRequestBody(meetingId, cityId, [], undefined, { force })
        return Object.fromEntries(body.existingSubjects.map(s => [s.name, s.description]))
    }

    test('a re-run sends the agenda text, not the previous summary', async () => {
        await runProcessAgenda(agenda, new Date('2026-10-01T10:00:00Z'))
        await runSummarize()

        expect(await descriptionsSent({ force: true })).toEqual({
            'Donation': 'Agenda text: a donation from school A.',
            // Renamed by the summary: matched to its agenda item by position.
            'Road works on Main Street': 'Agenda text: road works.',
        })
    })

    test('the latest processAgenda result is the one used', async () => {
        await runProcessAgenda([
            makeSubject({ name: 'Donation', agendaItemIndex: 1, description: 'Old agenda text.' }),
            makeSubject({ name: 'Roads', agendaItemIndex: 2, description: 'Old agenda text.' }),
        ], new Date('2026-09-01T10:00:00Z'))
        await runProcessAgenda(agenda, new Date('2026-10-01T10:00:00Z'))
        await runSummarize()

        expect(await descriptionsSent({ force: true })).toEqual({
            'Donation': 'Agenda text: a donation from school A.',
            'Road works on Main Street': 'Agenda text: road works.',
        })
    })

    test('a newer failed processAgenda is not read', async () => {
        await runProcessAgenda(agenda, new Date('2026-10-01T10:00:00Z'))
        // A failed row from before failureReason existed holds failure text, not a payload.
        await createTaskStatus(meetingId, cityId, {
            type: 'processAgenda',
            status: 'failed',
            responseBody: 'Agenda must be a PDF file',
            createdAt: new Date('2026-10-02T10:00:00Z'),
        })
        await runSummarize()

        expect(await descriptionsSent({ force: true })).toEqual({
            'Donation': 'Agenda text: a donation from school A.',
            'Road works on Main Street': 'Agenda text: road works.',
        })
    })

    test('without a processAgenda result, the stored text is sent', async () => {
        await saveSubjectsForMeeting(agenda, cityId, meetingId, undefined, { pruneUnmatched: true })
        await runSummarize()

        expect(await descriptionsSent({ force: true })).toEqual({
            'Donation': 'Summary text: a donation from school B.',
            'Road works on Main Street': 'Summary text: road works.',
        })
    })

    test('without force, the stored text is sent', async () => {
        await runProcessAgenda(agenda, new Date('2026-10-01T10:00:00Z'))
        await runSummarize()

        expect(await descriptionsSent({ force: false })).toEqual({
            'Donation': 'Summary text: a donation from school B.',
            'Road works on Main Street': 'Summary text: road works.',
            'Urgent item': 'Summary text: an urgent item.',
        })
    })
})
