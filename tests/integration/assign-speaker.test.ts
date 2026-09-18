/** @jest-environment node */

jest.mock('@/lib/auth', () => ({
    withUserAuthorizedToEdit: jest.fn(),
    isUserAuthorizedToEdit: jest.fn().mockResolvedValue(true),
}))

import prisma from '@/lib/db/prisma'
import { assignSpeaker } from '@/lib/db/speakerTags'
import { resetDatabase } from '../helpers/test-db'
import {
    createCity,
    createMeeting,
    createPerson,
    createSpeakerSegment,
    createSpeakerTag,
} from '../helpers/factories'

describe('assignSpeaker', () => {
    let cityId: string
    let meetingId: string
    let sharedTagId: string
    let originalPersonId: string

    beforeEach(async () => {
        await resetDatabase(prisma)

        const city = await createCity({ id: 'c1' })
        cityId = city.id
        const meeting = await createMeeting(cityId, { id: 'm1' })
        meetingId = meeting.id
        const person = await createPerson(cityId, { name: 'Original' })
        originalPersonId = person.id
        const tag = await createSpeakerTag({ label: 'SPEAKER_03', personId: person.id })
        sharedTagId = tag.id
    })

    async function createSegments(count: number) {
        const segments = []
        for (let i = 0; i < count; i++) {
            segments.push(await createSpeakerSegment(meetingId, cityId, {
                speakerTagId: sharedTagId, startTimestamp: i * 10, endTimestamp: (i + 1) * 10,
            }))
        }
        return segments
    }

    async function tagIdsInOrder() {
        const segments = await prisma.speakerSegment.findMany({ where: { meetingId }, orderBy: { startTimestamp: 'asc' } })
        return segments.map(s => s.speakerTagId)
    }

    describe('allSegments', () => {
        test('changes the shared tag, so every segment of the tag changes', async () => {
            const [, target] = await createSegments(3)
            const other = await createPerson(cityId, { name: 'Actual speaker' })

            const tag = await assignSpeaker(target.id, { personId: other.id }, 'allSegments')

            expect(tag.id).toBe(sharedTagId)
            expect(tag.personId).toBe(other.id)
            expect(tag.label).toBe('SPEAKER_03')
            expect(await tagIdsInOrder()).toEqual([sharedTagId, sharedTagId, sharedTagId])
        })

        test('makes the tag the reviewer\'s, and keeps what each method said about it', async () => {
            const [target] = await createSegments(2)
            const other = await createPerson(cityId, { name: 'Actual speaker' })
            await prisma.speakerTag.update({
                where: { id: sharedTagId },
                data: {
                    personSetBy: 'voiceprint',
                    identifications: {
                        create: [
                            { method: 'voiceprint', personId: originalPersonId, confidence: 90 },
                            { method: 'transcript', personId: other.id, confidence: 85, evidence: '[00:00:10] τον λόγο έχει ο κ. Ομιλητής' },
                        ],
                    },
                },
            })

            const tag = await assignSpeaker(target.id, { personId: other.id }, 'allSegments')

            expect(tag.personSetBy).toBe('user')
            const kept = await prisma.speakerIdentification.findMany({ where: { speakerTagId: sharedTagId }, orderBy: { method: 'asc' } })
            expect(kept.map(identification => [identification.method, identification.personId])).toEqual([
                ['voiceprint', originalPersonId],
                ['transcript', other.id],
            ])
        })

        test('a typed label alone makes the tag the reviewer\'s', async () => {
            const [target] = await createSegments(1)

            const tag = await assignSpeaker(target.id, { personId: null, label: 'Κάτοικος' }, 'allSegments')

            expect(tag.personSetBy).toBe('user')
        })

        test('sets the label and clears the person in one write', async () => {
            const [target] = await createSegments(2)

            const tag = await assignSpeaker(target.id, { personId: null, label: 'Άγνωστος Ομιλητής 2' }, 'allSegments')

            expect(tag.personId).toBeNull()
            expect(tag.label).toBe('Άγνωστος Ομιλητής 2')
        })
    })

    describe('thisSegment', () => {
        test('moves one segment to a new tag and leaves the others on the shared tag', async () => {
            const [, target] = await createSegments(3)
            const other = await createPerson(cityId, { name: 'Actual speaker' })

            const tag = await assignSpeaker(target.id, { personId: other.id }, 'thisSegment')

            expect(tag.id).not.toBe(sharedTagId)
            expect(tag.personId).toBe(other.id)
            expect(tag.label).toBe('SPEAKER_03')
            expect(await tagIdsInOrder()).toEqual([sharedTagId, tag.id, sharedTagId])

            const sharedTag = await prisma.speakerTag.findUniqueOrThrow({ where: { id: sharedTagId } })
            expect(sharedTag.personId).toBe(originalPersonId)
        })

        test('the new tag is the reviewer\'s and starts without identifications; the shared tag keeps its own', async () => {
            const [, target] = await createSegments(2)
            const other = await createPerson(cityId, { name: 'Actual speaker' })
            await prisma.speakerTag.update({
                where: { id: sharedTagId },
                data: { personSetBy: 'voiceprint', identifications: { create: { method: 'voiceprint', personId: originalPersonId, confidence: 90 } } },
            })

            const tag = await assignSpeaker(target.id, { personId: other.id }, 'thisSegment')

            expect(tag.personSetBy).toBe('user')
            expect(await prisma.speakerIdentification.count({ where: { speakerTagId: tag.id } })).toBe(0)

            const sharedTag = await prisma.speakerTag.findUniqueOrThrow({ where: { id: sharedTagId }, include: { identifications: true } })
            expect(sharedTag.personSetBy).toBe('voiceprint')
            expect(sharedTag.identifications.map(identification => identification.personId)).toEqual([originalPersonId])
        })

        test('keeps the segment and the data attached to it', async () => {
            const [, target] = await createSegments(2)
            await prisma.summary.create({ data: { speakerSegmentId: target.id, text: 'Segment summary' } })

            await assignSpeaker(target.id, { personId: null }, 'thisSegment')

            const segment = await prisma.speakerSegment.findUniqueOrThrow({
                where: { id: target.id },
                include: { summary: true },
            })
            expect(segment.startTimestamp).toBe(10)
            expect(segment.endTimestamp).toBe(20)
            expect(segment.summary?.text).toBe('Segment summary')
        })

        test('uses the given label instead of the shared tag label', async () => {
            const [, target] = await createSegments(2)

            const tag = await assignSpeaker(target.id, { personId: null, label: 'Άγνωστος Ομιλητής 2' }, 'thisSegment')

            expect(tag.personId).toBeNull()
            expect(tag.label).toBe('Άγνωστος Ομιλητής 2')
        })
    })
})
