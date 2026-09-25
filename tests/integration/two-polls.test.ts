/** @jest-environment node */
jest.mock('@/lib/tasks/generateHighlight', () => ({ handleGenerateHighlightResult: jest.fn() }))
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn(), isUserAuthorizedToEdit: jest.fn().mockResolvedValue(true) }))
jest.mock('next/server', () => ({ ...jest.requireActual('next/server'), after: () => {} }))

import prisma from '@/lib/db/prisma'
import { handlePollDecisionsResult } from '@/lib/tasks/pollDecisions'
import { deriveAndPersist, explainMeeting } from '@/lib/derivation'
import type { ExtractedDecisionData, PollDecisionsAttendanceEvent } from '@/lib/apiTypes'
import { resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting, createPerson, createSubject, createTaskStatus } from '../helpers/factories'
import { makeExtractedDecision, makePollDecisionsResult } from '../helpers/builders'

/**
 * The C1 proof (spec §1.2, §7.3). A session's decisions publish over days (72 of
 * 93 local meetings), so the normal path is a poll that reads one new page. That
 * poll must not remove what the pages of an earlier poll stated.
 */
describe('two polls of one meeting', () => {
    let cityId: string
    let meetingId: string
    let a: { id: string }
    let b: { id: string }
    let c: { id: string }
    let s: Array<{ id: string }>

    beforeEach(async () => {
        await resetDatabase(prisma)
        cityId = (await createCity({ id: 'c1' })).id
        const body = await createAdministrativeBody(cityId, { notificationBehavior: 'NOTIFICATIONS_DISABLED' })
        meetingId = (await createMeeting(cityId, { id: 'm1', administrativeBodyId: body.id })).id
        a = await createPerson(cityId, { name: 'Άννα Αλεξίου' })
        b = await createPerson(cityId, { name: 'Βασίλης Βλάχος' })
        c = await createPerson(cityId, { name: 'Γιώργος Γεωργίου' })
        s = []
        for (const i of [1, 2, 3]) {
            const subject = await createSubject(meetingId, cityId, { name: `Θέμα ${i}`, agendaItemIndex: i })
            await prisma.decision.create({ data: { subjectId: subject.id, pdfUrl: `https://example.com/${i}.pdf`, ada: `ADA-${i}` } })
            s.push(subject)
        }
    })

    /** «Ο κ. Βλάχος αποχώρησε μετά τη συζήτηση του 1ου θέματος», as one page states it. */
    const departureOfB = (): PollDecisionsAttendanceEvent => ({
        personId: b.id, name: 'Βλάχος Βασίλης', type: 'departure',
        anchor: { kind: 'agenda_item', agendaItemIndex: 1, nonAgendaReason: null, decisionNumber: null, subjectId: null, phase: null, timing: 'after' },
        rawText: 'Ο κ. Βλάχος αποχώρησε μετά τη συζήτηση του 1ου θέματος', reportingPdfCount: 1, totalPdfCount: 1,
    })
    const page = (i: number, o: Partial<ExtractedDecisionData> & { rollCallPresent?: string[]; rollCallAbsent?: string[] } = {}) =>
        makeExtractedDecision({ subjectId: s[i - 1].id, rollCallPresent: [a.id, b.id, c.id], ...o })
    async function poll(pages: ExtractedDecisionData[]) {
        const task = await createTaskStatus(meetingId, cityId, { type: 'pollDecisions', version: 4 })
        await handlePollDecisionsResult(task.id, makePollDecisionsResult({ extractions: { decisions: pages, warnings: [] } }))
    }
    const statusOf = async (personId: string, item: number) =>
        (await prisma.subjectAttendance.findFirst({ where: { subjectId: s[item - 1].id, personId, source: 'decision' } }))?.status

    // The poll handler stores each page only; the derivation runs after it in the
    // same callback and resolves the roll call and the events over every stored page.
    test("a departure the first poll's pages state survives a poll that reads one new page", async () => {
        // Poll 1 reads items 1 and 2; both state the departure.
        await poll([page(1, { attendanceChanges: [departureOfB()] }), page(2, { attendanceChanges: [departureOfB()] })])
        expect(await statusOf(b.id, 2)).toBe('ABSENT')

        // Poll 2 reads item 3, whose page does not restate the session.
        await poll([page(3)])

        expect(await statusOf(b.id, 2)).toBe('ABSENT')
        expect(await statusOf(b.id, 3)).toBe('ABSENT')
    })

    test('a misread roll call on the one new page does not replace the roll call two pages agree on', async () => {
        await poll([page(1), page(2)])
        // Item 3's ΑΠΟΧΩΡΗΣΑΝΤΕΣ column came back as its roll call (Argos, 6Ι9ΑΩΨΔ-0Υ8).
        await poll([page(3, { rollCallPresent: [a.id], rollCallAbsent: [b.id, c.id] })])

        const rollCall = await prisma.meetingAttendance.findMany({ where: { cityId, councilMeetingId: meetingId, source: 'decision' } })
        expect(rollCall.map(r => r.status).sort()).toEqual(['PRESENT', 'PRESENT', 'PRESENT'])
        expect(await statusOf(c.id, 1)).toBe('PRESENT')
    })

    test('rows the derivation wrote do not feed the next derivation', async () => {
        await poll([page(1, { attendanceChanges: [departureOfB()] }), page(2, { attendanceChanges: [departureOfB()] })])
        const before = await explainMeeting(cityId, meetingId)
        // Tamper with the derived output: the roll call says B absent, and the events are gone.
        await prisma.meetingAttendance.updateMany({ where: { cityId, councilMeetingId: meetingId, personId: b.id, source: 'decision' }, data: { status: 'ABSENT' } })
        await prisma.attendanceEvent.deleteMany({ where: { cityId, councilMeetingId: meetingId, source: 'decision' } })
        expect(await explainMeeting(cityId, meetingId)).toEqual(before)
    })

    test('a manual roll-call row still outranks the pages', async () => {
        await poll([page(1), page(2)])
        await prisma.meetingAttendance.create({ data: { cityId, councilMeetingId: meetingId, personId: a.id, status: 'ABSENT', source: 'manual' } })
        const out = await deriveAndPersist(cityId, meetingId)
        expect(await statusOf(a.id, 1)).toBe('ABSENT')
        expect(out.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SOURCES_DISAGREE', personId: a.id })]))
    })
})
