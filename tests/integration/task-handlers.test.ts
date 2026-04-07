/** @jest-environment node */

// Mock modules with JSX templates that can't be parsed with jsx: "preserve"
jest.mock('@/lib/tasks/generateHighlight', () => ({
    handleGenerateHighlightResult: jest.fn(),
}))

// Mock auth for resolveAdaConflict tests
jest.mock('@/lib/auth', () => ({
    withUserAuthorizedToEdit: jest.fn(),
    isUserAuthorizedToEdit: jest.fn().mockResolvedValue(true),
}))

import prisma from '@/lib/db/prisma'
import { handleProcessAgendaResult } from '@/lib/tasks/processAgenda'
import { handleSummarizeResult } from '@/lib/tasks/summarize'
import { handlePollDecisionsResult, resolveAdaConflict } from '@/lib/tasks/pollDecisions'
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

describe('handlePollDecisionsResult', () => {
    let cityId: string
    let meetingId1: string
    let meetingId2: string

    beforeEach(async () => {
        await resetDatabase(prisma as any)

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

        // No claimedAda set
        const subjects = await prisma.subject.findMany({
            where: { claimedAda: { not: null } },
        })
        expect(subjects).toHaveLength(0)
    })

    test('ADA conflict detected — claim set, other matches still saved', async () => {
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

        // SubjectB should have claimedAda set, no decision created
        const updatedB = await prisma.subject.findUnique({ where: { id: subjectB.id } })
        expect(updatedB!.claimedAda).toBe('ADA-X')
        const decisionB = await prisma.decision.findUnique({ where: { subjectId: subjectB.id } })
        expect(decisionB).toBeNull()

        // SubjectC should have a normal decision, no claimedAda
        const updatedC = await prisma.subject.findUnique({ where: { id: subjectC.id } })
        expect(updatedC!.claimedAda).toBeNull()
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

        // No claimedAda set
        const subject = await prisma.subject.findUnique({ where: { id: subjectA.id } })
        expect(subject!.claimedAda).toBeNull()
    })

    test('multiple conflicts in one poll — both get claimedAda, non-conflicting matches saved', async () => {
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

        // SubjectC and SubjectD should have claimedAda
        const updatedC = await prisma.subject.findUnique({ where: { id: subjectC.id } })
        expect(updatedC!.claimedAda).toBe('ADA-X')
        const updatedD = await prisma.subject.findUnique({ where: { id: subjectD.id } })
        expect(updatedD!.claimedAda).toBe('ADA-Y')

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

    test('subsequent poll overwrites prior unresolved claimedAda', async () => {
        // SubjectA in meeting 1 already owns ADA-X
        const subjectA = await createSubject(meetingId1, cityId, { name: 'Subject A', agendaItemIndex: 1 })
        await prisma.decision.create({
            data: { subjectId: subjectA.id, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf' },
        })

        // SubjectB in meeting 2 — first poll claims ADA-X
        const subjectB = await createSubject(meetingId2, cityId, { name: 'Subject B', agendaItemIndex: 1 })
        const task1 = await createTaskStatus(meetingId2, cityId, { type: 'pollDecisions' })

        await handlePollDecisionsResult(task1.id, makePollDecisionsResult({
            matches: [makePollDecisionsMatch({ subjectId: subjectB.id, ada: 'ADA-X' })],
        }))

        const afterPoll1 = await prisma.subject.findUnique({ where: { id: subjectB.id } })
        expect(afterPoll1!.claimedAda).toBe('ADA-X')

        // Second poll — same subject now matches ADA-Y (also owned by someone else)
        const subjectC = await createSubject(meetingId1, cityId, { name: 'Subject C', agendaItemIndex: 2 })
        await prisma.decision.create({
            data: { subjectId: subjectC.id, ada: 'ADA-Y', pdfUrl: 'https://example.com/y.pdf' },
        })

        const task2 = await createTaskStatus(meetingId2, cityId, { type: 'pollDecisions' })

        await handlePollDecisionsResult(task2.id, makePollDecisionsResult({
            matches: [makePollDecisionsMatch({ subjectId: subjectB.id, ada: 'ADA-Y' })],
        }))

        // claimedAda is overwritten — only the latest claim is preserved
        const afterPoll2 = await prisma.subject.findUnique({ where: { id: subjectB.id } })
        expect(afterPoll2!.claimedAda).toBe('ADA-Y')
    })

    test('successful upsert clears stale claimedAda', async () => {
        // SubjectA owns ADA-X, SubjectB previously claimed it
        const subjectA = await createSubject(meetingId1, cityId, { name: 'Subject A', agendaItemIndex: 1 })
        await prisma.decision.create({
            data: { subjectId: subjectA.id, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf' },
        })
        const subjectB = await createSubject(meetingId2, cityId, { name: 'Subject B', agendaItemIndex: 1 })
        await prisma.subject.update({ where: { id: subjectB.id }, data: { claimedAda: 'ADA-X' } })

        // New poll gives subjectB a different, non-conflicting ADA
        const task = await createTaskStatus(meetingId2, cityId, { type: 'pollDecisions' })

        await handlePollDecisionsResult(task.id, makePollDecisionsResult({
            matches: [makePollDecisionsMatch({ subjectId: subjectB.id, ada: 'ADA-NEW' })],
        }))

        // Decision created and stale claimedAda cleared
        const decision = await prisma.decision.findUnique({ where: { subjectId: subjectB.id } })
        expect(decision).not.toBeNull()
        expect(decision!.ada).toBe('ADA-NEW')

        const updated = await prisma.subject.findUnique({ where: { id: subjectB.id } })
        expect(updated!.claimedAda).toBeNull()
    })
})

describe('resolveAdaConflict', () => {
    let cityId: string
    let meetingId1: string
    let meetingId2: string

    beforeEach(async () => {
        await resetDatabase(prisma as any)

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

    test('dismiss — clears claimedAda without moving the decision', async () => {
        const subjectA = await createSubject(meetingId1, cityId, { name: 'Subject A', agendaItemIndex: 1 })
        await prisma.decision.create({
            data: { subjectId: subjectA.id, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf', title: 'Original' },
        })

        const subjectB = await createSubject(meetingId2, cityId, { name: 'Subject B', agendaItemIndex: 1 })
        await prisma.subject.update({ where: { id: subjectB.id }, data: { claimedAda: 'ADA-X' } })

        await resolveAdaConflict(subjectB.id, 'dismiss')

        // claimedAda cleared
        const updatedB = await prisma.subject.findUnique({ where: { id: subjectB.id } })
        expect(updatedB!.claimedAda).toBeNull()

        // Original decision untouched
        const decisionA = await prisma.decision.findUnique({ where: { subjectId: subjectA.id } })
        expect(decisionA).not.toBeNull()
        expect(decisionA!.ada).toBe('ADA-X')

        // No decision on claiming subject
        const decisionB = await prisma.decision.findUnique({ where: { subjectId: subjectB.id } })
        expect(decisionB).toBeNull()
    })

    test('reassign — moves decision to the claiming subject', async () => {
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
        await prisma.subject.update({ where: { id: subjectB.id }, data: { claimedAda: 'ADA-X' } })

        await resolveAdaConflict(subjectB.id, 'reassign')

        // claimedAda cleared
        const updatedB = await prisma.subject.findUnique({ where: { id: subjectB.id } })
        expect(updatedB!.claimedAda).toBeNull()

        // Decision moved to subjectB
        const decisionB = await prisma.decision.findUnique({ where: { subjectId: subjectB.id } })
        expect(decisionB).not.toBeNull()
        expect(decisionB!.ada).toBe('ADA-X')
        expect(decisionB!.pdfUrl).toBe('https://example.com/x.pdf')
        expect(decisionB!.title).toBe('Original Title')
        expect(decisionB!.protocolNumber).toBe('42/2025')

        // No decision on original subject
        const decisionA = await prisma.decision.findUnique({ where: { subjectId: subjectA.id } })
        expect(decisionA).toBeNull()
    })

    test('reassign — when existing decision was deleted, just clears claim', async () => {
        const subjectB = await createSubject(meetingId2, cityId, { name: 'Subject B', agendaItemIndex: 1 })
        await prisma.subject.update({ where: { id: subjectB.id }, data: { claimedAda: 'ADA-X' } })

        // No decision with ADA-X exists (it was deleted)
        await resolveAdaConflict(subjectB.id, 'reassign')

        // claimedAda cleared
        const updatedB = await prisma.subject.findUnique({ where: { id: subjectB.id } })
        expect(updatedB!.claimedAda).toBeNull()

        // No decision created
        const decisionB = await prisma.decision.findUnique({ where: { subjectId: subjectB.id } })
        expect(decisionB).toBeNull()
    })

    test('reassign — when claiming subject already has a decision, dismisses instead', async () => {
        const subjectA = await createSubject(meetingId1, cityId, { name: 'Subject A', agendaItemIndex: 1 })
        await prisma.decision.create({
            data: { subjectId: subjectA.id, ada: 'ADA-X', pdfUrl: 'https://example.com/x.pdf' },
        })

        const subjectB = await createSubject(meetingId2, cityId, { name: 'Subject B', agendaItemIndex: 1 })
        // SubjectB already has its own decision
        await prisma.decision.create({
            data: { subjectId: subjectB.id, ada: 'ADA-Y', pdfUrl: 'https://example.com/y.pdf' },
        })
        await prisma.subject.update({ where: { id: subjectB.id }, data: { claimedAda: 'ADA-X' } })

        await resolveAdaConflict(subjectB.id, 'reassign')

        // claimedAda cleared
        const updatedB = await prisma.subject.findUnique({ where: { id: subjectB.id } })
        expect(updatedB!.claimedAda).toBeNull()

        // SubjectB keeps its original decision (ADA-Y)
        const decisionB = await prisma.decision.findUnique({ where: { subjectId: subjectB.id } })
        expect(decisionB!.ada).toBe('ADA-Y')

        // SubjectA keeps its decision (ADA-X) — not moved
        const decisionA = await prisma.decision.findUnique({ where: { subjectId: subjectA.id } })
        expect(decisionA!.ada).toBe('ADA-X')
    })
})

describe('pollDecisions extraction processing', () => {
    let cityId: string
    let meetingId: string
    let personA: { id: string }
    let personB: { id: string }
    let personC: { id: string }

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
