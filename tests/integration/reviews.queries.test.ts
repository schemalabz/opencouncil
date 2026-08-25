/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import { getReviewStats, getMeetingsNeedingReview } from '@/lib/db/reviews'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import {
    createCity,
    createMeeting,
    createSpeakerSegment,
    createSpeakerTag,
    createTaskStatus,
    createUser,
    createUtterance,
    createUtteranceEdit,
    signInAsSuperAdmin,
} from '../helpers/factories'

/**
 * Characterization tests for the admin review queries (issues #560, #303).
 * They pin the query semantics so the candidate-first rewrite cannot
 * change behavior. Correctness only — the scale problem needs prod-size
 * data and is verified separately with EXPLAIN.
 */
describe('review queries', () => {
    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma)
        await signInAsSuperAdmin()
    })

    /** A supported-city meeting with one utterance; returns ids for edits. */
    async function seedMeeting(params: {
        cityId: string
        meetingId: string
        transcribe?: boolean
        humanReview?: boolean
        humanReviewCreatedAt?: Date
        dateTime?: Date
    }) {
        await createMeeting(params.cityId, {
            id: params.meetingId,
            dateTime: params.dateTime ?? new Date(Date.now() - 24 * 60 * 60 * 1000),
        })
        if (params.transcribe !== false) {
            await createTaskStatus(params.meetingId, params.cityId, {
                type: 'transcribe', status: 'succeeded',
            })
        }
        if (params.humanReview) {
            await createTaskStatus(params.meetingId, params.cityId, {
                type: 'humanReview', status: 'succeeded',
                createdAt: params.humanReviewCreatedAt,
            })
        }
        const tag = await createSpeakerTag()
        const segment = await createSpeakerSegment(params.meetingId, params.cityId, {
            speakerTagId: tag.id,
        })
        const utterance = await createUtterance(segment.id)
        return { utterance }
    }

    describe('getReviewStats', () => {
        it('splits needs-review and in-progress by presence of user edits', async () => {
            await createCity({ id: 'city1', status: 'supported' })
            const editor = await createUser('editor@example.com')

            // No user edits -> needsReview
            await seedMeeting({ cityId: 'city1', meetingId: 'm-untouched' })
            // Task edits only -> still needsReview
            const taskOnly = await seedMeeting({ cityId: 'city1', meetingId: 'm-task-only' })
            await createUtteranceEdit(taskOnly.utterance.id, { editedBy: 'task' })
            // User edit -> inProgress
            const started = await seedMeeting({ cityId: 'city1', meetingId: 'm-started' })
            await createUtteranceEdit(started.utterance.id, { editedBy: 'user', userId: editor.id })

            const stats = await getReviewStats()
            expect(stats.needsReview).toBe(2)
            expect(stats.inProgress).toBe(1)
        })

        it('excludes completed, untranscribed, and unsupported-city meetings', async () => {
            await createCity({ id: 'city1', status: 'supported' })
            await createCity({ id: 'city2', name: 'Other', status: 'demo' })

            // humanReview succeeded -> out of both counts, into completed
            await seedMeeting({ cityId: 'city1', meetingId: 'm-done', humanReview: true })
            // no transcribe -> ignored
            await seedMeeting({ cityId: 'city1', meetingId: 'm-raw', transcribe: false })
            // unsupported city -> ignored
            await seedMeeting({ cityId: 'city2', meetingId: 'm-elsewhere' })

            const stats = await getReviewStats()
            expect(stats.needsReview).toBe(0)
            expect(stats.inProgress).toBe(0)
            expect(stats.completedToday).toBe(1)
            expect(stats.completedThisWeek).toBe(1)
        })

        it('counts completions inside the current week only', async () => {
            await createCity({ id: 'city1', status: 'supported' })
            const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
            await seedMeeting({
                cityId: 'city1', meetingId: 'm-old-done',
                humanReview: true, humanReviewCreatedAt: eightDaysAgo,
            })

            const stats = await getReviewStats()
            expect(stats.completedToday).toBe(0)
            expect(stats.completedThisWeek).toBe(0)
        })
    })

    describe('getMeetingsNeedingReview', () => {
        it('returns aggregate stats per meeting', async () => {
            await createCity({ id: 'city1', status: 'supported' })
            const editor = await createUser('editor@example.com')
            const seeded = await seedMeeting({ cityId: 'city1', meetingId: 'm1' })
            await createUtteranceEdit(seeded.utterance.id, { editedBy: 'user', userId: editor.id })

            const items = await getMeetingsNeedingReview({ show: 'all' })
            expect(items).toHaveLength(1)
            expect(items[0].meetingId).toBe('m1')
            expect(items[0].totalUtterances).toBe(1)
            expect(items[0].userEditedUtterances).toBe(1)
            expect(items[0].primaryReviewer?.userId).toBe(editor.id)
        })

        it('filters by primary reviewer, not by any contributor', async () => {
            await createCity({ id: 'city1', status: 'supported' })
            const primary = await createUser('primary@example.com')
            const helper = await createUser('helper@example.com')

            await createMeeting('city1', { id: 'm1', dateTime: new Date(Date.now() - 24 * 60 * 60 * 1000) })
            await createTaskStatus('m1', 'city1', { type: 'transcribe', status: 'succeeded' })
            const tag = await createSpeakerTag()
            const segment = await createSpeakerSegment('m1', 'city1', { speakerTagId: tag.id })
            const u1 = await createUtterance(segment.id)
            const u2 = await createUtterance(segment.id, { startTimestamp: 10, endTimestamp: 20 })
            const u3 = await createUtterance(segment.id, { startTimestamp: 20, endTimestamp: 30 })
            // primary: 2 edits, helper: 1 edit
            await createUtteranceEdit(u1.id, { editedBy: 'user', userId: primary.id })
            await createUtteranceEdit(u2.id, { editedBy: 'user', userId: primary.id })
            await createUtteranceEdit(u3.id, { editedBy: 'user', userId: helper.id })

            const forPrimary = await getMeetingsNeedingReview({ show: 'all', reviewerId: primary.id })
            expect(forPrimary).toHaveLength(1)

            const forHelper = await getMeetingsNeedingReview({ show: 'all', reviewerId: helper.id })
            expect(forHelper).toHaveLength(0)
        })

        it('honors the show filter transitions', async () => {
            await createCity({ id: 'city1', status: 'supported' })
            await seedMeeting({ cityId: 'city1', meetingId: 'm-open' })
            await seedMeeting({ cityId: 'city1', meetingId: 'm-done', humanReview: true })

            const needsAttention = await getMeetingsNeedingReview({ show: 'needsAttention' })
            expect(needsAttention.map(i => i.meetingId)).toEqual(['m-open'])

            const completed = await getMeetingsNeedingReview({ show: 'completed' })
            expect(completed.map(i => i.meetingId)).toEqual(['m-done'])

            const all = await getMeetingsNeedingReview({ show: 'all' })
            expect(all.map(i => i.meetingId).sort()).toEqual(['m-done', 'm-open'])
        })

        it('bounds results to the last 30 days when asked', async () => {
            await createCity({ id: 'city1', status: 'supported' })
            const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
            await seedMeeting({ cityId: 'city1', meetingId: 'm-recent' })
            await seedMeeting({ cityId: 'city1', meetingId: 'm-old', dateTime: fortyDaysAgo })

            const recent = await getMeetingsNeedingReview({ show: 'all', last30Days: true })
            expect(recent.map(i => i.meetingId)).toEqual(['m-recent'])

            const all = await getMeetingsNeedingReview({ show: 'all', last30Days: false })
            expect(all.map(i => i.meetingId).sort()).toEqual(['m-old', 'm-recent'])
        })
    })
})
