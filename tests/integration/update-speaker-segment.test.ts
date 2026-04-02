/** @jest-environment node */

jest.mock('@/lib/auth', () => ({
    withUserAuthorizedToEdit: jest.fn(),
    isUserAuthorizedToEdit: jest.fn().mockResolvedValue(true),
}))

import prisma from '@/lib/db/prisma'
import { updateSpeakerSegmentData } from '@/lib/db/speakerSegments'
import { resetDatabase } from '../helpers/test-db'
import {
    createCity,
    createMeeting,
    createSpeakerSegment,
    createSpeakerTag,
    createSubject,
    createUtterance,
} from '../helpers/factories'

describe('updateSpeakerSegmentData', () => {
    let cityId: string
    let meetingId: string
    let speakerTagId: string

    beforeEach(async () => {
        await resetDatabase(prisma as any)

        const city = await createCity({ id: 'c1' })
        cityId = city.id
        const meeting = await createMeeting(cityId, { id: 'm1' })
        meetingId = meeting.id
        const tag = await createSpeakerTag({ label: 'Speaker 1' })
        speakerTagId = tag.id
    })

    test('updates discussionStatus and discussionSubjectId on utterances', async () => {
        const segment = await createSpeakerSegment(meetingId, cityId, {
            speakerTagId, startTimestamp: 0, endTimestamp: 20,
        })
        const u1 = await createUtterance(segment.id, { text: 'Hello', startTimestamp: 0, endTimestamp: 10 })
        const u2 = await createUtterance(segment.id, { text: 'World', startTimestamp: 10, endTimestamp: 20 })
        const subject = await createSubject(meetingId, cityId, { name: 'Budget' })

        await updateSpeakerSegmentData(segment.id, {
            utterances: [
                { id: u1.id, text: 'Hello', startTimestamp: 0, endTimestamp: 10, discussionStatus: 'ATTENDANCE', discussionSubjectId: null },
                { id: u2.id, text: 'World', startTimestamp: 10, endTimestamp: 20, discussionStatus: 'SUBJECT_DISCUSSION', discussionSubjectId: subject.id },
            ],
        }, cityId)

        const updated = await prisma.utterance.findMany({
            where: { speakerSegmentId: segment.id },
            orderBy: { startTimestamp: 'asc' },
        })
        expect(updated[0].discussionStatus).toBe('ATTENDANCE')
        expect(updated[0].discussionSubjectId).toBeNull()
        expect(updated[1].discussionStatus).toBe('SUBJECT_DISCUSSION')
        expect(updated[1].discussionSubjectId).toBe(subject.id)
    })

    test('updates utterances from adjacent merged segments', async () => {
        // Simulate the merged transcript view: two segments from the same speaker
        const seg1 = await createSpeakerSegment(meetingId, cityId, {
            speakerTagId, startTimestamp: 0, endTimestamp: 10,
        })
        const seg2 = await createSpeakerSegment(meetingId, cityId, {
            speakerTagId, startTimestamp: 10, endTimestamp: 20,
        })
        const u1 = await createUtterance(seg1.id, { text: 'From seg1', startTimestamp: 0, endTimestamp: 10 })
        const u2 = await createUtterance(seg2.id, { text: 'From seg2', startTimestamp: 10, endTimestamp: 20 })

        // Edit both utterances via seg1's ID (as the merged view would)
        await updateSpeakerSegmentData(seg1.id, {
            utterances: [
                { id: u1.id, text: 'Edited seg1', startTimestamp: 0, endTimestamp: 10, discussionStatus: 'OTHER', discussionSubjectId: null },
                { id: u2.id, text: 'Edited seg2', startTimestamp: 10, endTimestamp: 20, discussionStatus: 'ATTENDANCE', discussionSubjectId: null },
            ],
        }, cityId)

        const updatedU1 = await prisma.utterance.findUniqueOrThrow({ where: { id: u1.id } })
        const updatedU2 = await prisma.utterance.findUniqueOrThrow({ where: { id: u2.id } })

        // seg1's utterance: full update (text + discussion fields)
        expect(updatedU1.text).toBe('Edited seg1')
        expect(updatedU1.discussionStatus).toBe('OTHER')

        // seg2's utterance: also fully updated (cross-segment)
        expect(updatedU2.text).toBe('Edited seg2')
        expect(updatedU2.discussionStatus).toBe('ATTENDANCE')

        // seg2's utterance should remain in seg2 (not moved)
        expect(updatedU2.speakerSegmentId).toBe(seg2.id)
    })

    test('recalculates segment timestamps only from its own utterances', async () => {
        const seg1 = await createSpeakerSegment(meetingId, cityId, {
            speakerTagId, startTimestamp: 0, endTimestamp: 10,
        })
        const seg2 = await createSpeakerSegment(meetingId, cityId, {
            speakerTagId, startTimestamp: 100, endTimestamp: 200,
        })
        const u1 = await createUtterance(seg1.id, { text: 'A', startTimestamp: 2, endTimestamp: 8 })
        const u2 = await createUtterance(seg2.id, { text: 'B', startTimestamp: 100, endTimestamp: 200 })

        await updateSpeakerSegmentData(seg1.id, {
            utterances: [
                { id: u1.id, text: 'A', startTimestamp: 2, endTimestamp: 8, discussionStatus: null, discussionSubjectId: null },
                { id: u2.id, text: 'B', startTimestamp: 100, endTimestamp: 200, discussionStatus: null, discussionSubjectId: null },
            ],
        }, cityId)

        // seg1's timestamps should be based only on u1, not u2
        const updatedSeg1 = await prisma.speakerSegment.findUniqueOrThrow({ where: { id: seg1.id } })
        expect(updatedSeg1.startTimestamp).toBe(2)
        expect(updatedSeg1.endTimestamp).toBe(8)
    })

    test('rejects invalid subject ID', async () => {
        const segment = await createSpeakerSegment(meetingId, cityId, {
            speakerTagId, startTimestamp: 0, endTimestamp: 10,
        })
        const u1 = await createUtterance(segment.id, { text: 'Hello', startTimestamp: 0, endTimestamp: 10 })

        await expect(updateSpeakerSegmentData(segment.id, {
            utterances: [
                { id: u1.id, text: 'Hello', startTimestamp: 0, endTimestamp: 10, discussionStatus: 'SUBJECT_DISCUSSION', discussionSubjectId: 'nonexistent-id' },
            ],
        }, cityId)).rejects.toThrow('does not exist')
    })

    test('clears discussion fields when set to null', async () => {
        const segment = await createSpeakerSegment(meetingId, cityId, {
            speakerTagId, startTimestamp: 0, endTimestamp: 10,
        })
        const subject = await createSubject(meetingId, cityId, { name: 'Budget' })
        const u1 = await createUtterance(segment.id, { text: 'Hello', startTimestamp: 0, endTimestamp: 10 })

        // First set the discussion fields
        await prisma.utterance.update({
            where: { id: u1.id },
            data: { discussionStatus: 'SUBJECT_DISCUSSION', discussionSubjectId: subject.id },
        })

        // Now clear them via the editor
        await updateSpeakerSegmentData(segment.id, {
            utterances: [
                { id: u1.id, text: 'Hello', startTimestamp: 0, endTimestamp: 10, discussionStatus: null, discussionSubjectId: null },
            ],
        }, cityId)

        const updated = await prisma.utterance.findUniqueOrThrow({ where: { id: u1.id } })
        expect(updated.discussionStatus).toBeNull()
        expect(updated.discussionSubjectId).toBeNull()
    })
})
