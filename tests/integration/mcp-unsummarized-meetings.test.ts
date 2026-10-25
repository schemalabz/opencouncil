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

    test('get_meeting says that an unrecorded meeting had no camera, not a written vote (#829)', async () => {
        await createMeeting('athens', {
            id: 'unrecorded', dateTime: new Date('2026-08-04T07:30:00Z'), released: true, format: 'inPerson', noRecording: true,
        })
        const meeting = await asRequest(() => mcpGetMeeting('athens', 'unrecorded', ANON))

        expect(meeting.note).toMatch(/no recording/)
        expect(meeting.note).not.toMatch(/circulation|still be processing/)
    })

    test('get_meeting adds no note once the meeting has an agenda', async () => {
        const meeting = await asRequest(() => mcpGetMeeting('athens', 'summarized', ANON))

        expect(meeting.subjects.map(s => s.id)).toEqual(['sub1'])
        expect(meeting.hasTranscript).toBe(true)
        expect(meeting).not.toHaveProperty('note')
    })

    test('list_meetings separates "no subjects" from "no record at all"', async () => {
        const { meetings } = await asRequest(() =>
            mcpListMeetings('athens', { page: 1, pageSize: 10 }, ANON))

        expect(meetings.map(m => ({ id: m.id, subjectCount: m.subjectCount, hasTranscript: m.hasTranscript })))
            .toEqual([
                { id: 'scheduled', subjectCount: 0, hasTranscript: false },
                { id: 'transcribed', subjectCount: 0, hasTranscript: true },
                { id: 'summarized', subjectCount: 1, hasTranscript: true },
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
