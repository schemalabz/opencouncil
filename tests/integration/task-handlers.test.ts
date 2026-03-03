/** @jest-environment node */

// Mock modules with JSX templates that can't be parsed with jsx: "preserve"
jest.mock('@/lib/tasks/generateHighlight', () => ({
    handleGenerateHighlightResult: jest.fn(),
}))

import prisma from '@/lib/db/prisma'
import { handleProcessAgendaResult } from '@/lib/tasks/processAgenda'
import { handleSummarizeResult } from '@/lib/tasks/summarize'
import { resetDatabase } from '../helpers/test-db'
import {
    createAdministrativeBody,
    createCity,
    createMeeting,
    createSpeakerSegment,
    createSpeakerTag,
    createTaskStatus,
    createUser,
    createUtterance,
} from '../helpers/factories'
import { makeSubject, makeProcessAgendaResult, makeSummarizeResult } from '../helpers/builders'

describe('handleProcessAgendaResult', () => {
    let cityId: string
    let meetingId: string

    beforeEach(async () => {
        await resetDatabase(prisma as any)

        const city = await createCity({ id: 'c1' })
        cityId = city.id
        const body = await createAdministrativeBody(cityId, {
            notificationBehavior: 'NOTIFICATIONS_DISABLED',
        })
        const meeting = await createMeeting(cityId, {
            id: 'm1',
            administrativeBodyId: body.id,
        })
        meetingId = meeting.id
    })

    test('creates subjects from agenda response', async () => {
        const task = await createTaskStatus(meetingId, cityId, { type: 'processAgenda' })

        const result = makeProcessAgendaResult([
            makeSubject({ name: 'Budget discussion', agendaItemIndex: 1, description: 'About the budget' }),
            makeSubject({ name: 'Parks maintenance', agendaItemIndex: 2, description: 'About parks' }),
            makeSubject({ name: 'Road repairs', agendaItemIndex: 3, description: 'About roads' }),
        ])

        await handleProcessAgendaResult(task.id, result)

        const dbSubjects = await prisma.subject.findMany({
            where: { councilMeetingId: meetingId, cityId },
            orderBy: { agendaItemIndex: 'asc' },
        })

        expect(dbSubjects).toHaveLength(3)
        expect(dbSubjects[0].name).toBe('Budget discussion')
        expect(dbSubjects[0].description).toBe('About the budget')
        expect(dbSubjects[0].agendaItemIndex).toBe(1)
        expect(dbSubjects[1].name).toBe('Parks maintenance')
        expect(dbSubjects[1].agendaItemIndex).toBe(2)
        expect(dbSubjects[2].name).toBe('Road repairs')
        expect(dbSubjects[2].agendaItemIndex).toBe(3)
    })

    test('preserves subject IDs when called again with same agenda items', async () => {
        const task1 = await createTaskStatus(meetingId, cityId, { type: 'processAgenda' })

        await handleProcessAgendaResult(task1.id, makeProcessAgendaResult([
            makeSubject({ name: 'Budget', agendaItemIndex: 1 }),
            makeSubject({ name: 'Roads', agendaItemIndex: 2 }),
        ]))

        const afterFirst = await prisma.subject.findMany({
            where: { councilMeetingId: meetingId, cityId },
            orderBy: { agendaItemIndex: 'asc' },
        })
        const originalIds = afterFirst.map(s => s.id)

        // Call again with same agendaItemIndex but updated names
        const task2 = await createTaskStatus(meetingId, cityId, { type: 'processAgenda' })

        await handleProcessAgendaResult(task2.id, makeProcessAgendaResult([
            makeSubject({ name: 'Budget - updated', agendaItemIndex: 1 }),
            makeSubject({ name: 'Roads - updated', agendaItemIndex: 2 }),
        ]))

        const afterSecond = await prisma.subject.findMany({
            where: { councilMeetingId: meetingId, cityId },
            orderBy: { agendaItemIndex: 'asc' },
        })

        expect(afterSecond).toHaveLength(2)
        expect(afterSecond[0].id).toBe(originalIds[0])
        expect(afterSecond[0].name).toBe('Budget - updated')
        expect(afterSecond[1].id).toBe(originalIds[1])
        expect(afterSecond[1].name).toBe('Roads - updated')
    })

    test('non-agenda subjects (BEFORE_AGENDA/OUT_OF_AGENDA) are replaced, not accumulated', async () => {
        const task1 = await createTaskStatus(meetingId, cityId, { type: 'processAgenda' })

        await handleProcessAgendaResult(task1.id, makeProcessAgendaResult([
            makeSubject({ name: 'Item 1', agendaItemIndex: 1 }),
            makeSubject({ name: 'Opening v1', agendaItemIndex: 'BEFORE_AGENDA' }),
        ]))

        const afterFirst = await prisma.subject.findMany({
            where: { councilMeetingId: meetingId, cityId },
        })
        expect(afterFirst).toHaveLength(2)

        // Second call with same structure
        const task2 = await createTaskStatus(meetingId, cityId, { type: 'processAgenda' })

        await handleProcessAgendaResult(task2.id, makeProcessAgendaResult([
            makeSubject({ name: 'Item 1 updated', agendaItemIndex: 1 }),
            makeSubject({ name: 'Opening v2', agendaItemIndex: 'BEFORE_AGENDA' }),
        ]))

        const afterSecond = await prisma.subject.findMany({
            where: { councilMeetingId: meetingId, cityId },
        })

        // 2 total (not 3 from accumulation of BEFORE_AGENDA)
        expect(afterSecond).toHaveLength(2)

        const beforeAgenda = afterSecond.filter(s => s.nonAgendaReason === 'beforeAgenda')
        expect(beforeAgenda).toHaveLength(1)
        expect(beforeAgenda[0].name).toBe('Opening v2')
    })
})

describe('handleSummarizeResult', () => {
    let cityId: string
    let meetingId: string
    let segmentId1: string
    let segmentId2: string
    let utteranceId1: string
    let utteranceId2: string

    beforeEach(async () => {
        await resetDatabase(prisma as any)

        const city = await createCity({ id: 'c1' })
        cityId = city.id
        const body = await createAdministrativeBody(cityId, {
            notificationBehavior: 'NOTIFICATIONS_DISABLED',
        })
        const meeting = await createMeeting(cityId, {
            id: 'm1',
            administrativeBodyId: body.id,
        })
        meetingId = meeting.id

        // Create transcript data: speaker tags → segments → utterances
        const tag = await createSpeakerTag({ label: 'Speaker 1' })
        const seg1 = await createSpeakerSegment(meetingId, cityId, {
            speakerTagId: tag.id,
            startTimestamp: 0,
            endTimestamp: 60,
        })
        const seg2 = await createSpeakerSegment(meetingId, cityId, {
            speakerTagId: tag.id,
            startTimestamp: 60,
            endTimestamp: 120,
        })
        segmentId1 = seg1.id
        segmentId2 = seg2.id

        const utt1 = await createUtterance(segmentId1, {
            text: 'First utterance',
            startTimestamp: 0,
            endTimestamp: 30,
        })
        const utt2 = await createUtterance(segmentId2, {
            text: 'Second utterance',
            startTimestamp: 60,
            endTimestamp: 90,
        })
        utteranceId1 = utt1.id
        utteranceId2 = utt2.id
    })

    test('creates summaries, subjects, and utterance discussion statuses', async () => {
        const task = await createTaskStatus(meetingId, cityId, { type: 'summarize' })

        const result = makeSummarizeResult({
            speakerSegmentSummaries: [
                {
                    speakerSegmentId: segmentId1,
                    topicLabels: [],
                    summary: 'Summary of segment 1',
                    type: 'SUBSTANTIAL',
                },
                {
                    speakerSegmentId: segmentId2,
                    topicLabels: [],
                    summary: 'Summary of segment 2',
                    type: 'PROCEDURAL',
                },
            ],
            subjects: [
                makeSubject({ name: 'Budget', agendaItemIndex: 1, description: 'Budget discussion' }),
            ],
            utteranceDiscussionStatuses: [
                {
                    utteranceId: utteranceId1,
                    status: 'SUBJECT_DISCUSSION' as any,
                    subjectId: 'Budget',
                },
            ],
        })

        await handleSummarizeResult(task.id, result)

        // Verify summaries
        const summaries = await prisma.summary.findMany({
            orderBy: { speakerSegment: { startTimestamp: 'asc' } },
        })
        expect(summaries).toHaveLength(2)
        expect(summaries[0].text).toBe('Summary of segment 1')
        expect(summaries[0].type).toBe('substantive')
        expect(summaries[1].text).toBe('Summary of segment 2')
        expect(summaries[1].type).toBe('procedural')

        // Verify subjects
        const subjects = await prisma.subject.findMany({
            where: { councilMeetingId: meetingId, cityId },
        })
        expect(subjects).toHaveLength(1)
        expect(subjects[0].name).toBe('Budget')

        // Verify utterance discussion status
        const utt = await prisma.utterance.findUnique({ where: { id: utteranceId1 } })
        expect(utt!.discussionStatus).toBe('SUBJECT_DISCUSSION')
        expect(utt!.discussionSubjectId).toBe(subjects[0].id)
    })

    test('upserts summaries on re-summarize (no duplicates)', async () => {
        const task1 = await createTaskStatus(meetingId, cityId, { type: 'summarize' })

        await handleSummarizeResult(task1.id, makeSummarizeResult({
            speakerSegmentSummaries: [
                {
                    speakerSegmentId: segmentId1,
                    topicLabels: [],
                    summary: 'Original summary',
                    type: 'SUBSTANTIAL',
                },
            ],
            subjects: [],
        }))

        // Second call with updated summary text
        const task2 = await createTaskStatus(meetingId, cityId, { type: 'summarize' })

        await handleSummarizeResult(task2.id, makeSummarizeResult({
            speakerSegmentSummaries: [
                {
                    speakerSegmentId: segmentId1,
                    topicLabels: [],
                    summary: 'Updated summary',
                    type: 'PROCEDURAL',
                },
            ],
            subjects: [],
        }))

        // One summary per segment, not two
        const summaries = await prisma.summary.findMany({
            where: { speakerSegmentId: segmentId1 },
        })
        expect(summaries).toHaveLength(1)
        expect(summaries[0].text).toBe('Updated summary')
        expect(summaries[0].type).toBe('procedural')
    })

    test('preserves subject IDs when re-summarized with same agenda items', async () => {
        const task1 = await createTaskStatus(meetingId, cityId, { type: 'summarize' })

        await handleSummarizeResult(task1.id, makeSummarizeResult({
            speakerSegmentSummaries: [
                {
                    speakerSegmentId: segmentId1,
                    topicLabels: [],
                    summary: 'Summary v1',
                    type: 'SUBSTANTIAL',
                },
            ],
            subjects: [
                makeSubject({ name: 'Budget', agendaItemIndex: 1, description: 'v1' }),
                makeSubject({ name: 'Roads', agendaItemIndex: 2, description: 'v1' }),
            ],
        }))

        const afterFirst = await prisma.subject.findMany({
            where: { councilMeetingId: meetingId, cityId },
            orderBy: { agendaItemIndex: 'asc' },
        })
        const originalIds = afterFirst.map(s => s.id)

        // Re-summarize with same agendaItemIndex but updated content
        const task2 = await createTaskStatus(meetingId, cityId, { type: 'summarize' })

        await handleSummarizeResult(task2.id, makeSummarizeResult({
            speakerSegmentSummaries: [
                {
                    speakerSegmentId: segmentId1,
                    topicLabels: [],
                    summary: 'Summary v2',
                    type: 'SUBSTANTIAL',
                },
            ],
            subjects: [
                makeSubject({ name: 'Budget - updated', agendaItemIndex: 1, description: 'v2' }),
                makeSubject({ name: 'Roads - updated', agendaItemIndex: 2, description: 'v2' }),
            ],
        }))

        const afterSecond = await prisma.subject.findMany({
            where: { councilMeetingId: meetingId, cityId },
            orderBy: { agendaItemIndex: 'asc' },
        })

        expect(afterSecond).toHaveLength(2)
        expect(afterSecond[0].id).toBe(originalIds[0])
        expect(afterSecond[0].name).toBe('Budget - updated')
        expect(afterSecond[0].description).toBe('v2')
        expect(afterSecond[1].id).toBe(originalIds[1])
        expect(afterSecond[1].name).toBe('Roads - updated')
    })

    test('user-created highlights survive re-summarize', async () => {
        // First summarize creates subjects
        const task1 = await createTaskStatus(meetingId, cityId, { type: 'summarize' })

        await handleSummarizeResult(task1.id, makeSummarizeResult({
            speakerSegmentSummaries: [
                {
                    speakerSegmentId: segmentId1,
                    topicLabels: [],
                    summary: 'Summary v1',
                    type: 'SUBSTANTIAL',
                },
            ],
            subjects: [
                makeSubject({ name: 'Budget', agendaItemIndex: 1 }),
            ],
        }))

        const subject = await prisma.subject.findFirst({
            where: { councilMeetingId: meetingId, agendaItemIndex: 1 },
        })

        // User creates a highlight linked to this subject (from the UI)
        const user = await createUser('editor@test.com')
        const userHighlight = await prisma.highlight.create({
            data: {
                name: 'Important budget moment',
                meetingId,
                cityId,
                subjectId: subject!.id,
                createdById: user.id,
            },
        })

        // Also create an auto-generated highlight (no createdById)
        const autoHighlight = await prisma.highlight.create({
            data: {
                name: 'Budget',
                meetingId,
                cityId,
                subjectId: subject!.id,
            },
        })

        // Re-summarize — updates the same subject
        const task2 = await createTaskStatus(meetingId, cityId, { type: 'summarize' })

        await handleSummarizeResult(task2.id, makeSummarizeResult({
            speakerSegmentSummaries: [
                {
                    speakerSegmentId: segmentId1,
                    topicLabels: [],
                    summary: 'Summary v2',
                    type: 'SUBSTANTIAL',
                },
            ],
            subjects: [
                makeSubject({ name: 'Budget - updated', agendaItemIndex: 1 }),
            ],
        }))

        const highlights = await prisma.highlight.findMany({
            where: { meetingId, cityId },
        })

        // User-created highlight should survive
        const surviving = highlights.find(h => h.id === userHighlight.id)
        expect(surviving).toBeDefined()
        expect(surviving!.subjectId).toBe(subject!.id)
        expect(surviving!.createdById).toBe(user.id)

        // Auto-generated highlight should be deleted (replaced by createHighlightInTx if contributions have utterance refs)
        const autoSurviving = highlights.find(h => h.id === autoHighlight.id)
        expect(autoSurviving).toBeUndefined()
    })
})

describe('Pipeline: processAgenda → summarize', () => {
    let cityId: string
    let meetingId: string

    beforeEach(async () => {
        await resetDatabase(prisma as any)

        const city = await createCity({ id: 'c1' })
        cityId = city.id
        const body = await createAdministrativeBody(cityId, {
            notificationBehavior: 'NOTIFICATIONS_DISABLED',
        })
        const meeting = await createMeeting(cityId, {
            id: 'm1',
            administrativeBodyId: body.id,
        })
        meetingId = meeting.id
    })

    test('subject IDs survive the full processAgenda → summarize sequence', async () => {
        // Step 1: processAgenda creates subjects
        const agendaTask = await createTaskStatus(meetingId, cityId, { type: 'processAgenda' })

        await handleProcessAgendaResult(agendaTask.id, makeProcessAgendaResult([
            makeSubject({ name: 'Budget', agendaItemIndex: 1, description: 'From agenda' }),
            makeSubject({ name: 'Roads', agendaItemIndex: 2, description: 'From agenda' }),
            makeSubject({ name: 'Parks', agendaItemIndex: 3, description: 'From agenda' }),
        ]))

        const afterAgenda = await prisma.subject.findMany({
            where: { councilMeetingId: meetingId, cityId },
            orderBy: { agendaItemIndex: 'asc' },
        })
        const agendaIds = afterAgenda.map(s => s.id)
        expect(afterAgenda).toHaveLength(3)

        // Step 2: Simulate transcription by creating speaker segments + utterances
        const tag = await createSpeakerTag({ label: 'Mayor' })
        const seg = await createSpeakerSegment(meetingId, cityId, {
            speakerTagId: tag.id,
            startTimestamp: 0,
            endTimestamp: 120,
        })
        const utt = await createUtterance(seg.id, {
            text: 'Discussion about the budget',
            startTimestamp: 0,
            endTimestamp: 60,
        })

        // Step 3: summarize updates subjects (same agendaItemIndex)
        const summarizeTask = await createTaskStatus(meetingId, cityId, { type: 'summarize' })

        await handleSummarizeResult(summarizeTask.id, makeSummarizeResult({
            speakerSegmentSummaries: [
                {
                    speakerSegmentId: seg.id,
                    topicLabels: [],
                    summary: 'The mayor discussed the annual budget',
                    type: 'SUBSTANTIAL',
                },
            ],
            subjects: [
                makeSubject({
                    name: 'Budget - detailed',
                    agendaItemIndex: 1,
                    description: 'Updated by summarize',
                    speakerContributions: [
                        { speakerId: null, speakerName: 'Mayor', text: 'Proposed budget increase' },
                    ],
                }),
                makeSubject({ name: 'Roads - detailed', agendaItemIndex: 2, description: 'Updated by summarize' }),
                makeSubject({ name: 'Parks - detailed', agendaItemIndex: 3, description: 'Updated by summarize' }),
            ],
            utteranceDiscussionStatuses: [
                {
                    utteranceId: utt.id,
                    status: 'SUBJECT_DISCUSSION' as any,
                    subjectId: 'Budget - detailed',
                },
            ],
        }))

        // Assert: subject IDs are preserved from processAgenda
        const afterSummarize = await prisma.subject.findMany({
            where: { councilMeetingId: meetingId, cityId },
            orderBy: { agendaItemIndex: 'asc' },
        })

        expect(afterSummarize).toHaveLength(3)
        expect(afterSummarize.map(s => s.id)).toEqual(agendaIds)

        // Assert: content is updated from summarize
        expect(afterSummarize[0].name).toBe('Budget - detailed')
        expect(afterSummarize[0].description).toBe('Updated by summarize')
        expect(afterSummarize[1].name).toBe('Roads - detailed')
        expect(afterSummarize[2].name).toBe('Parks - detailed')

        // Assert: contributions were created
        const contributions = await prisma.speakerContribution.findMany({
            where: { subjectId: agendaIds[0] },
        })
        expect(contributions).toHaveLength(1)
        expect(contributions[0].text).toBe('Proposed budget increase')

        // Assert: summaries were created
        const summaries = await prisma.summary.findMany()
        expect(summaries).toHaveLength(1)
        expect(summaries[0].text).toBe('The mayor discussed the annual budget')

        // Assert: utterance discussion status was set
        const updatedUtt = await prisma.utterance.findUnique({ where: { id: utt.id } })
        expect(updatedUtt!.discussionStatus).toBe('SUBJECT_DISCUSSION')
        expect(updatedUtt!.discussionSubjectId).toBe(agendaIds[0])
    })
})
