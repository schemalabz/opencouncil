/** @jest-environment node */
import { NextRequest } from 'next/server'
import prisma from '@/lib/db/prisma'
import { getUtteranceContext } from '@/lib/db/utteranceContext'
import { getPublicMeeting, transcriptIsPublic, TRANSCRIPT_PUBLIC_WHERE } from '@/lib/db/sharing/publicContent'
import { POST as votingUtterances } from '@/app/api/subject/voting-utterances/route'
import { resetDatabase } from '../helpers/test-db'
import {
    createAdministrativeBody, createCity, createMeeting, createSpeakerSegment, createSpeakerTag, createSubject, createTaskStatus, createUtterance, signInAsSuperAdmin,
} from '../helpers/factories'

const CITY = 'c1'
const MARCH = (day: number) => new Date(Date.UTC(2026, 2, day, 16))

describe('an unreviewed transcript that the body hides, as an anonymous reader', () => {
    let subjectId: string
    let utteranceIds: string[]

    beforeEach(async () => {
        await resetDatabase(prisma)
        await createCity({ id: CITY })
        const councilId = (await createAdministrativeBody(CITY, { type: 'council', showUnreviewedTranscript: false })).id
        await createMeeting(CITY, { id: 'm', dateTime: MARCH(12), administrativeBodyId: councilId, kind: 'regular', released: true })
        subjectId = (await createSubject('m', CITY, { name: 'Subject' })).id
        const tag = await createSpeakerTag()
        const segment = await createSpeakerSegment('m', CITY, { speakerTagId: tag.id, startTimestamp: 0, endTimestamp: 60 })
        utteranceIds = []
        for (let i = 0; i < 5; i++) {
            const u = await createUtterance(segment.id, { text: `secret words ${i}`, startTimestamp: i * 10, endTimestamp: i * 10 + 9 })
            utteranceIds.push(u.id)
        }
        await prisma.utterance.update({ where: { id: utteranceIds[2] }, data: { discussionSubjectId: subjectId, discussionStatus: 'VOTE' } })
    })

    function votingRequest() {
        return new NextRequest(new URL('/api/subject/voting-utterances', 'http://localhost'), {
            method: 'POST', body: JSON.stringify({ subjectId }), headers: { 'content-type': 'application/json' },
        })
    }

    test('voting-utterances returns no text', async () => {
        const res = await votingUtterances(votingRequest())
        expect((await res.json()).utterances ?? []).toHaveLength(0)
    })

    test('the utterance context returns nothing', async () => {
        const req = new NextRequest(new URL(`/api/utterance/${utteranceIds[2]}/context`, 'http://localhost'))
        expect(await getUtteranceContext(req, utteranceIds[2], 50, 50)).toBeNull()
    })

    test('transcriptIsPublic says no', async () => {
        const meeting = await getPublicMeeting(CITY, 'm', 'greece')
        expect(transcriptIsPublic(meeting!)).toBe(false)
    })

    test('voting-utterances gives no utterance of another meeting', async () => {
        // A public subject whose vote is tagged on an utterance of the unreviewed meeting.
        const councilId = (await createAdministrativeBody(CITY, { type: 'council', name: 'Open', name_en: 'Open' })).id
        await createMeeting(CITY, { id: 'open', dateTime: MARCH(19), administrativeBodyId: councilId, kind: 'regular', released: true })
        const openSubject = (await createSubject('open', CITY, { name: 'Open subject' })).id
        await prisma.utterance.update({ where: { id: utteranceIds[3] }, data: { discussionSubjectId: openSubject, discussionStatus: 'VOTE' } })
        const res = await votingUtterances(new NextRequest(new URL('/api/subject/voting-utterances', 'http://localhost'), {
            method: 'POST', body: JSON.stringify({ subjectId: openSubject }), headers: { 'content-type': 'application/json' },
        }))
        expect((await res.json()).utterances).toHaveLength(0)
    })

    test('an editor of the city still reads it', async () => {
        await signInAsSuperAdmin()
        const res = await votingUtterances(votingRequest())
        expect((await res.json()).utterances).toHaveLength(1)
        const req = new NextRequest(new URL(`/api/utterance/${utteranceIds[2]}/context`, 'http://localhost'))
        expect(await getUtteranceContext(req, utteranceIds[2], 50, 50)).not.toBeNull()
    })
})

describe('TRANSCRIPT_PUBLIC_WHERE', () => {
    beforeEach(async () => {
        await resetDatabase(prisma)
        await createCity({ id: CITY })
    })

    test('keeps the same meetings as transcriptIsPublic', async () => {
        const open = (await createAdministrativeBody(CITY, { type: 'council' })).id
        const reviewed = (await createAdministrativeBody(CITY, { type: 'committee', name: 'R', name_en: 'R', showUnreviewedTranscript: false })).id
        await createMeeting(CITY, { id: 'public', administrativeBodyId: open, released: true })
        await createMeeting(CITY, { id: 'no-body', administrativeBodyId: null, released: true, format: null })
        await createMeeting(CITY, { id: 'draft', administrativeBodyId: open, released: false })
        await createMeeting(CITY, { id: 'unreviewed', administrativeBodyId: reviewed, released: true })
        await createMeeting(CITY, { id: 'reviewed', administrativeBodyId: reviewed, released: true })
        await createTaskStatus('reviewed', CITY, { type: 'humanReview', status: 'succeeded' })

        const ids = (await prisma.councilMeeting.findMany({ where: { cityId: CITY, ...TRANSCRIPT_PUBLIC_WHERE }, select: { id: true } }))
            .map((m) => m.id).sort()
        expect(ids).toEqual(['no-body', 'public', 'reviewed'])
        for (const id of ['public', 'no-body', 'unreviewed', 'reviewed']) {
            const meeting = await getPublicMeeting(CITY, id, 'greece')
            expect([id, transcriptIsPublic(meeting!)]).toEqual([id, ids.includes(id)])
        }
    })
})
