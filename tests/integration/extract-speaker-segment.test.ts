/** @jest-environment node */

jest.mock('@/lib/auth', () => ({
    withUserAuthorizedToEdit: jest.fn(),
    isUserAuthorizedToEdit: jest.fn().mockResolvedValue(true),
}))

import prisma from '@/lib/db/prisma'
import { extractSpeakerSegment } from '@/lib/db/speakerSegments'
import { resetDatabase } from '../helpers/test-db'
import {
    createCity,
    createMeeting,
    createSpeakerSegment,
    createSpeakerTag,
    createTopic,
    createUtterance,
} from '../helpers/factories'

describe('extractSpeakerSegment', () => {
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

    async function createSegmentWithUtterances(count: number) {
        const segment = await createSpeakerSegment(meetingId, cityId, {
            speakerTagId, startTimestamp: 0, endTimestamp: count * 10,
        })
        const utterances = []
        for (let i = 0; i < count; i++) {
            utterances.push(await createUtterance(segment.id, {
                text: `Utterance ${i}`, startTimestamp: i * 10, endTimestamp: (i + 1) * 10,
            }))
        }
        return { segment, utterances }
    }

    test('extracts a middle range into a new unassigned segment', async () => {
        const { segment, utterances: [u0, u1, u2] } = await createSegmentWithUtterances(3)

        const result = await extractSpeakerSegment(cityId, meetingId, segment.id, u1.id, u1.id)

        expect(result).toHaveLength(3)
        const [before, middle, after] = result

        expect(before.id).toBe(segment.id)
        expect(before.utterances.map(u => u.id)).toEqual([u0.id])
        expect(before.startTimestamp).toBe(0)
        expect(before.endTimestamp).toBe(10)

        expect(middle.utterances.map(u => u.id)).toEqual([u1.id])
        expect(middle.speakerTag.personId).toBeNull()
        expect(middle.speakerTagId).not.toBe(speakerTagId)

        expect(after.id).not.toBe(segment.id)
        expect(after.utterances.map(u => u.id)).toEqual([u2.id])
        expect(after.speakerTagId).toBe(speakerTagId)
        expect(after.startTimestamp).toBe(20)
        expect(after.endTimestamp).toBe(30)
    })

    test('keeps the original segment and its trailing utterances when the range starts at the first utterance', async () => {
        const { segment, utterances: [u0, u1, u2] } = await createSegmentWithUtterances(3)

        // Metadata that must survive the split
        const summary = await prisma.summary.create({
            data: { speakerSegmentId: segment.id, text: 'Segment summary' },
        })
        const topic = await createTopic('t1')
        const topicLabel = await prisma.topicLabel.create({
            data: { speakerSegmentId: segment.id, topicId: topic.id },
        })

        const result = await extractSpeakerSegment(cityId, meetingId, segment.id, u0.id, u0.id)

        expect(result).toHaveLength(2)
        const [middle, tail] = result

        expect(middle.utterances.map(u => u.id)).toEqual([u0.id])
        expect(middle.speakerTag.personId).toBeNull()

        // The original segment stays and keeps the trailing utterances
        expect(tail.id).toBe(segment.id)
        expect(tail.utterances.map(u => u.id)).toEqual([u1.id, u2.id])
        expect(tail.speakerTagId).toBe(speakerTagId)
        expect(tail.startTimestamp).toBe(10)
        expect(tail.endTimestamp).toBe(30)

        // No utterance was cascade-deleted
        const remaining = await prisma.utterance.findMany({ where: { speakerSegmentId: segment.id } })
        expect(remaining).toHaveLength(2)

        // Summary and topic labels survive on the original segment
        expect(await prisma.summary.findUnique({ where: { id: summary.id } })).not.toBeNull()
        expect(await prisma.topicLabel.findUnique({ where: { id: topicLabel.id } })).not.toBeNull()
    })

    test('creates no tail segment when the range ends at the last utterance', async () => {
        const { segment, utterances: [u0, u1, u2] } = await createSegmentWithUtterances(3)

        const result = await extractSpeakerSegment(cityId, meetingId, segment.id, u1.id, u2.id)

        expect(result).toHaveLength(2)
        const [before, middle] = result

        expect(before.id).toBe(segment.id)
        expect(before.utterances.map(u => u.id)).toEqual([u0.id])
        expect(middle.utterances.map(u => u.id)).toEqual([u1.id, u2.id])

        const segmentCount = await prisma.speakerSegment.count({ where: { meetingId, cityId } })
        expect(segmentCount).toBe(2)
    })

    test('deletes the original segment when the range covers every utterance', async () => {
        const { segment, utterances: [u0, u1] } = await createSegmentWithUtterances(2)

        const result = await extractSpeakerSegment(cityId, meetingId, segment.id, u0.id, u1.id)

        expect(result).toHaveLength(1)
        expect(result[0].utterances.map(u => u.id)).toEqual([u0.id, u1.id])
        expect(await prisma.speakerSegment.findUnique({ where: { id: segment.id } })).toBeNull()
    })
})
