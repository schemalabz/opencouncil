/** @jest-environment node */

import prisma from '@/lib/db/prisma'
import { DataSource } from '@prisma/client'
import { assignCandidate, dismissCandidate, applyCandidateConflictResolution } from '@/lib/db/decisionCandidates'
import { deleteDecision } from '@/lib/db/decisions'
import { resetDatabase } from '../helpers/test-db'
import {
    createAdministrativeBody,
    createCity,
    createMeeting,
    createPerson,
    createSubject,
} from '../helpers/factories'

function makeCandidate(cityId: string, ada: string, data?: {
    councilMeetingId?: string | null
    subjectId?: string | null
    decisionId?: string | null
    dismissedAt?: Date | null
    decisionNumber?: string | null
}) {
    return prisma.decisionCandidate.create({
        data: {
            cityId,
            ada,
            pdfUrl: `https://diavgeia.gov.gr/doc/${ada}`,
            title: `Decision ${ada}`,
            readStatus: 'ok',
            meetingDate: new Date('2025-01-10T00:00:00Z'),
            decisionNumber: data?.decisionNumber ?? '12/2025',
            councilMeetingId: data?.councilMeetingId ?? null,
            subjectId: data?.subjectId ?? null,
            decisionId: data?.decisionId ?? null,
            dismissedAt: data?.dismissedAt ?? null,
        },
    })
}

describe('decision candidate actions — assign, dismiss, conflict resolution', () => {
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

    test('assignCandidate creates the decision from reading fields and links the candidate', async () => {
        const subject = await createSubject(meetingId, cityId, { id: 's1', agendaItemIndex: 1 })
        const candidate = await makeCandidate(cityId, 'ADA-1', { councilMeetingId: meetingId })

        await assignCandidate(cityId, meetingId, candidate.id, subject.id)

        const decision = await prisma.decision.findUnique({ where: { subjectId: subject.id } })
        expect(decision).not.toBeNull()
        expect(decision!.ada).toBe('ADA-1')
        expect(decision!.decisionNumber).toBe('12/2025')
        // No excerpt: the next poll must pick it up as needsExtraction
        expect(decision!.excerpt).toBeNull()

        const after = await prisma.decisionCandidate.findUnique({ where: { id: candidate.id } })
        expect(after!.decisionId).toBe(decision!.id)
        // The accepted placement is recorded when the pipeline had no suggestion
        expect(after!.subjectId).toBe(subject.id)
    })

    test('assignCandidate preserves an existing pipeline suggestion as made', async () => {
        const suggested = await createSubject(meetingId, cityId, { id: 's1', agendaItemIndex: 1 })
        const actual = await createSubject(meetingId, cityId, { id: 's2', agendaItemIndex: 2 })
        const candidate = await makeCandidate(cityId, 'ADA-1', {
            councilMeetingId: meetingId,
            subjectId: suggested.id,
        })

        await assignCandidate(cityId, meetingId, candidate.id, actual.id)

        const after = await prisma.decisionCandidate.findUnique({ where: { id: candidate.id } })
        expect(after!.subjectId).toBe(suggested.id)
        const decision = await prisma.decision.findUnique({ where: { subjectId: actual.id } })
        expect(decision).not.toBeNull()
    })

    test('assignCandidate rejects a candidate from another meeting', async () => {
        const subject = await createSubject(meetingId, cityId, { id: 's1', agendaItemIndex: 1 })
        const candidate = await makeCandidate(cityId, 'ADA-1', { councilMeetingId: otherMeetingId })

        await expect(assignCandidate(cityId, meetingId, candidate.id, subject.id))
            .rejects.toThrow('Candidate not found')
        expect(await prisma.decision.count()).toBe(0)
    })

    test('assignCandidate rejects when the subject already has a decision or the ADA is held', async () => {
        const taken = await createSubject(meetingId, cityId, { id: 's1', agendaItemIndex: 1 })
        const free = await createSubject(meetingId, cityId, { id: 's2', agendaItemIndex: 2 })
        await prisma.decision.create({
            data: { subjectId: taken.id, ada: 'ADA-HELD', pdfUrl: 'https://diavgeia.gov.gr/doc/ADA-HELD' },
        })

        const candidate = await makeCandidate(cityId, 'ADA-1', { councilMeetingId: meetingId })
        await expect(assignCandidate(cityId, meetingId, candidate.id, taken.id))
            .rejects.toThrow('already has a decision')

        const heldCandidate = await makeCandidate(cityId, 'ADA-HELD', { councilMeetingId: meetingId })
        await expect(assignCandidate(cityId, meetingId, heldCandidate.id, free.id))
            .rejects.toThrow('already linked to another subject')
    })

    test('dismissCandidate is race-safe: an assigned candidate cannot be dismissed', async () => {
        const subject = await createSubject(meetingId, cityId, { id: 's1', agendaItemIndex: 1 })
        const candidate = await makeCandidate(cityId, 'ADA-1', { councilMeetingId: meetingId })

        await assignCandidate(cityId, meetingId, candidate.id, subject.id)
        await expect(dismissCandidate(cityId, meetingId, candidate.id))
            .rejects.toThrow('already resolved')

        const after = await prisma.decisionCandidate.findUnique({ where: { id: candidate.id } })
        expect(after!.dismissedAt).toBeNull()
    })

    test('dismissCandidate rejects the wrong meeting and dismisses in the right one', async () => {
        const candidate = await makeCandidate(cityId, 'ADA-1', { councilMeetingId: meetingId })

        await expect(dismissCandidate(cityId, otherMeetingId, candidate.id))
            .rejects.toThrow('Candidate not found')

        await dismissCandidate(cityId, meetingId, candidate.id)
        const after = await prisma.decisionCandidate.findUnique({ where: { id: candidate.id } })
        expect(after!.dismissedAt).not.toBeNull()
    })

    test('conflict reassign moves the decision and drops the old subject\'s extracted rows', async () => {
        const oldSubject = await createSubject(meetingId, cityId, { id: 's1', agendaItemIndex: 1 })
        const claiming = await createSubject(meetingId, cityId, { id: 's2', agendaItemIndex: 2 })
        const person = await createPerson(cityId)

        const holding = await prisma.decision.create({
            data: {
                subjectId: oldSubject.id,
                ada: 'ADA-1',
                pdfUrl: 'https://diavgeia.gov.gr/doc/ADA-1',
                excerpt: 'extracted text',
            },
        })
        // Extraction wrote rows against the old subject; a manual row must survive
        await prisma.subjectAttendance.create({
            data: { subjectId: oldSubject.id, personId: person.id, status: 'PRESENT', source: DataSource.decision },
        })
        await prisma.subjectVote.create({
            data: { subjectId: oldSubject.id, personId: person.id, voteType: 'FOR', source: DataSource.decision },
        })
        await prisma.subjectVote.create({
            data: { subjectId: oldSubject.id, personId: person.id, voteType: 'AGAINST', source: DataSource.manual },
        })

        const candidate = await makeCandidate(cityId, 'ADA-1', {
            councilMeetingId: meetingId,
            subjectId: claiming.id,
        })

        await applyCandidateConflictResolution(candidate.id, 'reassign')

        // Decision moved; recreated without excerpt so the next poll re-extracts
        expect(await prisma.decision.findUnique({ where: { id: holding.id } })).toBeNull()
        const moved = await prisma.decision.findUnique({ where: { subjectId: claiming.id } })
        expect(moved!.ada).toBe('ADA-1')
        expect(moved!.excerpt).toBeNull()

        // The old subject keeps no decision-sourced rows, only the manual one
        expect(await prisma.subjectAttendance.count({ where: { subjectId: oldSubject.id } })).toBe(0)
        const votes = await prisma.subjectVote.findMany({ where: { subjectId: oldSubject.id } })
        expect(votes).toHaveLength(1)
        expect(votes[0].source).toBe(DataSource.manual)

        const after = await prisma.decisionCandidate.findUnique({ where: { id: candidate.id } })
        expect(after!.decisionId).toBe(moved!.id)
    })

    test('deleting an assigned decision reverts the candidate to the unresolved pool', async () => {
        const subject = await createSubject(meetingId, cityId, { id: 's1', agendaItemIndex: 1 })
        const candidate = await makeCandidate(cityId, 'ADA-1', { councilMeetingId: meetingId })
        await assignCandidate(cityId, meetingId, candidate.id, subject.id)

        await deleteDecision(subject.id)

        const after = await prisma.decisionCandidate.findUnique({ where: { id: candidate.id } })
        expect(after!.decisionId).toBeNull()
        expect(after!.dismissedAt).toBeNull()
        expect(await prisma.subjectVote.count({ where: { subjectId: subject.id } })).toBe(0)
    })
})
