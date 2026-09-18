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

    /** A segment of the person's, on a tag whose person was set by `personSetBy`. */
    async function speaks(personSetBy: SpeakerAssignmentSource | null, seconds: number) {
        const tag = await prisma.speakerTag.create({ data: { label: 'SPEAKER_1', personId, personSetBy } })
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

    test.each([null, 'voiceprint', 'both', 'user'] as const)('a tag whose person was set by %s is a source', async (personSetBy) => {
        const segment = await speaks(personSetBy, 120)

        expect((await findEligiblePeopleForVoiceprintGeneration(cityId)).eligiblePeople).toEqual([{ id: personId, name: 'Speaker' }])
        expect((await findLongestSpeakerSegmentForPerson(personId))?.id).toBe(segment.id)
    })

    test('the source is the longest segment that is not the transcript\'s alone', async () => {
        await speaks('transcript', 300)
        const chosen = await speaks('user', 45)

        expect((await findEligiblePeopleForVoiceprintGeneration(cityId)).count).toBe(1)
        expect((await findLongestSpeakerSegmentForPerson(personId))?.id).toBe(chosen.id)
    })
})
