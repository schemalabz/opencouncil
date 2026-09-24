/** @jest-environment node */

// Mock modules with JSX templates that can't be parsed with jsx: "preserve"
jest.mock('@/lib/tasks/generateHighlight', () => ({
    handleGenerateHighlightResult: jest.fn(),
}))

import type { MeetingScheduleStatus } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import { findDecisionPollCandidates } from '@/lib/tasks/pollDecisions'
import { getPollableMeetingDateRange } from '@/lib/tasks/pollDecisionsBackoff'
import { requestTranscribeInternal } from '@/lib/tasks/transcribeInternal'
import { getMeetingUploadLists, getUpcomingMeetings } from '@/lib/db/meetings'
import { releaseNotifications } from '@/lib/notifications/deliver'
import { resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting, createSubject, createUser, signInAsSuperAdmin } from '../helpers/factories'

const CITY = 'c1'
const STATUSES: MeetingScheduleStatus[] = ['scheduled', 'postponed', 'cancelled']

/** Postponed and cancelled meetings did not take place on their date: no pipeline may treat them as held. */
describe('pipelines skip postponed and cancelled meetings', () => {
    let administrativeBodyId: string

    beforeEach(async () => {
        await resetDatabase(prisma)
        await createCity({ id: CITY, diavgeiaUid: 'DIAV-1', status: 'supported' })
        administrativeBodyId = (await createAdministrativeBody(CITY, { type: 'council' })).id
    })

    test('decision polling', async () => {
        const { gte, lte } = getPollableMeetingDateRange()
        const dateTime = new Date((gte.getTime() + lte.getTime()) / 2)
        for (const status of STATUSES) {
            await createMeeting(CITY, { id: status, dateTime, administrativeBodyId, kind: 'regular', scheduleStatus: status })
            await createSubject(status, CITY, { agendaItemIndex: 1 })
        }
        expect((await findDecisionPollCandidates()).map((m) => m.id)).toEqual(['scheduled'])
    })

    test('the upload lists of the review dashboard', async () => {
        await signInAsSuperAdmin()
        for (const status of STATUSES) {
            await createMeeting(CITY, { id: `past-${status}`, dateTime: new Date(Date.now() - 2 * 86_400_000), administrativeBodyId, kind: 'regular', scheduleStatus: status })
            await createMeeting(CITY, { id: `future-${status}`, dateTime: new Date(Date.now() + 2 * 86_400_000), administrativeBodyId, kind: 'regular', scheduleStatus: status })
        }
        const { needsUpload, scheduled } = await getMeetingUploadLists(true)
        expect(needsUpload.map((m) => m.id)).toEqual(['past-scheduled'])
        expect(scheduled.map((m) => m.id)).toEqual(['future-scheduled'])
    })

    test('the upcoming meetings of the landing page', async () => {
        for (const status of STATUSES) {
            await createMeeting(CITY, { id: status, dateTime: new Date(Date.now() + 86_400_000), administrativeBodyId, kind: 'regular', scheduleStatus: status, released: true })
        }
        expect((await getUpcomingMeetings('greece')).map((m) => m.id)).toEqual(['scheduled'])
    })

    test.each([
        ['cancelled', { scheduleStatus: 'cancelled' as const }, 'Meeting is cancelled'],
        ['postponed', { scheduleStatus: 'postponed' as const }, 'Meeting is postponed'],
        ['closed to the public', { closedToPublic: true }, 'closed to the public'],
        ['held by circulation', { format: 'byCirculation' as const }, 'by circulation'],
    ])('transcription refuses a meeting that is %s', async (_label, data, message) => {
        await createMeeting(CITY, { id: 'm', administrativeBodyId, kind: 'regular', ...data })
        await expect(requestTranscribeInternal('https://youtu.be/abc', 'm', CITY)).rejects.toThrow(message)
    })

    test('a pending notice before a cancelled meeting is not sent; a notice after it is', async () => {
        const user = await createUser('reader@integration.test')
        await createMeeting(CITY, { id: 'm', administrativeBodyId, kind: 'regular', scheduleStatus: 'cancelled' })
        const ids: string[] = []
        for (const type of ['beforeMeeting', 'afterMeeting'] as const) {
            const notification = await prisma.notification.create({
                data: {
                    userId: user.id, cityId: CITY, meetingId: 'm', type,
                    deliveries: { create: { medium: 'email', email: user.email, status: 'pending', title: 'Τίτλος', body: '<p>Κείμενο</p>' } },
                },
            })
            ids.push(notification.id)
        }

        const result = await releaseNotifications(ids)
        expect(result).toMatchObject({ emailsSent: 1, skipped: 1, failed: 0 })
        const deliveries = await prisma.notificationDelivery.findMany({ include: { notification: { select: { type: true } } } })
        const statusOf = Object.fromEntries(deliveries.map((d) => [d.notification.type, d.status]))
        expect(statusOf).toEqual({ beforeMeeting: 'skipped', afterMeeting: 'sent' })
    })
})
