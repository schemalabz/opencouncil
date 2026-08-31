/** @jest-environment node */

// Mock modules with JSX templates that can't be parsed with jsx: "preserve"
jest.mock('@/lib/tasks/generateHighlight', () => ({
    handleGenerateHighlightResult: jest.fn(),
}))

// Mock auth for resolveCandidateConflict tests
jest.mock('@/lib/auth', () => ({
    withUserAuthorizedToEdit: jest.fn(),
    isUserAuthorizedToEdit: jest.fn().mockResolvedValue(true),
}))

import prisma from '@/lib/db/prisma'
import { handleProcessAgendaResult } from '@/lib/tasks/processAgenda'
import { handleSummarizeResult } from '@/lib/tasks/summarize'
import { handlePollDecisionsResult, resolveCandidateConflict } from '@/lib/tasks/pollDecisions'
import { getConflictingCandidates, applyCandidateConflictResolution } from '@/lib/db/decisionCandidates'
import { resetDatabase } from '../helpers/test-db'
import {
    createAdministrativeBody,
    createCity,
    createMeeting,
    createPerson,
    createSubject,
    createSpeakerSegment,
    createSpeakerTag,
    createTaskStatus,
    createUser,
    createUtterance,
} from '../helpers/factories'
import { makeSubject, makeProcessAgendaResult, makeSummarizeResult, makePollDecisionsMatch, makePollDecisionsResult, makeExtractedDecision } from '../helpers/builders'

describe('handleProcessAgendaResult', () => {
    let cityId: string
    let meetingId: string

    beforeEach(async () => {
        await resetDatabase(prisma)

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

    test('prunes agenda items the new agenda no longer lists, keeping the rest', async () => {
        const task1 = await createTaskStatus(meetingId, cityId, { type: 'processAgenda' })

        await handleProcessAgendaResult(task1.id, makeProcessAgendaResult([
            makeSubject({ name: 'Budget', agendaItemIndex: 1 }),
            makeSubject({ name: 'Roads', agendaItemIndex: 2 }),
            makeSubject({ name: 'Dropped later', agendaItemIndex: 3 }),
        ]))

        const afterFirst = await prisma.subject.findMany({
            where: { councilMeetingId: meetingId, cityId },
            orderBy: { agendaItemIndex: 'asc' },
        })
        expect(afterFirst).toHaveLength(3)
        const keptIds = [afterFirst[0].id, afterFirst[1].id]

        // The agenda shrinks: item 3 is gone.
        const task2 = await createTaskStatus(meetingId, cityId, { type: 'processAgenda' })
        await handleProcessAgendaResult(task2.id, makeProcessAgendaResult([
            makeSubject({ name: 'Budget', agendaItemIndex: 1 }),
            makeSubject({ name: 'Roads', agendaItemIndex: 2 }),
        ]))

        const afterSecond = await prisma.subject.findMany({
            where: { councilMeetingId: meetingId, cityId },
            orderBy: { agendaItemIndex: 'asc' },
        })
        expect(afterSecond).toHaveLength(2)
        expect(afterSecond.map((s) => s.id)).toEqual(keptIds)
    })

    test('a renumbered agenda keeps every id with its own subject', async () => {
        const task1 = await createTaskStatus(meetingId, cityId, { type: 'processAgenda' })
        await handleProcessAgendaResult(task1.id, makeProcessAgendaResult([
            makeSubject({ name: 'Budget discussion', agendaItemIndex: 1 }),
            makeSubject({ name: 'Parks maintenance', agendaItemIndex: 2 }),
            makeSubject({ name: 'Road repairs', agendaItemIndex: 3 }),
        ]))

        const afterFirst = await prisma.subject.findMany({
            where: { councilMeetingId: meetingId, cityId },
            orderBy: { agendaItemIndex: 'asc' },
        })
        const idByName = new Map(afterFirst.map((s) => [s.name, s.id]))

        // Item 1 is withdrawn, so the council republishes the agenda with the
        // remaining two renumbered. Matching on the new indices alone would
        // give "Parks maintenance" the id the public knows as "Budget
        // discussion" — a link would open the wrong subject.
        const task2 = await createTaskStatus(meetingId, cityId, { type: 'processAgenda' })
        await handleProcessAgendaResult(task2.id, makeProcessAgendaResult([
            makeSubject({ name: 'Parks maintenance', agendaItemIndex: 1 }),
            makeSubject({ name: 'Road repairs', agendaItemIndex: 2 }),
        ]))

        const afterSecond = await prisma.subject.findMany({
            where: { councilMeetingId: meetingId, cityId },
            orderBy: { agendaItemIndex: 'asc' },
        })

        expect(afterSecond).toHaveLength(2)
        expect(afterSecond[0].name).toBe('Parks maintenance')
        expect(afterSecond[0].id).toBe(idByName.get('Parks maintenance'))
        expect(afterSecond[0].agendaItemIndex).toBe(1)
        expect(afterSecond[1].name).toBe('Road repairs')
        expect(afterSecond[1].id).toBe(idByName.get('Road repairs'))
        // The withdrawn item is gone, and its id was not handed to anyone.
        expect(afterSecond.map((s) => s.id)).not.toContain(idByName.get('Budget discussion'))
    })

    test('a reworded item in the same slot keeps its id', async () => {
        const task1 = await createTaskStatus(meetingId, cityId, { type: 'processAgenda' })
        await handleProcessAgendaResult(task1.id, makeProcessAgendaResult([
            makeSubject({ name: 'Budget discussion', agendaItemIndex: 1 }),
        ]))
        const [first] = await prisma.subject.findMany({ where: { councilMeetingId: meetingId, cityId } })

        const task2 = await createTaskStatus(meetingId, cityId, { type: 'processAgenda' })
        await handleProcessAgendaResult(task2.id, makeProcessAgendaResult([
            makeSubject({ name: 'Budget discussion for fiscal year 2027', agendaItemIndex: 1 }),
        ]))

        const after = await prisma.subject.findMany({ where: { councilMeetingId: meetingId, cityId } })
        expect(after).toHaveLength(1)
        expect(after[0].id).toBe(first.id)
        expect(after[0].name).toBe('Budget discussion for fiscal year 2027')
    })

    test('an authoritative empty agenda prunes every agenda subject', async () => {
        const task1 = await createTaskStatus(meetingId, cityId, { type: 'processAgenda' })
        await handleProcessAgendaResult(task1.id, makeProcessAgendaResult([
            makeSubject({ name: 'Budget', agendaItemIndex: 1 }),
        ]))
        expect(await prisma.subject.count({ where: { councilMeetingId: meetingId, cityId } })).toBe(1)

        // Some sessions (λογοδοσία) genuinely have no subjects; success with
        // an empty array is authoritative.
        const task2 = await createTaskStatus(meetingId, cityId, { type: 'processAgenda' })
        await handleProcessAgendaResult(task2.id, makeProcessAgendaResult([]))

        expect(await prisma.subject.count({ where: { councilMeetingId: meetingId, cityId } })).toBe(0)
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
        await resetDatabase(prisma)

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
        await resetDatabase(prisma)

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

describe('handlePollDecisionsResult', () => {
    let cityId: string
    let meetingId1: string
    let meetingId2: string

    beforeEach(async () => {
        await resetDatabase(prisma)

        const city = await createCity({ id: 'c1' })
        cityId = city.id
        const body = await createAdministrativeBody(cityId, {
            notificationBehavior: 'NOTIFICATIONS_DISABLED',
        })
        const meeting1 = await createMeeting(cityId, {
            id: 'm1',
            administrativeBodyId: body.id,
        })
        const meeting2 = await createMeeting(cityId, {
            id: 'm2',
            administrativeBodyId: body.id,
        })
        meetingId1 = meeting1.id
        meetingId2 = meeting2.id
    })

    test('normal matches (no conflict) — both decisions created', async () => {
        const subjectA = await createSubject(meetingId1, cityId, { name: 'Subject A', agendaItemIndex: 1 })
        const subjectB = await createSubject(meetingId1, cityId, { name: 'Subject B', agendaItemIndex: 2 })
        const task = await createTaskStatus(meetingId1, cityId, { type: 'pollDecisions' })

        await handlePollDecisionsResult(task.id, makePollDecisionsResult({
            matches: [
                makePollDecisionsMatch({ subjectId: subjectA.id, ada: 'ADA-1' }),
                makePollDecisionsMatch({ subjectId: subjectB.id, ada: 'ADA-2' }),
            ],
        }))

        const decisions = await prisma.decision.findMany({ orderBy: { ada: 'asc' } })
        expect(decisions).toHaveLength(2)
        expect(decisions[0].ada).toBe('ADA-1')
        expect(decisions[0].subjectId).toBe(subjectA.id)
        expect(decisions[1].ada).toBe('ADA-2')
        expect(decisions[1].subjectId).toBe(subjectB.id)

        // No conflicting candidates recorded
        const candidates = await prisma.decisionCandidate.findMany()
        expect(candidates).toHaveLength(0)
    })

    test('ADA conflict detected — conflicting candidate recorded, other matches still saved', async () => {
        // Meeting 1 subject already has a decision with ADA-X
        const subjectA = await createSubject(meetingId1, cityId, { name: 'Subject A', agendaItemIndex: 1 })
        await prisma.decision.create({
            data: { subjectId: subjectA.id, ada: 'ADA-X', pdfUrl: 'https://example.com/a.pdf' },
        })

        // Meeting 2 subjects — poll returns ADA-X for subjectB (conflict) and ADA-Y for subjectC (no conflict)
        const subjectB = await createSubject(meetingId2, cityId, { name: 'Subject B', agendaItemIndex: 1 })
        const subjectC = await createSubject(meetingId2, cityId, { name: 'Subject C', agendaItemIndex: 2 })
        const task = await createTaskStatus(meetingId2, cityId, { type: 'pollDecisions' })

        await handlePollDecisionsResult(task.id, makePollDecisionsResult({
            matches: [
                makePollDecisionsMatch({ subjectId: subjectB.id, ada: 'ADA-X' }),
                makePollDecisionsMatch({ subjectId: subjectC.id, ada: 'ADA-Y' }),
            ],
        }))

        // The conflicting proposal is recorded as an unresolved candidate; no decision created
        const candidateB = await prisma.decisionCandidate.findUnique({ where: { cityId_ada: { cityId, ada: 'ADA-X' } } })
        expect(candidateB).not.toBeNull()
        expect(candidateB!.subjectId).toBe(subjectB.id)
        expect(candidateB!.decisionId).toBeNull()
        expect(candidateB!.dismissedAt).toBeNull()
        const decisionB = await prisma.decision.findUnique({ where: { subjectId: subjectB.id } })
        expect(decisionB).toBeNull()

        // SubjectC should have a normal decision, no candidate recorded for it
        const candidateY = await prisma.decisionCandidate.findUnique({ where: { cityId_ada: { cityId, ada: 'ADA-Y' } } })
        expect(candidateY).toBeNull()
        const decisionC = await prisma.decision.findUnique({ where: { subjectId: subjectC.id } })
        expect(decisionC).not.toBeNull()
        expect(decisionC!.ada).toBe('ADA-Y')

        // Original decision on subjectA is untouched
        const decisionA = await prisma.decision.findUnique({ where: { subjectId: subjectA.id } })
        expect(decisionA).not.toBeNull()
        expect(decisionA!.ada).toBe('ADA-X')
    })

    test('same-subject update (not a conflict) — normal upsert', async () => {
        const subjectA = await createSubject(meetingId1, cityId, { name: 'Subject A', agendaItemIndex: 1 })
        // SubjectA already has a decision with ADA-X
        await prisma.decision.create({
            data: { subjectId: subjectA.id, ada: 'ADA-X', pdfUrl: 'https://example.com/old.pdf' },
        })

        const task = await createTaskStatus(meetingId1, cityId, { type: 'pollDecisions' })

        await handlePollDecisionsResult(task.id, makePollDecisionsResult({
            matches: [
                makePollDecisionsMatch({
                    subjectId: subjectA.id,
                    ada: 'ADA-X',
                    pdfUrl: 'https://example.com/new.pdf',
                }),
            ],
        }))

        // Decision should be updated (not conflict)
        const decision = await prisma.decision.findUnique({ where: { subjectId: subjectA.id } })
        expect(decision).not.toBeNull()
        expect(decision!.ada).toBe('ADA-X')
        expect(decision!.pdfUrl).toBe('https://example.com/new.pdf')

        // No conflicting candidates recorded
        expect(await prisma.decisionCandidate.count()).toBe(0)
    })

    test('multiple conflicts in one poll — both recorded as candidates, non-conflicting matches saved', async () => {
        // Existing decisions in meeting 1
        const subjectA = await createSubject(meetingId1, cityId, { name: 'Subject A', agendaItemIndex: 1 })
        const subjectB = await createSubject(meetingId1, cityId, { name: 'Subject B', agendaItemIndex: 2 })
        await prisma.decision.create({
            data: { subjectId: subjectA.id, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf' },
        })
        await prisma.decision.create({
            data: { subjectId: subjectB.id, ada: 'ADA-Y', pdfUrl: 'https://example.com/y.pdf' },
        })

        // Meeting 2 subjects — poll returns conflicting ADAs for two subjects, one clean match
        const subjectC = await createSubject(meetingId2, cityId, { name: 'Subject C', agendaItemIndex: 1 })
        const subjectD = await createSubject(meetingId2, cityId, { name: 'Subject D', agendaItemIndex: 2 })
        const subjectE = await createSubject(meetingId2, cityId, { name: 'Subject E', agendaItemIndex: 3 })
        const task = await createTaskStatus(meetingId2, cityId, { type: 'pollDecisions' })

        await handlePollDecisionsResult(task.id, makePollDecisionsResult({
            matches: [
                makePollDecisionsMatch({ subjectId: subjectC.id, ada: 'ADA-X' }),
                makePollDecisionsMatch({ subjectId: subjectD.id, ada: 'ADA-Y' }),
                makePollDecisionsMatch({ subjectId: subjectE.id, ada: 'ADA-Z' }),
            ],
        }))

        // Both conflicting proposals recorded as unresolved candidates
        const candX = await prisma.decisionCandidate.findUnique({ where: { cityId_ada: { cityId, ada: 'ADA-X' } } })
        expect(candX!.subjectId).toBe(subjectC.id)
        const candY = await prisma.decisionCandidate.findUnique({ where: { cityId_ada: { cityId, ada: 'ADA-Y' } } })
        expect(candY!.subjectId).toBe(subjectD.id)

        // SubjectE should have a normal decision
        const decisionE = await prisma.decision.findUnique({ where: { subjectId: subjectE.id } })
        expect(decisionE).not.toBeNull()
        expect(decisionE!.ada).toBe('ADA-Z')

        // No decisions created for the conflicting subjects
        const decisionC = await prisma.decision.findUnique({ where: { subjectId: subjectC.id } })
        expect(decisionC).toBeNull()
        const decisionD = await prisma.decision.findUnique({ where: { subjectId: subjectD.id } })
        expect(decisionD).toBeNull()
    })

    test('subsequent poll records an additional conflicting candidate; both persist', async () => {
        // SubjectA in meeting 1 already owns ADA-X
        const subjectA = await createSubject(meetingId1, cityId, { name: 'Subject A', agendaItemIndex: 1 })
        await prisma.decision.create({
            data: { subjectId: subjectA.id, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf' },
        })

        // SubjectB in meeting 2 — first poll proposes ADA-X (conflict)
        const subjectB = await createSubject(meetingId2, cityId, { name: 'Subject B', agendaItemIndex: 1 })
        const task1 = await createTaskStatus(meetingId2, cityId, { type: 'pollDecisions' })

        await handlePollDecisionsResult(task1.id, makePollDecisionsResult({
            matches: [makePollDecisionsMatch({ subjectId: subjectB.id, ada: 'ADA-X' })],
        }))

        // Second poll — same subject now matches ADA-Y (also owned by someone else)
        const subjectC = await createSubject(meetingId1, cityId, { name: 'Subject C', agendaItemIndex: 2 })
        await prisma.decision.create({
            data: { subjectId: subjectC.id, ada: 'ADA-Y', pdfUrl: 'https://example.com/y.pdf' },
        })

        const task2 = await createTaskStatus(meetingId2, cityId, { type: 'pollDecisions' })

        await handlePollDecisionsResult(task2.id, makePollDecisionsResult({
            matches: [makePollDecisionsMatch({ subjectId: subjectB.id, ada: 'ADA-Y' })],
        }))

        // Candidates persist as the record of every proposal — one per ADA
        const candidates = await prisma.decisionCandidate.findMany({ orderBy: { ada: 'asc' } })
        expect(candidates).toHaveLength(2)
        expect(candidates[0].ada).toBe('ADA-X')
        expect(candidates[0].subjectId).toBe(subjectB.id)
        expect(candidates[1].ada).toBe('ADA-Y')
        expect(candidates[1].subjectId).toBe(subjectB.id)
    })

    test('a decision on the claiming subject makes its old claim a stale non-conflict', async () => {
        const { getConflictingCandidates } = await import('@/lib/db/decisionCandidates')
        // SubjectA owns ADA-X; SubjectB has an unresolved candidate claiming it
        const subjectA = await createSubject(meetingId1, cityId, { name: 'Subject A', agendaItemIndex: 1 })
        await prisma.decision.create({
            data: { subjectId: subjectA.id, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf' },
        })
        const subjectB = await createSubject(meetingId2, cityId, { name: 'Subject B', agendaItemIndex: 1 })
        await prisma.decisionCandidate.create({
            data: {
                cityId, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf',
                readStatus: 'unread', councilMeetingId: meetingId2, subjectId: subjectB.id,
            },
        })
        expect(await getConflictingCandidates({ cityId })).toHaveLength(1)

        // New poll gives subjectB a different, non-conflicting ADA
        const task = await createTaskStatus(meetingId2, cityId, { type: 'pollDecisions' })
        await handlePollDecisionsResult(task.id, makePollDecisionsResult({
            matches: [makePollDecisionsMatch({ subjectId: subjectB.id, ada: 'ADA-NEW' })],
        }))

        // Decision created; the old claim stays recorded but is no longer an
        // actionable conflict (the claiming subject has its own decision now)
        const decision = await prisma.decision.findUnique({ where: { subjectId: subjectB.id } })
        expect(decision!.ada).toBe('ADA-NEW')
        expect(await prisma.decisionCandidate.count()).toBe(1)
        expect(await getConflictingCandidates({ cityId })).toHaveLength(0)
    })
})

describe('resolveCandidateConflict', () => {
    let cityId: string
    let meetingId1: string
    let meetingId2: string

    beforeEach(async () => {
        await resetDatabase(prisma)

        const city = await createCity({ id: 'c1' })
        cityId = city.id
        const body = await createAdministrativeBody(cityId, {
            notificationBehavior: 'NOTIFICATIONS_DISABLED',
        })
        const meeting1 = await createMeeting(cityId, { id: 'm1', administrativeBodyId: body.id })
        const meeting2 = await createMeeting(cityId, { id: 'm2', administrativeBodyId: body.id })
        meetingId1 = meeting1.id
        meetingId2 = meeting2.id
    })

    async function createClaim(ada: string, subjectId: string, extra: Record<string, unknown> = {}) {
        return prisma.decisionCandidate.create({
            data: {
                cityId, ada,
                pdfUrl: `https://diavgeia.gov.gr/doc/${ada}`,
                readStatus: 'unread',
                councilMeetingId: meetingId2,
                subjectId,
                ...extra,
            },
        })
    }

    test('dismiss — marks the candidate dismissed without moving the decision', async () => {
        const subjectA = await createSubject(meetingId1, cityId, { name: 'Subject A', agendaItemIndex: 1 })
        await prisma.decision.create({
            data: { subjectId: subjectA.id, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf', title: 'Original' },
        })
        const subjectB = await createSubject(meetingId2, cityId, { name: 'Subject B', agendaItemIndex: 1 })
        const claim = await createClaim('ADA-X', subjectB.id)

        await resolveCandidateConflict(claim.id, 'dismiss')

        const updated = await prisma.decisionCandidate.findUnique({ where: { id: claim.id } })
        expect(updated!.dismissedAt).not.toBeNull()
        expect(updated!.decisionId).toBeNull()

        // Original decision untouched, no decision on claiming subject
        const decisionA = await prisma.decision.findUnique({ where: { subjectId: subjectA.id } })
        expect(decisionA!.ada).toBe('ADA-X')
        expect(await prisma.decision.findUnique({ where: { subjectId: subjectB.id } })).toBeNull()
    })

    test('reassign — moves the decision to the claiming subject and links the candidate', async () => {
        const subjectA = await createSubject(meetingId1, cityId, { name: 'Subject A', agendaItemIndex: 1 })
        await prisma.decision.create({
            data: {
                subjectId: subjectA.id,
                ada: 'ADA-X',
                pdfUrl: 'https://example.com/x.pdf',
                title: 'Original Title',
                protocolNumber: '42/2025',
            },
        })
        const subjectB = await createSubject(meetingId2, cityId, { name: 'Subject B', agendaItemIndex: 1 })
        const claim = await createClaim('ADA-X', subjectB.id, { decisionNumber: '17/2025' })

        await resolveCandidateConflict(claim.id, 'reassign')

        // Decision moved to subjectB, enriched with the candidate's reading
        const decisionB = await prisma.decision.findUnique({ where: { subjectId: subjectB.id } })
        expect(decisionB).not.toBeNull()
        expect(decisionB!.ada).toBe('ADA-X')
        expect(decisionB!.pdfUrl).toBe('https://example.com/x.pdf')
        expect(decisionB!.title).toBe('Original Title')
        expect(decisionB!.protocolNumber).toBe('42/2025')
        expect(decisionB!.decisionNumber).toBe('17/2025')

        // No decision on original subject; candidate linked to the moved decision
        expect(await prisma.decision.findUnique({ where: { subjectId: subjectA.id } })).toBeNull()
        const updated = await prisma.decisionCandidate.findUnique({ where: { id: claim.id } })
        expect(updated!.decisionId).toBe(decisionB!.id)
    })

    test('reassign — when the holding decision was deleted, completes the assignment from candidate data', async () => {
        // Semantics change vs claimedAda (2026-08-14): the old claim carried no
        // document data, so a vanished holder could only clear the claim. A
        // candidate carries everything needed, so admin intent is honoured by
        // creating the decision.
        const subjectB = await createSubject(meetingId2, cityId, { name: 'Subject B', agendaItemIndex: 1 })
        const claim = await createClaim('ADA-X', subjectB.id, { title: 'From candidate', decisionNumber: '9/2025' })

        await resolveCandidateConflict(claim.id, 'reassign')

        const decisionB = await prisma.decision.findUnique({ where: { subjectId: subjectB.id } })
        expect(decisionB).not.toBeNull()
        expect(decisionB!.ada).toBe('ADA-X')
        expect(decisionB!.title).toBe('From candidate')
        expect(decisionB!.decisionNumber).toBe('9/2025')

        const updated = await prisma.decisionCandidate.findUnique({ where: { id: claim.id } })
        expect(updated!.decisionId).toBe(decisionB!.id)
    })

    test('reassign — when claiming subject already has a decision, dismisses instead', async () => {
        const subjectA = await createSubject(meetingId1, cityId, { name: 'Subject A', agendaItemIndex: 1 })
        await prisma.decision.create({
            data: { subjectId: subjectA.id, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf' },
        })
        const subjectB = await createSubject(meetingId2, cityId, { name: 'Subject B', agendaItemIndex: 1 })
        await prisma.decision.create({
            data: { subjectId: subjectB.id, ada: 'ADA-Y', pdfUrl: 'https://example.com/y.pdf' },
        })
        const claim = await createClaim('ADA-X', subjectB.id)

        await resolveCandidateConflict(claim.id, 'reassign')

        const updated = await prisma.decisionCandidate.findUnique({ where: { id: claim.id } })
        expect(updated!.dismissedAt).not.toBeNull()

        // Both decisions unchanged
        expect((await prisma.decision.findUnique({ where: { subjectId: subjectB.id } }))!.ada).toBe('ADA-Y')
        expect((await prisma.decision.findUnique({ where: { subjectId: subjectA.id } }))!.ada).toBe('ADA-X')
    })
})

describe('pollDecisions extraction processing', () => {
    let cityId: string
    let meetingId: string
    let personA: { id: string }
    let personB: { id: string }
    let personC: { id: string }

    beforeEach(async () => {
        await resetDatabase(prisma)

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

        personA = await createPerson(cityId, { name: 'Αλέξανδρος Παπαδόπουλος' })
        personB = await createPerson(cityId, { name: 'Μαρία Ιωάννου' })
        personC = await createPerson(cityId, { name: 'Γεώργιος Νικολάου' })
    })

    test('creates attendance and vote records with decision source', async () => {
        const subject = await createSubject(meetingId, cityId, { name: 'Budget', agendaItemIndex: 1 })
        await prisma.decision.create({
            data: { subjectId: subject.id, pdfUrl: 'https://example.com/1.pdf', ada: 'ADA-1' },
        })
        const task = await createTaskStatus(meetingId, cityId, { type: 'pollDecisions' })

        await handlePollDecisionsResult(task.id, makePollDecisionsResult({
            extractions: {
                decisions: [
                    makeExtractedDecision({
                        subjectId: subject.id,
                        excerpt: 'ΑΠΟΦΑΣΙΖΕΙ ομόφωνα...',
                        references: '- Ν. 3852/2010',
                        presentMemberIds: [personA.id, personB.id],
                        absentMemberIds: [personC.id],
                        voteDetails: [
                            { personId: personA.id, vote: 'FOR' },
                            { personId: personB.id, vote: 'AGAINST' },
                        ],
                    }),
                ],
                warnings: [],
            },
        }))

        // Decision excerpt and references updated
        const decision = await prisma.decision.findUnique({ where: { subjectId: subject.id } })
        expect(decision!.excerpt).toBe('ΑΠΟΦΑΣΙΖΕΙ ομόφωνα...')
        expect(decision!.references).toBe('- Ν. 3852/2010')

        // Attendance records created with 'decision' source
        const attendance = await prisma.subjectAttendance.findMany({
            where: { subjectId: subject.id },
            orderBy: { person: { name: 'asc' } },
        })
        expect(attendance).toHaveLength(3)
        expect(attendance.every(a => a.source === 'decision')).toBe(true)
        expect(attendance.every(a => a.taskId === task.id)).toBe(true)

        const present = attendance.filter(a => a.status === 'PRESENT')
        const absent = attendance.filter(a => a.status === 'ABSENT')
        expect(present).toHaveLength(2)
        expect(absent).toHaveLength(1)
        expect(absent[0].personId).toBe(personC.id)

        // Vote records created with 'decision' source
        const votes = await prisma.subjectVote.findMany({
            where: { subjectId: subject.id },
            orderBy: { person: { name: 'asc' } },
        })
        expect(votes).toHaveLength(2)
        expect(votes.every(v => v.source === 'decision')).toBe(true)

        const forVote = votes.find(v => v.personId === personA.id)
        const againstVote = votes.find(v => v.personId === personB.id)
        expect(forVote!.voteType).toBe('FOR')
        expect(againstVote!.voteType).toBe('AGAINST')
    })

    test('unanimous vote with backend-inferred voteDetails stores FOR for all present', async () => {
        const subject = await createSubject(meetingId, cityId, { name: 'Parks', agendaItemIndex: 1 })
        await prisma.decision.create({
            data: { subjectId: subject.id, pdfUrl: 'https://example.com/2.pdf', ada: 'ADA-2' },
        })
        const task = await createTaskStatus(meetingId, cityId, { type: 'pollDecisions' })

        // Vote inference is handled by the backend — voteDetails arrives pre-populated
        await handlePollDecisionsResult(task.id, makePollDecisionsResult({
            extractions: {
                decisions: [
                    makeExtractedDecision({
                        subjectId: subject.id,
                        presentMemberIds: [personA.id, personB.id, personC.id],
                        voteResult: 'Ομόφωνα',
                        voteDetails: [
                            { personId: personA.id, vote: 'FOR' },
                            { personId: personB.id, vote: 'FOR' },
                            { personId: personC.id, vote: 'FOR' },
                        ],
                    }),
                ],
                warnings: [],
            },
        }))

        const votes = await prisma.subjectVote.findMany({
            where: { subjectId: subject.id },
        })
        expect(votes).toHaveLength(3)
        expect(votes.every(v => v.voteType === 'FOR')).toBe(true)
        expect(votes.every(v => v.source === 'decision')).toBe(true)
    })

    test('re-extraction replaces decision-sourced records but preserves other sources', async () => {
        const subject = await createSubject(meetingId, cityId, { name: 'Roads', agendaItemIndex: 1 })
        await prisma.decision.create({
            data: { subjectId: subject.id, pdfUrl: 'https://example.com/3.pdf', ada: 'ADA-3' },
        })

        // Simulate a manual attendance record (different source)
        await prisma.subjectAttendance.create({
            data: {
                subjectId: subject.id,
                personId: personC.id,
                status: 'PRESENT',
                source: 'manual',
            },
        })
        await prisma.subjectVote.create({
            data: {
                subjectId: subject.id,
                personId: personC.id,
                voteType: 'FOR',
                source: 'manual',
            },
        })

        // First extraction via pollDecisions
        const task1 = await createTaskStatus(meetingId, cityId, { type: 'pollDecisions' })
        await handlePollDecisionsResult(task1.id, makePollDecisionsResult({
            extractions: {
                decisions: [
                    makeExtractedDecision({
                        subjectId: subject.id,
                        presentMemberIds: [personA.id],
                        absentMemberIds: [personB.id],
                        voteResult: 'Ομόφωνα',
                        voteDetails: [
                            { personId: personA.id, vote: 'FOR' },
                        ],
                    }),
                ],
                warnings: [],
            },
        }))

        // Verify: decision-sourced + manual records coexist
        let attendance = await prisma.subjectAttendance.findMany({ where: { subjectId: subject.id } })
        expect(attendance).toHaveLength(3) // A (decision), B (decision), C (manual)

        let votes = await prisma.subjectVote.findMany({ where: { subjectId: subject.id } })
        expect(votes).toHaveLength(2) // A (decision), C (manual)

        // Second extraction — replaces decision-sourced, preserves manual
        const task2 = await createTaskStatus(meetingId, cityId, { type: 'pollDecisions' })
        await handlePollDecisionsResult(task2.id, makePollDecisionsResult({
            extractions: {
                decisions: [
                    makeExtractedDecision({
                        subjectId: subject.id,
                        presentMemberIds: [personA.id, personB.id],
                        // No absent members this time
                        voteDetails: [
                            { personId: personA.id, vote: 'FOR' },
                            { personId: personB.id, vote: 'AGAINST' },
                        ],
                    }),
                ],
                warnings: [],
            },
        }))

        attendance = await prisma.subjectAttendance.findMany({ where: { subjectId: subject.id } })
        // A (decision, PRESENT), B (decision, PRESENT), C (manual, PRESENT)
        expect(attendance).toHaveLength(3)

        const manualAttendance = attendance.find(a => a.source === 'manual')
        expect(manualAttendance).toBeDefined()
        expect(manualAttendance!.personId).toBe(personC.id)

        const decisionAttendance = attendance.filter(a => a.source === 'decision')
        expect(decisionAttendance).toHaveLength(2)
        expect(decisionAttendance.every(a => a.status === 'PRESENT')).toBe(true)
        expect(decisionAttendance.every(a => a.taskId === task2.id)).toBe(true)

        votes = await prisma.subjectVote.findMany({ where: { subjectId: subject.id } })
        // A (decision, FOR), B (decision, AGAINST), C (manual, FOR)
        expect(votes).toHaveLength(3)

        const manualVote = votes.find(v => v.source === 'manual')
        expect(manualVote).toBeDefined()
        expect(manualVote!.personId).toBe(personC.id)
        expect(manualVote!.voteType).toBe('FOR')

        const decisionVotes = votes.filter(v => v.source === 'decision')
        expect(decisionVotes).toHaveLength(2)
        expect(decisionVotes.every(v => v.taskId === task2.id)).toBe(true)
    })

    test('ADA conflict skips extraction — no attendance or votes for conflicting subject', async () => {
        // Subject in meeting 1 already owns ADA-X
        const subjectA = await createSubject(meetingId, cityId, { name: 'Subject A', agendaItemIndex: 1 })
        await prisma.decision.create({
            data: { subjectId: subjectA.id, ada: 'ADA-X', pdfUrl: 'https://example.com/a.pdf' },
        })

        // Meeting 2 subjects — poll will match ADA-X to subjectB (conflict) and ADA-Y to subjectC (clean)
        const meeting2 = await createMeeting(cityId, { id: 'm2', administrativeBodyId: (await prisma.administrativeBody.findFirst())!.id })
        const subjectB = await createSubject(meeting2.id, cityId, { name: 'Subject B', agendaItemIndex: 1 })
        const subjectC = await createSubject(meeting2.id, cityId, { name: 'Subject C', agendaItemIndex: 2 })
        const task = await createTaskStatus(meeting2.id, cityId, { type: 'pollDecisions' })

        // Backend returns both matches and extractions in one response
        await handlePollDecisionsResult(task.id, makePollDecisionsResult({
            matches: [
                makePollDecisionsMatch({ subjectId: subjectB.id, ada: 'ADA-X' }),  // conflict
                makePollDecisionsMatch({ subjectId: subjectC.id, ada: 'ADA-Y' }),  // clean
            ],
            extractions: {
                decisions: [
                    makeExtractedDecision({
                        subjectId: subjectB.id,
                        excerpt: 'Should not be stored',
                        presentMemberIds: [personA.id, personB.id],
                        absentMemberIds: [personC.id],
                        voteDetails: [
                            { personId: personA.id, vote: 'FOR' },
                            { personId: personB.id, vote: 'FOR' },
                        ],
                    }),
                    makeExtractedDecision({
                        subjectId: subjectC.id,
                        excerpt: 'Should be stored',
                        presentMemberIds: [personA.id, personC.id],
                        absentMemberIds: [personB.id],
                        voteDetails: [
                            { personId: personA.id, vote: 'FOR' },
                            { personId: personC.id, vote: 'AGAINST' },
                        ],
                    }),
                ],
                warnings: [],
            },
        }))

        // SubjectB: ADA conflict — no Decision, no extraction data stored
        const decisionB = await prisma.decision.findUnique({ where: { subjectId: subjectB.id } })
        expect(decisionB).toBeNull()
        const attendanceB = await prisma.subjectAttendance.findMany({ where: { subjectId: subjectB.id } })
        expect(attendanceB).toHaveLength(0)
        const votesB = await prisma.subjectVote.findMany({ where: { subjectId: subjectB.id } })
        expect(votesB).toHaveLength(0)

        // SubjectC: clean match — Decision created, extraction data stored
        const decisionC = await prisma.decision.findUnique({ where: { subjectId: subjectC.id } })
        expect(decisionC).not.toBeNull()
        expect(decisionC!.excerpt).toBe('Should be stored')
        const attendanceC = await prisma.subjectAttendance.findMany({ where: { subjectId: subjectC.id } })
        expect(attendanceC).toHaveLength(3)
        const votesC = await prisma.subjectVote.findMany({ where: { subjectId: subjectC.id } })
        expect(votesC).toHaveLength(2)
    })

    test('no votes created when not unanimous and no vote details', async () => {
        const subject = await createSubject(meetingId, cityId, { name: 'Misc', agendaItemIndex: 1 })
        await prisma.decision.create({
            data: { subjectId: subject.id, pdfUrl: 'https://example.com/4.pdf', ada: 'ADA-4' },
        })
        const task = await createTaskStatus(meetingId, cityId, { type: 'pollDecisions' })

        await handlePollDecisionsResult(task.id, makePollDecisionsResult({
            extractions: {
                decisions: [
                    makeExtractedDecision({
                        subjectId: subject.id,
                        presentMemberIds: [personA.id, personB.id],
                        voteResult: 'Κατά πλειοψηφία',
                        // no voteDetails — can't infer individual votes for non-unanimous
                    }),
                ],
                warnings: [],
            },
        }))

        const votes = await prisma.subjectVote.findMany({ where: { subjectId: subject.id } })
        expect(votes).toHaveLength(0)

        // But attendance is still created
        const attendance = await prisma.subjectAttendance.findMany({ where: { subjectId: subject.id } })
        expect(attendance).toHaveLength(2)
    })
})

describe('handlePollDecisionsResult — conflict evidence rule', () => {
    let cityId: string
    let meetingId1: string
    let meetingId2: string

    // Meeting dates are Athens-local: m1 = 2025-01-10, m2 = 2025-01-17
    beforeEach(async () => {
        await resetDatabase(prisma)
        const city = await createCity({ id: 'c1' })
        cityId = city.id
        const body = await createAdministrativeBody(cityId, {
            notificationBehavior: 'NOTIFICATIONS_DISABLED',
        })
        meetingId1 = (await createMeeting(cityId, {
            id: 'm1', administrativeBodyId: body.id, dateTime: new Date('2025-01-10T10:00:00Z'),
        })).id
        meetingId2 = (await createMeeting(cityId, {
            id: 'm2', administrativeBodyId: body.id, dateTime: new Date('2025-01-17T10:00:00Z'),
        })).id
    })

    test('a conflict against a backed decision records a counter-proposal on the backing row', async () => {
        // SubjectA (m2) holds ADA-X, with an unread backing candidate —
        // the tier-1 backfill shape that used to swallow every later proposal.
        const subjectA = await createSubject(meetingId2, cityId, { name: 'Subject A', agendaItemIndex: 1 })
        const held = await prisma.decision.create({
            data: { subjectId: subjectA.id, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf' },
        })
        await prisma.decisionCandidate.create({
            data: {
                cityId, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf',
                readStatus: 'unread', councilMeetingId: meetingId2, decisionId: held.id,
            },
        })

        // Polling m1, the resolver claims ADA-X for subjectB
        const subjectB = await createSubject(meetingId1, cityId, { name: 'Subject B', agendaItemIndex: 1 })
        const task = await createTaskStatus(meetingId1, cityId, { type: 'pollDecisions' })
        await handlePollDecisionsResult(task.id, makePollDecisionsResult({
            matches: [makePollDecisionsMatch({ subjectId: subjectB.id, ada: 'ADA-X', matchConfidence: 0.8, reasoning: 'better fit' })],
        }))

        // The proposal is recorded on the backing row; the assignment stands
        const row = await prisma.decisionCandidate.findUnique({ where: { cityId_ada: { cityId, ada: 'ADA-X' } } })
        expect(row!.subjectId).toBe(subjectB.id)
        expect(row!.confidence).toBe(0.8)
        expect(row!.reasoning).toBe('better fit')
        expect(row!.decisionId).toBe(held.id)

        // ...and it surfaces as an actionable conflict
        const conflicts = await getConflictingCandidates({ cityId })
        expect(conflicts).toHaveLength(1)
        expect(conflicts[0].claimingSubject.id).toBe(subjectB.id)
        expect(conflicts[0].existingDecision!.currentSubject.id).toBe(subjectA.id)
    })

    test('a fresh conflict creates the candidate with the full proposal', async () => {
        const subjectA = await createSubject(meetingId2, cityId, { name: 'Subject A', agendaItemIndex: 1 })
        await prisma.decision.create({
            data: { subjectId: subjectA.id, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf' },
        })
        const subjectB = await createSubject(meetingId1, cityId, { name: 'Subject B', agendaItemIndex: 1 })
        const task = await createTaskStatus(meetingId1, cityId, { type: 'pollDecisions' })
        await handlePollDecisionsResult(task.id, makePollDecisionsResult({
            matches: [makePollDecisionsMatch({ subjectId: subjectB.id, ada: 'ADA-X', matchConfidence: 0.66, reasoning: 'fresh claim' })],
        }))

        const row = await prisma.decisionCandidate.findUnique({ where: { cityId_ada: { cityId, ada: 'ADA-X' } } })
        expect(row!.subjectId).toBe(subjectB.id)
        expect(row!.confidence).toBe(0.66)
        expect(row!.reasoning).toBe('fresh claim')
        expect(row!.title).toBe('Decision Title')
        expect(row!.councilMeetingId).toBe(meetingId1)
        expect(row!.readStatus).toBe('unread')
    })

    test('a conflict against an unassigned read row that declares the polled session is recorded', async () => {
        // ADA-X is held by subjectA (m2), but its candidate row is unassigned
        // and declares m1's session — the reader saw it while polling m1.
        const subjectA = await createSubject(meetingId2, cityId, { name: 'Subject A', agendaItemIndex: 1 })
        await prisma.decision.create({
            data: { subjectId: subjectA.id, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf' },
        })
        await prisma.decisionCandidate.create({
            data: {
                cityId, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf',
                readStatus: 'ok', meetingDate: new Date('2025-01-10T00:00:00Z'),
                councilMeetingId: meetingId1,
            },
        })

        const subjectB = await createSubject(meetingId1, cityId, { name: 'Subject B', agendaItemIndex: 1 })
        const task = await createTaskStatus(meetingId1, cityId, { type: 'pollDecisions' })
        await handlePollDecisionsResult(task.id, makePollDecisionsResult({
            matches: [makePollDecisionsMatch({ subjectId: subjectB.id, ada: 'ADA-X' })],
        }))

        const row = await prisma.decisionCandidate.findUnique({ where: { cityId_ada: { cityId, ada: 'ADA-X' } } })
        expect(row!.subjectId).toBe(subjectB.id)
    })

    test('a claim contradicting the document\'s own declared session is dropped', async () => {
        // The candidate declares m2's session; polling m1 claims it anyway.
        const subjectA = await createSubject(meetingId2, cityId, { name: 'Subject A', agendaItemIndex: 1 })
        await prisma.decision.create({
            data: { subjectId: subjectA.id, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf' },
        })
        await prisma.decisionCandidate.create({
            data: {
                cityId, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf',
                readStatus: 'ok', meetingDate: new Date('2025-01-17T00:00:00Z'),
                councilMeetingId: meetingId2,
            },
        })

        const subjectB = await createSubject(meetingId1, cityId, { name: 'Subject B', agendaItemIndex: 1 })
        const task = await createTaskStatus(meetingId1, cityId, { type: 'pollDecisions' })
        await handlePollDecisionsResult(task.id, makePollDecisionsResult({
            matches: [makePollDecisionsMatch({ subjectId: subjectB.id, ada: 'ADA-X' })],
        }))

        const row = await prisma.decisionCandidate.findUnique({ where: { cityId_ada: { cityId, ada: 'ADA-X' } } })
        expect(row!.subjectId).toBeNull()
    })

    test('a dismissed candidate is never resurrected by a new proposal', async () => {
        const subjectA = await createSubject(meetingId2, cityId, { name: 'Subject A', agendaItemIndex: 1 })
        await prisma.decision.create({
            data: { subjectId: subjectA.id, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf' },
        })
        await prisma.decisionCandidate.create({
            data: {
                cityId, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf',
                readStatus: 'unread', councilMeetingId: meetingId1, dismissedAt: new Date(),
            },
        })

        const subjectB = await createSubject(meetingId1, cityId, { name: 'Subject B', agendaItemIndex: 1 })
        const task = await createTaskStatus(meetingId1, cityId, { type: 'pollDecisions' })
        await handlePollDecisionsResult(task.id, makePollDecisionsResult({
            matches: [makePollDecisionsMatch({ subjectId: subjectB.id, ada: 'ADA-X' })],
        }))

        const row = await prisma.decisionCandidate.findUnique({ where: { cityId_ada: { cityId, ada: 'ADA-X' } } })
        expect(row!.subjectId).toBeNull()
        expect(row!.dismissedAt).not.toBeNull()
    })

    test('dismissing a counter-proposal restores the backing row to its assignment', async () => {
        const subjectA = await createSubject(meetingId2, cityId, { name: 'Subject A', agendaItemIndex: 1 })
        const subjectB = await createSubject(meetingId1, cityId, { name: 'Subject B', agendaItemIndex: 1 })
        const held = await prisma.decision.create({
            data: { subjectId: subjectA.id, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf' },
        })
        const row = await prisma.decisionCandidate.create({
            data: {
                cityId, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf',
                readStatus: 'unread', councilMeetingId: meetingId2, decisionId: held.id,
                subjectId: subjectB.id, confidence: 0.8, reasoning: 'counter',
            },
        })

        await applyCandidateConflictResolution(row.id, 'dismiss')

        const after = await prisma.decisionCandidate.findUnique({ where: { id: row.id } })
        expect(after!.subjectId).toBe(subjectA.id)
        expect(after!.confidence).toBeNull()
        expect(after!.reasoning).toBeNull()
        expect(after!.decisionId).toBe(held.id)
        expect(after!.dismissedAt).toBeNull()
        expect(await prisma.decision.count()).toBe(1)
    })

    test('reassigning a counter-proposal moves the decision to the claiming subject', async () => {
        const subjectA = await createSubject(meetingId2, cityId, { name: 'Subject A', agendaItemIndex: 1 })
        const subjectB = await createSubject(meetingId1, cityId, { name: 'Subject B', agendaItemIndex: 1 })
        const held = await prisma.decision.create({
            data: { subjectId: subjectA.id, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf' },
        })
        const row = await prisma.decisionCandidate.create({
            data: {
                cityId, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf',
                readStatus: 'unread', councilMeetingId: meetingId2, decisionId: held.id,
                subjectId: subjectB.id, confidence: 0.8, reasoning: 'counter',
            },
        })

        await applyCandidateConflictResolution(row.id, 'reassign')

        const moved = await prisma.decision.findUnique({ where: { subjectId: subjectB.id } })
        expect(moved).not.toBeNull()
        expect(moved!.ada).toBe('ADA-X')
        expect(await prisma.decision.findUnique({ where: { subjectId: subjectA.id } })).toBeNull()
        const after = await prisma.decisionCandidate.findUnique({ where: { id: row.id } })
        expect(after!.decisionId).toBe(moved!.id)
        expect(after!.subjectId).toBe(subjectB.id)
        expect(await getConflictingCandidates({ cityId })).toHaveLength(0)
    })
})
