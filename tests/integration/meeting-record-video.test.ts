/** @jest-environment node */
// The rule notRecordedHasVideo reads `noRecording` and `youtubeUrl` from the
// state that createMeetingRecord builds (newRecordState) and from the merged
// row of an update. The unit test of the rule builds that state by hand, so
// a state that drops either field passes it.
import prisma from '@/lib/db/prisma'
import { createMeetingRecord, updateMeetingRecord } from '@/lib/db/meetingLifecycle'
import { resetDatabase } from '../helpers/test-db'
import { createCity } from '../helpers/factories'

const CITY = 'c1'
const VIDEO = 'https://www.youtube.com/watch?v=abc'
const DAY = new Date(Date.UTC(2026, 2, 12, 16))

describe('a meeting with no recording has no video (#829)', () => {
    beforeEach(async () => {
        await resetDatabase(prisma)
        await createCity({ id: CITY })
    })

    test('the create refuses both, and writes nothing', async () => {
        await expect(createMeetingRecord({ cityId: CITY, id: 'm', dateTime: DAY, noRecording: true, youtubeUrl: VIDEO }))
            .rejects.toMatchObject({ code: 'notRecordedHasVideo' })
        expect(await prisma.councilMeeting.count({ where: { cityId: CITY } })).toBe(0)
    })

    test('an update that adds the video to a stored meeting with no recording is refused', async () => {
        await createMeetingRecord({ cityId: CITY, id: 'm', dateTime: DAY, noRecording: true })
        await expect(updateMeetingRecord(CITY, 'm', { youtubeUrl: VIDEO })).rejects.toMatchObject({ code: 'notRecordedHasVideo' })
    })
})
