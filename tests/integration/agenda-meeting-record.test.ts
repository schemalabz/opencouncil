/** @jest-environment node */

// The handlers schedule the meeting's illustrations with after(), which needs
// the request scope these direct calls do not have.
jest.mock('next/server', () => ({ ...jest.requireActual('next/server'), after: () => {} }))
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn(), isUserAuthorizedToEdit: jest.fn().mockResolvedValue(true) }))

import prisma from '@/lib/db/prisma'
import { sendAgendaReadingAlert } from '@/lib/discord'
import { handleProcessAgendaResult } from '@/lib/tasks/processAgenda'
import type { AgendaMeetingInAgenda, AgendaMeetingRecord, ProcessAgendaResult } from '@/lib/apiTypes'
import { resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting, createTaskStatus } from '../helpers/factories'
import { makeSubject } from '../helpers/builders'

const alerts = sendAgendaReadingAlert as unknown as jest.Mock

const record = (overrides: Partial<AgendaMeetingRecord> = {}): AgendaMeetingRecord => ({
    kind: 'ordinary', kindEvidence: 'τακτική συνεδρίαση',
    urgent: false, urgentEvidence: null,
    sessionNumber: 12, sessionNumberEvidence: '12η Συνεδρίαση',
    format: 'inPerson', formatEvidence: 'στην αίθουσα του Δημοτικού Συμβουλίου',
    ...overrides,
})

const inAgenda = (overrides: Partial<AgendaMeetingInAgenda> = {}): AgendaMeetingInAgenda => ({
    ...record(), municipality: 'ΔΗΜΟΣ ΧΑΛΑΝΔΡΙΟΥ', bodyName: 'ΔΗΜΟΤΙΚΟ ΣΥΜΒΟΥΛΙΟ', ofThisBody: true, date: '2026-02-25', time: '19:00',
    subjectCount: 1, isThisMeeting: true, ...overrides,
})

/** A v7 result for one meeting, or for the meetings given. */
function v7(meetingRecord: AgendaMeetingRecord | null, meetingsInAgenda: AgendaMeetingInAgenda[]): ProcessAgendaResult {
    return { subjects: [makeSubject({ name: 'Έγκριση μελέτης', agendaItemIndex: 1 })], meetingRecord, meetingsInAgenda }
}

async function meetingRow(cityId: string, id: string) {
    return prisma.councilMeeting.findUniqueOrThrow({ where: { cityId_id: { cityId, id } } })
}

async function subjectCount(cityId: string, id: string) {
    return prisma.subject.count({ where: { cityId, councilMeetingId: id } })
}

describe('processAgenda fills and checks the meeting record (#150)', () => {
    let bodyId: string

    beforeEach(async () => {
        await resetDatabase(prisma)
        alerts.mockClear()
        await createCity({ id: 'chalandri', name_municipality: 'Δήμος Χαλανδρίου', realm: 'greece' })
        bodyId = (await createAdministrativeBody('chalandri', { name: 'Δημοτικό Συμβούλιο', type: 'council', notificationBehavior: 'NOTIFICATIONS_DISABLED' })).id
    })

    // 17:00 UTC is 19:00 in Athens, the time the invitations print.
    const at = new Date('2026-02-25T17:00:00Z')

    test('fills the kind, the urgency, the number and the format that the meeting lacks, and writes no name', async () => {
        await createMeeting('chalandri', { id: 'feb25_2026', name: null, name_en: null, administrativeBodyId: bodyId, dateTime: at })
        const task = await createTaskStatus('feb25_2026', 'chalandri')

        const read = record({ urgent: true, urgentEvidence: 'σε κατεπείγουσα συνεδρίαση' })
        await handleProcessAgendaResult(task.id, v7(read, [inAgenda(read)]))

        expect(await meetingRow('chalandri', 'feb25_2026')).toMatchObject({
            kind: 'ordinary', urgent: true, sessionNumber: 12, format: 'inPerson', name: null, name_en: null,
        })
        expect(alerts).not.toHaveBeenCalled()
    })

    test('fills a meeting by circulation and tells no one', async () => {
        await createMeeting('chalandri', { id: 'feb25_2026', name: null, name_en: null, administrativeBodyId: bodyId, dateTime: at })
        const task = await createTaskStatus('feb25_2026', 'chalandri')

        const read = record({ urgent: true, urgentEvidence: 'κατεπείγουσα', format: 'byCirculation', formatEvidence: 'θα πραγματοποιηθεί δια περιφοράς' })
        await handleProcessAgendaResult(task.id, v7(read, [inAgenda(read)]))

        expect((await meetingRow('chalandri', 'feb25_2026')).format).toBe('byCirculation')
        expect(alerts).not.toHaveBeenCalled()
    })

    test('a re-run of the same agenda writes nothing and tells no one', async () => {
        await createMeeting('chalandri', { id: 'feb25_2026', name: null, name_en: null, administrativeBodyId: bodyId, dateTime: at,
            kind: 'ordinary', sessionNumber: 12, format: 'inPerson' })
        const before = await meetingRow('chalandri', 'feb25_2026')
        const task = await createTaskStatus('feb25_2026', 'chalandri')

        await handleProcessAgendaResult(task.id, v7(record(), [inAgenda()]))

        const after = await meetingRow('chalandri', 'feb25_2026')
        expect({ ...after, updatedAt: null }).toEqual({ ...before, updatedAt: null })
        expect(alerts).not.toHaveBeenCalled()
    })

    test('keeps an urgency that the invitation does not state, and tells the admins', async () => {
        await createMeeting('chalandri', { id: 'feb25_2026', administrativeBodyId: bodyId, dateTime: at, kind: 'ordinary', urgent: true, sessionNumber: 12, format: 'inPerson' })
        const task = await createTaskStatus('feb25_2026', 'chalandri')

        await handleProcessAgendaResult(task.id, v7(record(), [inAgenda()]))

        expect((await meetingRow('chalandri', 'feb25_2026')).urgent).toBe(true)
        expect(alerts.mock.calls[0][0].problems).toEqual(['urgent: recorded urgent, the invitation does not say urgent'])
    })

    test('refuses the agenda of another city of the platform before anything is saved', async () => {
        await createCity({ id: 'zografou', name_municipality: 'Δήμος Ζωγράφου', realm: 'greece' })
        await createMeeting('chalandri', { id: 'feb25_2026', administrativeBodyId: bodyId, dateTime: at })
        const task = await createTaskStatus('feb25_2026', 'chalandri')

        await expect(handleProcessAgendaResult(task.id, v7(record(), [inAgenda({ municipality: 'ΔΗΜΟΣ ΖΩΓΡΑΦΟΥ' })])))
            .rejects.toThrow('the agenda is from ΔΗΜΟΣ ΖΩΓΡΑΦΟΥ, not Δήμος Χαλανδρίου')
        expect(await subjectCount('chalandri', 'feb25_2026')).toBe(0)
        expect((await meetingRow('chalandri', 'feb25_2026')).kind).toBeNull()
    })

    test('saves an agenda whose municipality is a misprint, and tells the admins', async () => {
        await createMeeting('chalandri', { id: 'feb25_2026', name: null, name_en: null, administrativeBodyId: bodyId, dateTime: at })
        const task = await createTaskStatus('feb25_2026', 'chalandri')

        await handleProcessAgendaResult(task.id, v7(record(), [inAgenda({ municipality: 'ΔΗΜΟΣ ΧΑΛΑΝΔΡΗΟΥ' })]))

        expect(await subjectCount('chalandri', 'feb25_2026')).toBe(1)
        expect((await meetingRow('chalandri', 'feb25_2026')).kind).toBe('ordinary')
        expect(alerts.mock.calls[0][0].problems).toEqual(['municipality: the agenda prints ΔΗΜΟΣ ΧΑΛΑΝΔΡΗΟΥ, the city is Δήμος Χαλανδρίου'])
    })

    test('neither checks nor fills the meeting of a city outside Greece', async () => {
        // The names compare as Greek text: «Grad Beograd» would read as another municipality than «Град Београд».
        await createCity({ id: 'belgrade', name_municipality: 'Град Београд', realm: 'serbia', timezone: 'Europe/Belgrade' })
        const body = await createAdministrativeBody('belgrade', { name: 'Скупштина', type: 'council', notificationBehavior: 'NOTIFICATIONS_DISABLED' })
        await createMeeting('belgrade', { id: 'feb25_2026', name: 'Седница 25.02.2026', administrativeBodyId: body.id, dateTime: at })
        const task = await createTaskStatus('feb25_2026', 'belgrade')

        await handleProcessAgendaResult(task.id, v7(record(), [inAgenda({ municipality: 'Grad Beograd', bodyName: 'Skupština grada' })]))

        expect(await subjectCount('belgrade', 'feb25_2026')).toBe(1)
        expect(await meetingRow('belgrade', 'feb25_2026')).toMatchObject({ kind: null, sessionNumber: null, name: 'Седница 25.02.2026' })
        expect(alerts).not.toHaveBeenCalled()
    })

    const accountabilityAndOrdinary = [
        inAgenda({ kind: 'accountability', kindEvidence: 'Ειδική Συνεδρίαση Λογοδοσίας', sessionNumber: 3, time: '19:00' }),
        inAgenda({ kind: 'ordinary', sessionNumber: 18, time: '20:00', isThisMeeting: false, subjectCount: 12 }),
    ]

    test('keeps a record of two meetings without a kind, keeps its stored name, and tells the admins', async () => {
        await createMeeting('chalandri', { id: 'feb25_2026', name: 'Ειδική Συνεδρίαση Λογοδοσίας και Τακτική Συνεδρίαση 25/02/26', name_en: null,
            administrativeBodyId: bodyId, dateTime: at, agendaUrl: 'https://example.org/feb25.pdf' })
        const task = await createTaskStatus('feb25_2026', 'chalandri')

        await handleProcessAgendaResult(task.id, v7(accountabilityAndOrdinary[0], accountabilityAndOrdinary))

        expect(await meetingRow('chalandri', 'feb25_2026')).toMatchObject({
            kind: null, sessionNumber: null, format: 'inPerson', name: 'Ειδική Συνεδρίαση Λογοδοσίας και Τακτική Συνεδρίαση 25/02/26',
        })
        expect(alerts.mock.calls[0][0].problems[0]).toContain('kept as a combined meeting')
    })

    test('does not take a postponed meeting for the record of the agenda\'s other meeting (#856 review)', async () => {
        // A is postponed; B is its new meeting, from the same PDF, which calls a λογοδοσία and a τακτική.
        const agendaUrl = 'https://example.org/feb25.pdf'
        await createMeeting('chalandri', { id: 'feb18_2026', administrativeBodyId: bodyId, dateTime: new Date('2026-02-25T10:00:00Z'), agendaUrl, scheduleStatus: 'postponed' })
        await createMeeting('chalandri', { id: 'feb25_2026', name: null, name_en: null, administrativeBodyId: bodyId, dateTime: at, agendaUrl, postponedFromId: 'feb18_2026' })
        const task = await createTaskStatus('feb25_2026', 'chalandri')

        await handleProcessAgendaResult(task.id, v7(accountabilityAndOrdinary[0], accountabilityAndOrdinary))

        // An accountability kind would take the τακτική's subjects out of the decision poll.
        expect((await meetingRow('chalandri', 'feb25_2026')).kind).toBeNull()
        expect(alerts.mock.calls[0][0].problems[0]).toContain('kept as a combined meeting')
    })

    test('fills its own meeting when another record holds the other one', async () => {
        await createMeeting('chalandri', { id: 'feb25_2026', name: null, name_en: null, administrativeBodyId: bodyId, dateTime: at })
        await createMeeting('chalandri', { id: 'feb25_2_2026', administrativeBodyId: bodyId, dateTime: new Date('2026-02-25T18:00:00Z') })
        const task = await createTaskStatus('feb25_2026', 'chalandri')

        await handleProcessAgendaResult(task.id, v7(accountabilityAndOrdinary[0], accountabilityAndOrdinary))

        expect(await meetingRow('chalandri', 'feb25_2026')).toMatchObject({ kind: 'accountability', sessionNumber: 3 })
    })
})
