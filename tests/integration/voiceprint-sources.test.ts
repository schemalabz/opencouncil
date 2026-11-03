/** @jest-environment node */

jest.mock('@/lib/auth', () => ({
    withUserAuthorizedToEdit: jest.fn(),
    isUserAuthorizedToEdit: jest.fn().mockResolvedValue(true),
}))

// generateVoiceprint starts its task through the task registry, which loads
// every handler. Which audio may become a voiceprint is what is under test.
jest.mock('@/lib/tasks/tasks', () => ({ startTask: jest.fn() }))

import { SpeakerAssignmentSource } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import { findEligiblePeopleForVoiceprintGeneration, findLongestSpeakerSegmentForPerson } from '@/lib/tasks/generateVoiceprint'
import { resetDatabase } from '../helpers/test-db'
import { createCity, createMeeting, createPerson, createSpeakerSegment, createTaskStatus } from '../helpers/factories'

describe('voiceprint source tags', () => {
    let cityId: string
    let meetingId: string
    let personId: string

    beforeEach(async () => {
        await resetDatabase(prisma)

        const city = await createCity({ id: 'c1' })
        cityId = city.id
        const meeting = await createMeeting(cityId, { id: 'm1' })
        meetingId = meeting.id
        const person = await createPerson(cityId, { name: 'Speaker' })
        personId = person.id
    })

    /**
     * A segment of the person's, on a tag whose person was set by `personSetBy`.
     * `voiceFor` adds the voiceprint opinion of the tag, naming that person.
     */
    async function speaks(personSetBy: SpeakerAssignmentSource | null, seconds: number, voiceFor?: string) {
        const tag = await prisma.speakerTag.create({ data: { label: 'SPEAKER_1', personId, personSetBy } })
        if (voiceFor) {
            await prisma.speakerIdentification.create({
                data: { speakerTagId: tag.id, method: 'voiceprint', personId: voiceFor, actionable: true },
            })
        }
        return createSpeakerSegment(meetingId, cityId, { speakerTagId: tag.id, startTimestamp: 0, endTimestamp: seconds })
    }

    const reviewed = (createdAt: Date) => createTaskStatus(meetingId, cityId, { type: 'humanReview', status: 'succeeded', createdAt })
    const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000)

    test('a name only the transcript gave is not a voiceprint source', async () => {
        await speaks('transcript', 120)

        expect(await findEligiblePeopleForVoiceprintGeneration(cityId)).toEqual({ eligiblePeople: [], count: 0 })
        expect(await findLongestSpeakerSegmentForPerson(personId)).toBeNull()
    })

    test('it becomes one when the review of its meeting completes: the reviewer read the name and left it', async () => {
        const segment = await speaks('transcript', 120)
        await reviewed(minutesFromNow(10))

        expect((await findEligiblePeopleForVoiceprintGeneration(cityId)).eligiblePeople).toEqual([{ id: personId, name: 'Speaker' }])
        const source = await findLongestSpeakerSegmentForPerson(personId)
        expect(source?.id).toBe(segment.id)
        // What the choice was made from stays on the server.
        expect(source).not.toHaveProperty('meeting')
    })

    test('a review of an earlier transcript does not confirm it, nor does a review that has not succeeded', async () => {
        await speaks('transcript', 120)
        await reviewed(minutesFromNow(-10))
        await createTaskStatus(meetingId, cityId, { type: 'humanReview', status: 'pending', createdAt: minutesFromNow(10) })

        expect((await findEligiblePeopleForVoiceprintGeneration(cityId)).count).toBe(0)
        expect(await findLongestSpeakerSegmentForPerson(personId)).toBeNull()
    })

    test.each([null, 'voiceprint', 'user'] as const)('a tag whose person was set by %s is a source', async (personSetBy) => {
        const segment = await speaks(personSetBy, 120)

        expect((await findEligiblePeopleForVoiceprintGeneration(cityId)).eligiblePeople).toEqual([{ id: personId, name: 'Speaker' }])
        expect((await findLongestSpeakerSegmentForPerson(personId))?.id).toBe(segment.id)
    })

    test('an agreement is a source when the voiceprint is part of it', async () => {
        const segment = await speaks('both', 120, personId)

        expect((await findEligiblePeopleForVoiceprintGeneration(cityId)).eligiblePeople).toEqual([{ id: personId, name: 'Speaker' }])
        expect((await findLongestSpeakerSegmentForPerson(personId))?.id).toBe(segment.id)
    })

    describe('names that no voice vouches for (#876)', () => {
        test('a name only the municipal minutes gave is not a source', async () => {
            await speaks('minutes', 120)

            expect((await findEligiblePeopleForVoiceprintGeneration(cityId)).count).toBe(0)
            expect(await findLongestSpeakerSegmentForPerson(personId)).toBeNull()
        })

        test('the transcript and the minutes agreeing without the voice is not a source', async () => {
            await speaks('both', 120)
            expect((await findEligiblePeopleForVoiceprintGeneration(cityId)).count).toBe(0)

            const other = await createPerson(cityId, { name: 'Other' })
            await prisma.speakerTag.deleteMany({})
            await speaks('both', 120, other.id)
            expect((await findEligiblePeopleForVoiceprintGeneration(cityId)).count).toBe(0)
        })

        test('the correction from the minutes does not confirm it; a human review does', async () => {
            await speaks('minutes', 120)
            await createTaskStatus(meetingId, cityId, { type: 'fixFromMinutes', status: 'succeeded', createdAt: minutesFromNow(5) })
            expect((await findEligiblePeopleForVoiceprintGeneration(cityId)).count).toBe(0)

            await reviewed(minutesFromNow(10))
            expect((await findEligiblePeopleForVoiceprintGeneration(cityId)).eligiblePeople).toEqual([{ id: personId, name: 'Speaker' }])
        })
    })

    test('the source is the longest segment that is not the transcript\'s alone', async () => {
        await speaks('transcript', 300)
        const chosen = await speaks('user', 45)

        expect((await findEligiblePeopleForVoiceprintGeneration(cityId)).count).toBe(1)
        expect((await findLongestSpeakerSegmentForPerson(personId))?.id).toBe(chosen.id)
    })

    test('eligibility needs one source segment of at least 30 seconds', async () => {
        await speaks('user', 29.9)
        expect((await findEligiblePeopleForVoiceprintGeneration(cityId)).count).toBe(0)

        await speaks('user', 30)
        expect((await findEligiblePeopleForVoiceprintGeneration(cityId)).count).toBe(1)
    })

    test('the long segment must be on a source tag, not only on the transcript\'s', async () => {
        await speaks('transcript', 300)
        await speaks('user', 20)

        expect((await findEligiblePeopleForVoiceprintGeneration(cityId)).count).toBe(0)
    })

    test('a person who has a voiceprint, or who belongs to another city, is not eligible', async () => {
        const segment = await speaks('user', 120)
        const other = await createCity({ id: 'c2' })
        await prisma.person.update({ where: { id: personId }, data: { cityId: other.id } })
        expect((await findEligiblePeopleForVoiceprintGeneration(cityId)).count).toBe(0)

        await prisma.person.update({ where: { id: personId }, data: { cityId } })
        await prisma.voicePrint.create({
            data: { personId, sourceSegmentId: segment.id, embedding: '[]', sourceAudioUrl: 'https://example.org/a.mp3', startTimestamp: 0, endTimestamp: 30 },
        })
        expect((await findEligiblePeopleForVoiceprintGeneration(cityId)).count).toBe(0)
    })

    test('with personIds, only those people are checked; an empty list checks nobody', async () => {
        await speaks('user', 120)
        const other = await createPerson(cityId, { name: 'Other' })
        const tag = await prisma.speakerTag.create({ data: { label: 'SPEAKER_2', personId: other.id, personSetBy: 'user' } })
        await createSpeakerSegment(meetingId, cityId, { speakerTagId: tag.id, startTimestamp: 0, endTimestamp: 120 })

        expect((await findEligiblePeopleForVoiceprintGeneration(cityId)).count).toBe(2)
        expect((await findEligiblePeopleForVoiceprintGeneration(cityId, [other.id])).eligiblePeople).toEqual([{ id: other.id, name: 'Other' }])
        expect((await findEligiblePeopleForVoiceprintGeneration(cityId, [])).count).toBe(0)
    })

    test('a person with several long source tags is listed once', async () => {
        await speaks('user', 60)
        await speaks('voiceprint', 90)

        expect((await findEligiblePeopleForVoiceprintGeneration(cityId)).eligiblePeople).toEqual([{ id: personId, name: 'Speaker' }])
    })
})
