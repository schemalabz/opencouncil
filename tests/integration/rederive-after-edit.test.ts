/** @jest-environment node */
jest.mock('@/lib/tasks/generateHighlight', () => ({ handleGenerateHighlightResult: jest.fn() }))
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn(), isUserAuthorizedToEdit: jest.fn().mockResolvedValue(true) }))
jest.mock('next/server', () => ({ ...jest.requireActual('next/server'), after: () => {} }))

import prisma from '@/lib/db/prisma'
import { handlePollDecisionsResult } from '@/lib/tasks/pollDecisions'
import { clearExtractedDataForMeeting, deleteDecision, resetExtractionForSubject, upsertDecision } from '@/lib/db/decisions'
import { applyCandidateConflictResolution } from '@/lib/db/decisionCandidates'
import { resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting, createPerson, createSubject, createTaskStatus } from '../helpers/factories'
import { makeExtractedDecision, makePollDecisionsResult } from '../helpers/builders'

/**
 * Every edit of a reading re-derives its meeting (spec §5.2). The observable:
 * `clearDecisionDerivedFacts` deletes the edited subject's rows, and only a
 * re-derive writes them again.
 */
describe('an edit of a reading re-derives the meeting', () => {
    let cityId: string
    let meetingId: string
    let s: Array<{ id: string }>

    beforeEach(async () => {
        await resetDatabase(prisma)
        cityId = (await createCity({ id: 'c1' })).id
        const body = await createAdministrativeBody(cityId, { notificationBehavior: 'NOTIFICATIONS_DISABLED' })
        meetingId = (await createMeeting(cityId, { id: 'm1', administrativeBodyId: body.id })).id
        const a = await createPerson(cityId, { name: 'Άννα Αλεξίου' })
        s = []
        for (const i of [1, 2, 3]) {
            const subject = await createSubject(meetingId, cityId, { id: `s${i}`, name: `Θέμα ${i}`, agendaItemIndex: i })
            await prisma.decision.create({ data: { subjectId: subject.id, pdfUrl: `https://example.com/${i}.pdf`, ada: `ADA-${i}` } })
            s.push(subject)
        }
        const task = await createTaskStatus(meetingId, cityId, { type: 'pollDecisions', version: 4 })
        await handlePollDecisionsResult(task.id, makePollDecisionsResult({ extractions: {
            decisions: [1, 2].map(i => makeExtractedDecision({ subjectId: s[i - 1].id, rollCallPresent: [a.id] })), warnings: [],
        } }))
    })
    const rowsOf = (subjectId: string) => prisma.subjectAttendance.count({ where: { subjectId, source: 'decision' } })

    test('resetExtractionForSubject', async () => {
        await resetExtractionForSubject(s[1].id)
        expect(await rowsOf(s[1].id)).toBe(1)
    })
    test('deleteDecision', async () => {
        await deleteDecision(s[1].id)
        expect(await rowsOf(s[1].id)).toBe(1)
    })
    test('upsertDecision that replaces the document', async () => {
        await upsertDecision({ subjectId: s[1].id, pdfUrl: 'https://example.com/other.pdf', ada: 'ADA-9' })
        expect(await rowsOf(s[1].id)).toBe(1)
    })
    test('clearExtractedDataForMeeting leaves the tables empty, because the derivation refuses', async () => {
        await clearExtractedDataForMeeting(cityId, meetingId)
        expect(await prisma.subjectAttendance.count({ where: { source: 'decision' } })).toBe(0)
        expect(await prisma.meetingAttendance.count({ where: { source: 'decision' } })).toBe(0)
    })
    test('applyCandidateConflictResolution that moves a document', async () => {
        const candidate = await prisma.decisionCandidate.create({ data: {
            cityId, ada: 'ADA-2', pdfUrl: 'https://diavgeia.gov.gr/doc/ADA-2', title: 'Decision ADA-2', readStatus: 'ok',
            meetingDate: new Date('2025-01-10T00:00:00Z'), decisionNumber: '12/2025', councilMeetingId: meetingId, subjectId: s[2].id,
        } })
        await prisma.decision.delete({ where: { subjectId: s[2].id } })
        expect(await applyCandidateConflictResolution(candidate.id, 'reassign')).toBe('reassigned')
        expect(await rowsOf(s[1].id)).toBe(1)
    })

    test('applyCandidateConflictResolution that moves a document to another meeting rederives both meetings', async () => {
        // A second meeting, with its own reading, derived independently of m1's.
        const bodyB = await createAdministrativeBody(cityId, { notificationBehavior: 'NOTIFICATIONS_DISABLED' })
        const meetingB = await createMeeting(cityId, { id: 'm2', administrativeBodyId: bodyB.id })
        const b = await createPerson(cityId, { name: 'Βασίλης Βασιλείου' })
        const sB0 = await createSubject(meetingB.id, cityId, { id: 'sB0', name: 'Θέμα Β0', agendaItemIndex: 1 })
        await prisma.decision.create({ data: { subjectId: sB0.id, pdfUrl: 'https://example.com/b0.pdf', ada: 'ADA-B0' } })
        const taskB = await createTaskStatus(meetingB.id, cityId, { type: 'pollDecisions', version: 4 })
        await handlePollDecisionsResult(taskB.id, makePollDecisionsResult({ extractions: {
            decisions: [makeExtractedDecision({ subjectId: sB0.id, rollCallPresent: [b.id] })], warnings: [],
        } }))

        // sB1 is created only after meeting B's own derivation already ran without
        // it, so it starts with no attendance rows of its own.
        const sB1 = await createSubject(meetingB.id, cityId, { id: 'sB1', name: 'Θέμα Β1', agendaItemIndex: 2 })
        expect(await rowsOf(sB1.id)).toBe(0)

        // ADA-2 is held by s[1] (meeting m1); the candidate claims it for sB1 (meeting m2).
        const candidate = await prisma.decisionCandidate.create({ data: {
            cityId, ada: 'ADA-2', pdfUrl: 'https://diavgeia.gov.gr/doc/ADA-2', title: 'Decision ADA-2', readStatus: 'ok',
            meetingDate: new Date('2025-01-10T00:00:00Z'), decisionNumber: '12/2025', councilMeetingId: meetingB.id, subjectId: sB1.id,
        } })
        expect(await applyCandidateConflictResolution(candidate.id, 'reassign')).toBe('reassigned')

        // m1 lost the document that backed s[1]'s rows; only a re-derive of m1 restores them.
        expect(await rowsOf(s[1].id)).toBe(1)
        // m2 gained a subject it had never derived before; only a re-derive of m2 gives it rows.
        expect(await rowsOf(sB1.id)).toBeGreaterThan(0)
    })

    test('applyCandidateConflictResolution when the previous holder vanished concurrently', async () => {
        // s4 is created after the meeting's own derivation already ran, so it
        // starts with no attendance rows of its own.
        const s4 = await createSubject(meetingId, cityId, { id: 's4', name: 'Θέμα 4', agendaItemIndex: 4 })
        expect(await rowsOf(s4.id)).toBe(0)

        // No Decision holds ADA-9: the resolution takes the `else` branch of the
        // holding check (a plain create, not a move away from another subject).
        const candidate = await prisma.decisionCandidate.create({ data: {
            cityId, ada: 'ADA-9', pdfUrl: 'https://diavgeia.gov.gr/doc/ADA-9', title: 'Decision ADA-9', readStatus: 'ok',
            meetingDate: new Date('2025-01-10T00:00:00Z'), decisionNumber: '9/2025', councilMeetingId: meetingId, subjectId: s4.id,
        } })
        expect(await applyCandidateConflictResolution(candidate.id, 'reassign')).toBe('reassigned')
        expect(await rowsOf(s4.id)).toBeGreaterThan(0)
    })
})
