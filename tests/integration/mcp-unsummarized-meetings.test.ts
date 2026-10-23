/** @jest-environment node */
/**
 * A meeting is transcribed first and summarized into subjects later, so
 * between the two steps get_meeting answers with an empty agenda. Agents read
 * that as an empty meeting and tell the user there is nothing to show, when
 * the full verbatim record is sitting right there. These tests pin the signal
 * that tells them otherwise.
 */
import { Realm } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import { mcpGetMeeting, mcpListMeetings } from '@/lib/mcp/data'
import { mcpRealmStore, requestContext } from '@/lib/mcp/realm-context'
import type { McpIdentity } from '@/lib/mcp/auth'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import {
    createCity,
    createMeeting,
    createSpeakerSegment,
    createSpeakerTag,
    createSubject,
    createTaskStatus,
    createUser,
    createUtterance,
} from '../helpers/factories'

const ANON = null
// The token of a superadmin account, which sees every draft.
let SUPERADMIN: { userId: string }

const asRequest = <T>(fn: () => Promise<T>, identity: McpIdentity = ANON) =>
    mcpRealmStore.run(requestContext(Realm.greece, 'opencouncil.gr', identity), fn)

/** A meeting that has been transcribed: one segment carrying one utterance. */
async function transcribe(meetingId: string, cityId = 'athens') {
    const tag = await createSpeakerTag({ label: 'Δήμαρχος' })
    const segment = await createSpeakerSegment(meetingId, cityId, { speakerTagId: tag.id })
    await createUtterance(segment.id, { text: 'Ξεκινάμε τη συνεδρίαση.' })
}

describe('MCP signals for a transcribed but unsummarized meeting - integration', () => {
    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma)
        SUPERADMIN = { userId: (await createUser('bot@example.com', { isSuperAdmin: true })).id }
        await createCity({ id: 'athens', realm: Realm.greece })

        // Transcribed, no subjects yet — the case that misled agents.
        await createMeeting('athens', {
            id: 'transcribed', dateTime: new Date('2026-08-18T07:30:00Z'), released: true,
        })
        await transcribe('transcribed')

        // Fully processed: transcript and agenda.
        await createMeeting('athens', {
            id: 'summarized', dateTime: new Date('2026-08-11T07:30:00Z'), released: true,
        })
        await transcribe('summarized')
        await createSubject('summarized', 'athens', { id: 'sub1', name: 'Προϋπολογισμός' })
        await createTaskStatus('summarized', 'athens', { type: 'summarize', status: 'succeeded' })

        // Transcribed, with the agenda document's items extracted but no
        // summary yet — the shape that reads like the record of the meeting.
        await createMeeting('athens', {
            id: 'agendaonly', dateTime: new Date('2026-08-25T07:30:00Z'), released: true,
        })
        await transcribe('agendaonly')
        await createSubject('agendaonly', 'athens', { id: 'item1', name: 'Αναμόρφωση', agendaItemIndex: 1 })
        await createTaskStatus('agendaonly', 'athens', { type: 'processAgenda', status: 'succeeded' })

        // Neither: a session still to be held.
        await createMeeting('athens', {
            id: 'scheduled', dateTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), released: true,
        })
    })

    test('get_meeting reports the transcript and says the agenda is only pending', async () => {
        const meeting = await asRequest(() => mcpGetMeeting('athens', 'transcribed', ANON))

        expect(meeting.subjects).toEqual([])
        expect(meeting.hasTranscript).toBe(true)
        // The note is what an agent acts on, so it has to name the tool that
        // holds the record — not merely state that a summary is missing.
        expect(meeting.note).toContain('get_transcript')
        expect(meeting.note).toMatch(/not been summarized/)
    })

    test('get_meeting distinguishes a meeting with nothing recorded yet', async () => {
        const meeting = await asRequest(() => mcpGetMeeting('athens', 'scheduled', ANON))

        expect(meeting.hasTranscript).toBe(false)
        // No transcript to send the agent to, so the note must not promise one.
        expect(meeting.note).not.toContain('get_transcript')
    })

    test('get_meeting says that a meeting by circulation was never recorded', async () => {
        await createMeeting('athens', {
            id: 'bycirculation', dateTime: new Date('2026-08-04T07:30:00Z'), released: true, format: 'byCirculation',
        })
        const meeting = await asRequest(() => mcpGetMeeting('athens', 'bycirculation', ANON))

        expect(meeting.note).toMatch(/by circulation/)
        expect(meeting.note).not.toMatch(/still be processing/)
    })

    test('get_meeting adds no note once the meeting is summarized', async () => {
        const meeting = await asRequest(() => mcpGetMeeting('athens', 'summarized', ANON))

        expect(meeting.subjects.map(s => s.id)).toEqual(['sub1'])
        expect(meeting.hasTranscript).toBe(true)
        expect(meeting.summarized).toBe(true)
        expect(meeting).not.toHaveProperty('note')
    })

    test('get_meeting says that agenda-only subjects are not the record', async () => {
        const meeting = await asRequest(() => mcpGetMeeting('athens', 'agendaonly', ANON))

        expect(meeting.subjects.map(s => s.id)).toEqual(['item1'])
        expect(meeting.hasTranscript).toBe(true)
        expect(meeting.summarized).toBe(false)
        expect(meeting.note).toContain('get_transcript')
        expect(meeting.note).toMatch(/agenda document only/)
    })

    test('get_meeting treats contributions as a summary when no task row exists', async () => {
        // Meetings processed before task tracking: the summarization step
        // left its contributions but no succeeded summarize row.
        await createSubject('agendaonly', 'athens', { id: 'raised', name: 'Προ ημερησίας', agendaItemIndex: null, nonAgendaReason: 'beforeAgenda' })
        await prisma.speakerContribution.create({
            data: { subjectId: 'raised', text: 'Ο πρόεδρος έθεσε το θέμα.', speakerName: 'Πρόεδρος' },
        })

        const meeting = await asRequest(() => mcpGetMeeting('athens', 'agendaonly', ANON))

        expect(meeting.summarized).toBe(true)
        expect(meeting).not.toHaveProperty('note')
        expect(meeting.subjects.map(s => [s.id, s.nonAgendaReason])).toEqual([['item1', null], ['raised', 'beforeAgenda']])
    })

    test('get_meeting treats tagged discussion as a summary when nothing else marks it', async () => {
        const segment = await prisma.speakerSegment.findFirstOrThrow({ where: { meetingId: 'agendaonly', cityId: 'athens' } })
        await prisma.utterance.updateMany({
            where: { speakerSegmentId: segment.id },
            data: { discussionSubjectId: 'item1', discussionStatus: 'SUBJECT_DISCUSSION' },
        })

        const meeting = await asRequest(() => mcpGetMeeting('athens', 'agendaonly', ANON))

        expect(meeting.summarized).toBe(true)
        expect(meeting).not.toHaveProperty('note')
    })

    test('list_meetings treats tagged discussion as a summary, like get_meeting', async () => {
        const segment = await prisma.speakerSegment.findFirstOrThrow({ where: { meetingId: 'agendaonly', cityId: 'athens' } })
        await prisma.utterance.updateMany({
            where: { speakerSegmentId: segment.id },
            data: { discussionSubjectId: 'item1', discussionStatus: 'SUBJECT_DISCUSSION' },
        })

        const { meetings } = await asRequest(() =>
            mcpListMeetings('athens', { page: 1, pageSize: 10 }, ANON))

        expect(meetings.find(m => m.id === 'agendaonly')?.summarized).toBe(true)
    })

    test('list_meetings treats contributions as a summary when no task row exists', async () => {
        await prisma.speakerContribution.create({
            data: { subjectId: 'item1', text: 'Ο εισηγητής παρουσίασε την αναμόρφωση.', speakerName: 'Εισηγητής' },
        })

        const { meetings } = await asRequest(() =>
            mcpListMeetings('athens', { page: 1, pageSize: 10 }, ANON))

        expect(meetings.find(m => m.id === 'agendaonly')?.summarized).toBe(true)
    })

    test('list_meetings separates "no subjects" from "no record at all"', async () => {
        const { meetings } = await asRequest(() =>
            mcpListMeetings('athens', { page: 1, pageSize: 10 }, ANON))

        expect(meetings.map(m => ({ id: m.id, subjectCount: m.subjectCount, hasTranscript: m.hasTranscript, summarized: m.summarized })))
            .toEqual([
                { id: 'scheduled', subjectCount: 0, hasTranscript: false, summarized: false },
                { id: 'agendaonly', subjectCount: 1, hasTranscript: true, summarized: false },
                { id: 'transcribed', subjectCount: 0, hasTranscript: true, summarized: false },
                { id: 'summarized', subjectCount: 1, hasTranscript: true, summarized: true },
            ])
    })

    it('lists the pipeline tasks to an editor and to nobody else', async () => {
        await prisma.taskStatus.create({
            data: { type: 'transcribe', status: 'failed', requestBody: '{}', failureReason: 'worker down', councilMeetingId: 'transcribed', cityId: 'athens' },
        })

        const seen = await asRequest(() => mcpGetMeeting('athens', 'transcribed', SUPERADMIN), SUPERADMIN)
        expect(seen.tasks).toEqual([expect.objectContaining({ type: 'transcribe', status: 'failed', error: 'worker down' })])

        const hidden = await asRequest(() => mcpGetMeeting('athens', 'transcribed', ANON))
        expect(hidden).not.toHaveProperty('tasks')
    })
})
