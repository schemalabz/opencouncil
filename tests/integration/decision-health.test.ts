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
import { getDecisionHealth, cityState } from '@/lib/db/decisionHealth'
import { applyCandidateConflictResolution, getConflictingCandidates } from '@/lib/db/decisionCandidates'
import { resetDatabase } from '../helpers/test-db'
import {
    createAdministrativeBody,
    createCity,
    createMeeting,
    createSubject,
    createTaskStatus,
} from '../helpers/factories'

describe('getDecisionHealth', () => {
    beforeEach(async () => {
        await resetDatabase(prisma)
    })

    test('aggregates coverage, triage queues, unplaceable orphans and taxonomy for one city', async () => {
        const city = await createCity({ id: 'c1', diavgeiaUid: 'DIAV-1' })
        const body = await createAdministrativeBody(city.id, {
            notificationBehavior: 'NOTIFICATIONS_DISABLED',
        })
        const meeting = await createMeeting(city.id, {
            id: 'm1', administrativeBodyId: body.id, dateTime: new Date('2025-01-10T10:00:00Z'),
        })

        // Two eligible subjects; one linked.
        const linked = await createSubject(meeting.id, city.id, { name: 'Linked', agendaItemIndex: 1 })
        await createSubject(meeting.id, city.id, { name: 'Unlinked', agendaItemIndex: 2 })
        await prisma.decision.create({
            data: { subjectId: linked.id, ada: 'ADA-L', pdfUrl: 'https://example.com/l.pdf' },
        })

        // The meeting was polled successfully.
        await createTaskStatus(meeting.id, city.id, { type: 'pollDecisions', status: 'succeeded' })

        // One read, unassigned candidate filed to the meeting (unplaced triage work,
        // and the reason the unlinked subject classifies as candidatesUnmatched).
        await prisma.decisionCandidate.create({
            data: {
                cityId: city.id, ada: 'ADA-U', pdfUrl: 'https://example.com/u.pdf',
                readStatus: 'ok', councilMeetingId: meeting.id,
                meetingDate: new Date('2025-01-10T00:00:00Z'),
            },
        })

        // One read orphan declaring a session far from any meeting we hold.
        await prisma.decisionCandidate.create({
            data: {
                cityId: city.id, ada: 'ADA-O', pdfUrl: 'https://example.com/o.pdf',
                readStatus: 'ok', meetingDate: new Date('2024-06-01T00:00:00Z'),
            },
        })

        const rows = await getDecisionHealth('c1')
        expect(rows).toHaveLength(1)
        const c = rows[0]
        expect(c.inScope).toBe(true)
        expect(c.meetings).toBe(1)
        expect(c.polledMeetings).toBe(1)
        expect(c.eligibleSubjects).toBe(2)
        expect(c.linkedSubjects).toBe(1)
        expect(c.failedMeetings).toBe(0)
        expect(c.unplacedCandidates).toBe(1)
        expect(c.unplacedUnread).toBe(0)
        expect(c.unplaceable).toEqual({ sameDayOtherBody: 0, nearbySessionMissing: 0, sessionUnknown: 1, total: 1 })
        expect(c.unmatchedTaxonomy).toEqual({ notProcessed: 0, candidatesUnmatched: 1, nothingFetched: 0, duplicateSubject: 0 })
        // The decision has no excerpt: no content link.
        expect(c.contentLinks).toBe(0)
        expect(cityState(c)).toBe('needsTriage')
    })

    test('a city without a diavgeiaUid reports out of scope, and a failed latest poll blocks', async () => {
        const city = await createCity({ id: 'c2' })
        const body = await createAdministrativeBody(city.id, {
            notificationBehavior: 'NOTIFICATIONS_DISABLED',
        })
        const meeting = await createMeeting(city.id, {
            id: 'm1', administrativeBodyId: body.id, dateTime: new Date('2025-01-10T10:00:00Z'),
        })
        await createSubject(meeting.id, city.id, { name: 'S', agendaItemIndex: 1 })
        // An old success superseded by a failure: the meeting counts as failed.
        await createTaskStatus(meeting.id, city.id, {
            type: 'pollDecisions', status: 'succeeded', createdAt: new Date('2025-01-11T00:00:00Z'),
        })
        await createTaskStatus(meeting.id, city.id, {
            type: 'pollDecisions', status: 'failed', createdAt: new Date('2025-01-12T00:00:00Z'),
        })

        const rows = await getDecisionHealth('c2')
        expect(rows).toHaveLength(1)
        expect(rows[0].inScope).toBe(false)
        expect(rows[0].failedMeetings).toBe(1)
        expect(cityState(rows[0])).toBe('outOfScope')
    })
})

describe('coverage window', () => {
    beforeEach(async () => {
        await resetDatabase(prisma)
    })

    test('a future meeting with an imported agenda never counts', async () => {
        const city = await createCity({ id: 'c1', diavgeiaUid: 'DIAV-1' })
        const body = await createAdministrativeBody(city.id, {
            notificationBehavior: 'NOTIFICATIONS_DISABLED',
        })
        const past = await createMeeting(city.id, {
            id: 'm-past', administrativeBodyId: body.id, dateTime: new Date('2025-01-10T10:00:00Z'),
        })
        await createSubject(past.id, city.id, { name: 'P', agendaItemIndex: 1 })
        // Agenda imported ahead of a session that has not happened yet.
        const future = await createMeeting(city.id, {
            id: 'm-future', administrativeBodyId: body.id,
            dateTime: new Date(Date.now() + 7 * 86400_000),
        })
        await createSubject(future.id, city.id, { name: 'F', agendaItemIndex: 1 })

        const rows = await getDecisionHealth('c1')
        expect(rows[0].meetings).toBe(1)
        expect(rows[0].eligibleSubjects).toBe(1)
    })
})

describe('queue visibility', () => {
    beforeEach(async () => {
        await resetDatabase(prisma)
    })

    test('a city with pending work stays visible when the window holds none of its meetings', async () => {
        const city = await createCity({ id: 'c1', diavgeiaUid: 'DIAV-1' })
        const body = await createAdministrativeBody(city.id, {
            notificationBehavior: 'NOTIFICATIONS_DISABLED',
        })
        // The only meeting is far outside a 30-day window.
        const old = await createMeeting(city.id, {
            id: 'm-old', administrativeBodyId: body.id, dateTime: new Date('2024-01-10T10:00:00Z'),
        })
        await createSubject(old.id, city.id, { name: 'S', agendaItemIndex: 1 })
        await prisma.decisionCandidate.create({
            data: {
                cityId: city.id, ada: 'ADA-Q', pdfUrl: 'https://example.com/q.pdf',
                readStatus: 'ok', councilMeetingId: old.id,
                meetingDate: new Date('2024-01-10T00:00:00Z'),
            },
        })

        const rows = await getDecisionHealth('c1', 30)
        expect(rows).toHaveLength(1)
        expect(rows[0].eligibleSubjects).toBe(0)
        expect(rows[0].unplacedCandidates).toBe(1)
        expect(cityState(rows[0])).toBe('needsTriage')
    })
})

describe('conflict detection', () => {
    beforeEach(async () => {
        await resetDatabase(prisma)
    })

    // The health rollup counts the list getConflictingCandidates returns, so
    // the pin is on the detection semantics: a suggested claim against a held
    // ADA is a conflict, and a backing row that disagrees with its own
    // decision is a counter-proposal — not every suggestion is a conflict.
    test('finds the plain conflict and the counter-proposal, and the rollup surfaces both', async () => {
        const city = await createCity({ id: 'c1', diavgeiaUid: 'DIAV-1' })
        const body = await createAdministrativeBody(city.id, {
            notificationBehavior: 'NOTIFICATIONS_DISABLED',
        })
        const meeting = await createMeeting(city.id, {
            id: 'm1', administrativeBodyId: body.id, dateTime: new Date('2025-01-10T10:00:00Z'),
        })
        const a = await createSubject(meeting.id, city.id, { name: 'A', agendaItemIndex: 1 })
        const b = await createSubject(meeting.id, city.id, { name: 'B', agendaItemIndex: 2 })
        const c = await createSubject(meeting.id, city.id, { name: 'C', agendaItemIndex: 3 })
        const d = await createSubject(meeting.id, city.id, { name: 'D', agendaItemIndex: 4 })

        // Counter-proposal: A holds ADA-X, its backing row claims B.
        const held = await prisma.decision.create({
            data: { subjectId: a.id, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf' },
        })
        await prisma.decisionCandidate.create({
            data: {
                cityId: city.id, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf',
                readStatus: 'unread', councilMeetingId: meeting.id, decisionId: held.id,
                subjectId: b.id, confidence: 0.8,
            },
        })
        // Plain conflict: D holds ADA-Y; an unassigned candidate claims C.
        await prisma.decision.create({
            data: { subjectId: d.id, ada: 'ADA-Y', pdfUrl: 'https://example.com/y.pdf' },
        })
        await prisma.decisionCandidate.create({
            data: {
                cityId: city.id, ada: 'ADA-Y', pdfUrl: 'https://example.com/y.pdf',
                readStatus: 'ok', councilMeetingId: meeting.id, subjectId: c.id, confidence: 0.7,
            },
        })

        const fetched = await getConflictingCandidates({ cityId: 'c1' })
        expect(fetched).toHaveLength(2)
        const byAda = new Map(fetched.map(f => [f.ada, f]))
        // The counter-proposal: A's backing row claims B, away from its own decision.
        expect(byAda.get('ADA-X')!.claimingSubject.id).toBe(b.id)
        expect(byAda.get('ADA-X')!.existingDecision!.currentSubject.id).toBe(a.id)
        // The plain conflict: an unassigned candidate claims C against D's decision.
        expect(byAda.get('ADA-Y')!.claimingSubject.id).toBe(c.id)
        expect(byAda.get('ADA-Y')!.existingDecision!.currentSubject.id).toBe(d.id)

        const rows = await getDecisionHealth('c1')
        expect(rows[0].conflicts).toBe(2)
    })
})

describe('applyCandidateConflictResolution outcomes', () => {
    let cityId: string
    let meetingId: string

    beforeEach(async () => {
        await resetDatabase(prisma)
        const city = await createCity({ id: 'c1' })
        cityId = city.id
        const body = await createAdministrativeBody(cityId, {
            notificationBehavior: 'NOTIFICATIONS_DISABLED',
        })
        meetingId = (await createMeeting(cityId, {
            id: 'm1', administrativeBodyId: body.id, dateTime: new Date('2025-01-10T10:00:00Z'),
        })).id
    })

    test('reassign of a counter-proposal downgrades to a restore when the claimant already holds a decision', async () => {
        const subjectA = await createSubject(meetingId, cityId, { name: 'A', agendaItemIndex: 1 })
        const subjectB = await createSubject(meetingId, cityId, { name: 'B', agendaItemIndex: 2 })
        const held = await prisma.decision.create({
            data: { subjectId: subjectA.id, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf' },
        })
        // The claimant already has its own decision — a move would collide.
        await prisma.decision.create({
            data: { subjectId: subjectB.id, ada: 'ADA-Y', pdfUrl: 'https://example.com/y.pdf' },
        })
        const row = await prisma.decisionCandidate.create({
            data: {
                cityId, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf',
                readStatus: 'unread', councilMeetingId: meetingId, decisionId: held.id,
                subjectId: subjectB.id, confidence: 0.8, reasoning: 'counter',
            },
        })

        const outcome = await applyCandidateConflictResolution(row.id, 'reassign')

        expect(outcome).toBe('dismissed')
        const after = await prisma.decisionCandidate.findUnique({ where: { id: row.id } })
        // The counter-proposal is rejected by restoring the backing row, not by dismissal.
        expect(after!.subjectId).toBe(subjectA.id)
        expect(after!.dismissedAt).toBeNull()
        expect(after!.decisionId).toBe(held.id)
        expect(await prisma.decision.count()).toBe(2)
    })

    test('a backing row that agrees with its decision is already resolved: noop', async () => {
        const subjectA = await createSubject(meetingId, cityId, { name: 'A', agendaItemIndex: 1 })
        const held = await prisma.decision.create({
            data: { subjectId: subjectA.id, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf' },
        })
        const row = await prisma.decisionCandidate.create({
            data: {
                cityId, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf',
                readStatus: 'unread', councilMeetingId: meetingId, decisionId: held.id,
                subjectId: subjectA.id,
            },
        })

        expect(await applyCandidateConflictResolution(row.id, 'reassign')).toBe('noop')
        const after = await prisma.decisionCandidate.findUnique({ where: { id: row.id } })
        expect(after!.subjectId).toBe(subjectA.id)
        expect(after!.dismissedAt).toBeNull()
    })
})

describe('per-body breakdown', () => {
    beforeEach(async () => {
        await resetDatabase(prisma)
    })

    async function seedCityWithBodies() {
        const city = await createCity({ id: 'c1', diavgeiaUid: 'DIAV-1' })
        const council = await createAdministrativeBody(city.id, {
            id: 'b-council', name: 'Δημοτικό Συμβούλιο', type: 'council', diavgeiaUnitIds: ['81689'],
            notificationBehavior: 'NOTIFICATIONS_DISABLED',
        })
        const committee = await createAdministrativeBody(city.id, {
            id: 'b-committee', name: 'Δημοτική Επιτροπή', type: 'committee',
            notificationBehavior: 'NOTIFICATIONS_DISABLED',
        })
        // A community that never met: it must still appear, with zero coverage.
        await createAdministrativeBody(city.id, {
            id: 'b-community', name: '1η Κοινότητα', type: 'community',
            notificationBehavior: 'NOTIFICATIONS_DISABLED',
        })

        const m1 = await createMeeting(city.id, {
            id: 'm1', administrativeBodyId: council.id, dateTime: new Date('2025-01-10T10:00:00Z'),
        })
        const linked = await createSubject(m1.id, city.id, { name: 'L', agendaItemIndex: 1 })
        await createSubject(m1.id, city.id, { name: 'U', agendaItemIndex: 2 })
        await prisma.decision.create({
            data: { subjectId: linked.id, ada: 'ADA-L', pdfUrl: 'https://example.com/l.pdf', excerpt: 'text' },
        })
        await createTaskStatus(m1.id, city.id, { type: 'pollDecisions', status: 'succeeded' })

        // One read, unassigned candidate filed to the council meeting: unplaced work of that body.
        await prisma.decisionCandidate.create({
            data: {
                cityId: city.id, ada: 'ADA-U1', pdfUrl: 'https://example.com/u1.pdf',
                readStatus: 'ok', councilMeetingId: m1.id,
                meetingDate: new Date('2025-01-10T00:00:00Z'),
            },
        })

        const m2 = await createMeeting(city.id, {
            id: 'm2', administrativeBodyId: committee.id, dateTime: new Date('2025-01-12T10:00:00Z'),
        })
        await createSubject(m2.id, city.id, { name: 'C', agendaItemIndex: 1 })
        // The committee meeting's latest poll failed: that body is blocked.
        await createTaskStatus(m2.id, city.id, { type: 'pollDecisions', status: 'failed' })

        // A meeting with no administrative body at all.
        const m3 = await createMeeting(city.id, {
            id: 'm3', dateTime: new Date('2025-01-14T10:00:00Z'),
        })
        await createSubject(m3.id, city.id, { name: 'N', agendaItemIndex: 1 })
        return city
    }

    test('one row per body plus the no-body row, in type order, summing to the city', async () => {
        const city = await seedCityWithBodies()
        const [row] = await getDecisionHealth(city.id)

        expect(row.diavgeiaUid).toBe('DIAV-1')
        expect(row.bodies.map(b => b.body?.id ?? null)).toEqual(['b-council', 'b-committee', 'b-community', null])
        expect(row.bodies[0].body?.diavgeiaUnitIds).toEqual(['81689'])
        expect(row.bodies[1].body?.diavgeiaUnitIds).toEqual([])

        const sum = (f: (b: typeof row.bodies[number]) => number) => row.bodies.reduce((a, b) => a + f(b), 0)
        expect(sum(b => b.meetings)).toBe(row.meetings)
        expect(sum(b => b.polledMeetings)).toBe(row.polledMeetings)
        expect(sum(b => b.eligibleSubjects)).toBe(row.eligibleSubjects)
        expect(sum(b => b.linkedSubjects)).toBe(row.linkedSubjects)
        expect(sum(b => b.contentLinks)).toBe(row.contentLinks)
        expect(sum(b => b.unmatchedTaxonomy.notProcessed)).toBe(row.unmatchedTaxonomy.notProcessed)
        expect(sum(b => b.unplacedCandidates)).toBe(row.unplacedCandidates)
        expect(sum(b => b.conflicts)).toBe(row.conflicts)
        expect(sum(b => b.failedMeetings)).toBe(row.failedMeetings)
        expect(row.bodies[0]).toMatchObject({ unplacedCandidates: 1, failedMeetings: 0 })
        expect(row.bodies[1]).toMatchObject({ unplacedCandidates: 0, failedMeetings: 1 })

        expect(row.bodies[0]).toMatchObject({ meetings: 1, polledMeetings: 1, eligibleSubjects: 2, linkedSubjects: 1, contentLinks: 1 })
        expect(row.bodies[1]).toMatchObject({ meetings: 1, polledMeetings: 0, eligibleSubjects: 1, linkedSubjects: 0 })
        expect(row.bodies[2]).toMatchObject({ meetings: 0, eligibleSubjects: 0 })
        expect(row.bodies[3]).toMatchObject({ body: null, meetings: 1, eligibleSubjects: 1 })
    })

    test('the window empties a body without removing it', async () => {
        const city = await seedCityWithBodies()
        // Queue work keeps the city visible when the window holds no meetings.
        await prisma.decisionCandidate.create({
            data: {
                cityId: city.id, ada: 'ADA-Q', pdfUrl: 'https://example.com/q.pdf',
                readStatus: 'ok', councilMeetingId: 'm1',
                meetingDate: new Date('2025-01-10T00:00:00Z'),
            },
        })
        const [row] = await getDecisionHealth(city.id, 30)
        expect(row.eligibleSubjects).toBe(0)
        expect(row.bodies).toHaveLength(4)
        expect(row.bodies.every(b => b.meetings === 0 && b.eligibleSubjects === 0)).toBe(true)
    })

    test('a body-less meeting without eligible subjects earns no no-body row', async () => {
        const city = await createCity({ id: 'c3', diavgeiaUid: 'DIAV-3', status: 'supported' })
        const body = await createAdministrativeBody(city.id, { notificationBehavior: 'NOTIFICATIONS_DISABLED' })
        const m = await createMeeting(city.id, {
            id: 'm1', administrativeBodyId: body.id, dateTime: new Date('2025-01-10T10:00:00Z'),
        })
        await createSubject(m.id, city.id, { name: 'S', agendaItemIndex: 1 })
        // A presentation: no agenda items, so nothing to poll and nothing to show.
        const talk = await createMeeting(city.id, { id: 'm-talk', dateTime: new Date('2025-01-12T10:00:00Z') })
        await createSubject(talk.id, city.id, { name: 'Slides', agendaItemIndex: null })
        const [row] = await getDecisionHealth(city.id)
        expect(row.bodies.map(b => b.body?.id ?? null)).toEqual([body.id])
    })

    test('a city whose meetings all carry a body has no no-body row', async () => {
        const city = await createCity({ id: 'c2', diavgeiaUid: 'DIAV-2' })
        const body = await createAdministrativeBody(city.id, { notificationBehavior: 'NOTIFICATIONS_DISABLED' })
        const m = await createMeeting(city.id, {
            id: 'm1', administrativeBodyId: body.id, dateTime: new Date('2025-01-10T10:00:00Z'),
        })
        await createSubject(m.id, city.id, { name: 'S', agendaItemIndex: 1 })
        const [row] = await getDecisionHealth(city.id)
        expect(row.bodies.map(b => b.body?.id ?? null)).toEqual([body.id])
    })
})
