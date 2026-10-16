/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import { applyMinutesCorrection, minutesCorrectionNeverStarted } from '@/lib/db/minutesCorrections'
import { listTranscriptEdits } from '@/lib/db/utteranceEdits'
import { resetDatabase } from '../helpers/test-db'
import { createCity, createMeeting, createSpeakerSegment, createSpeakerTag, createTaskStatus, createUtterance } from '../helpers/factories'

const CITY = 'c1'
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000)

describe('the correction from the municipal minutes in the database (#876)', () => {
    let utteranceId: string

    beforeEach(async () => {
        await resetDatabase(prisma)
        await createCity({ id: CITY })
        await createMeeting(CITY, { id: 'm', municipalMinutesUrl: 'https://example.com/minutes.pdf' })
        const tag = await createSpeakerTag()
        const segment = await createSpeakerSegment('m', CITY, { speakerTagId: tag.id, startTimestamp: 0, endTimestamp: 10 })
        utteranceId = (await createUtterance(segment.id, { text: 'Ο κ. Νέκας.', startTimestamp: 0, endTimestamp: 9 })).id
    })

    const correction = (text = 'Ο κ. Λέκκας.') => ({ utteranceId, text, markUncertain: false })

    describe('applyMinutesCorrection', () => {
        test('writes the text and its history row together, attributed to the run', async () => {
            const run = await createTaskStatus('m', CITY, { type: 'fixFromMinutes', status: 'pending' })

            expect(await applyMinutesCorrection(run.id, correction())).toBe('written')

            const utterance = await prisma.utterance.findUniqueOrThrow({ where: { id: utteranceId } })
            expect([utterance.text, utterance.lastModifiedBy]).toEqual(['Ο κ. Λέκκας.', 'task'])
            const edits = await prisma.utteranceEdit.findMany({ where: { utteranceId } })
            expect(edits).toEqual([expect.objectContaining({ beforeText: 'Ο κ. Νέκας.', afterText: 'Ο κ. Λέκκας.', editedBy: 'task', taskId: run.id })])
        })

        test('keeps the text of a person, a revert included, and records nothing', async () => {
            await prisma.utterance.update({ where: { id: utteranceId }, data: { text: 'Ο κ. Νέκκας.', lastModifiedBy: 'user' } })
            const run = await createTaskStatus('m', CITY, { type: 'fixFromMinutes', status: 'pending' })

            expect(await applyMinutesCorrection(run.id, correction())).toBe('keptForPerson')

            expect((await prisma.utterance.findUniqueOrThrow({ where: { id: utteranceId } })).text).toBe('Ο κ. Νέκκας.')
            expect(await prisma.utteranceEdit.count({ where: { utteranceId } })).toBe(0)
        })

        test('corrects again an utterance that an earlier task run corrected', async () => {
            const run = await createTaskStatus('m', CITY, { type: 'fixFromMinutes', status: 'pending' })
            await applyMinutesCorrection(run.id, correction('Ο κ. Λέκας.'))

            expect(await applyMinutesCorrection(run.id, correction('Ο κ. Λέκκας.'))).toBe('written')
            expect(await prisma.utteranceEdit.count({ where: { utteranceId } })).toBe(2)
        })

        test('reports a correction of an utterance that no longer exists', async () => {
            const run = await createTaskStatus('m', CITY, { type: 'fixFromMinutes', status: 'pending' })
            expect(await applyMinutesCorrection(run.id, { ...correction(), utteranceId: 'gone' })).toBe('utteranceMissing')
        })
    })

    describe('listTranscriptEdits', () => {
        test('names the turn of the minutes behind each correction, reading the run once', async () => {
            const result = {
                updateUtterances: [{ utteranceId, text: 'Ο κ. Λέκκας.', markUncertain: false, source: { page: 4, label: 'ΠΡΟΕΔΡΟΣ', turnIndex: 12 } }],
            }
            const run = await createTaskStatus('m', CITY, { type: 'fixFromMinutes', status: 'succeeded', responseBody: JSON.stringify(result) })
            await applyMinutesCorrection(run.id, correction())
            await prisma.utterance.update({ where: { id: utteranceId }, data: { text: 'Ο κ. Λέκκας!', lastModifiedBy: 'user' } })
            await prisma.utteranceEdit.create({ data: { utteranceId, beforeText: 'Ο κ. Λέκκας.', afterText: 'Ο κ. Λέκκας!', editedBy: 'user' } })

            const findMany = jest.spyOn(prisma.taskStatus, 'findMany')
            const edits = await listTranscriptEdits(CITY, 'm')

            expect(edits).toEqual([
                expect.objectContaining({ taskId: run.id, taskType: 'fixFromMinutes', source: { page: 4, label: 'ΠΡΟΕΔΡΟΣ', turnIndex: 12 }, currentText: 'Ο κ. Λέκκας!' }),
                expect.objectContaining({ taskId: null, editedBy: 'user', source: null }),
            ])
            expect(findMany).toHaveBeenCalledTimes(1)
            findMany.mockRestore()

            expect(await listTranscriptEdits(CITY, 'm', run.id)).toHaveLength(1)
        })
    })

    describe('minutesCorrectionNeverStarted', () => {
        test('is true after a fixTranscript with no correction since', async () => {
            await createTaskStatus('m', CITY, { type: 'fixTranscript', status: 'succeeded', createdAt: minutesAgo(30) })
            expect(await minutesCorrectionNeverStarted(CITY, 'm')).toBe(true)
        })

        test('is false once a correction started after it, whatever its status', async () => {
            await createTaskStatus('m', CITY, { type: 'fixTranscript', status: 'succeeded', createdAt: minutesAgo(30) })
            await createTaskStatus('m', CITY, { type: 'fixFromMinutes', status: 'failed', createdAt: minutesAgo(20) })
            expect(await minutesCorrectionNeverStarted(CITY, 'm')).toBe(false)
        })

        test('is true again after a new fixTranscript, which the earlier correction did not see', async () => {
            await createTaskStatus('m', CITY, { type: 'fixTranscript', status: 'succeeded', createdAt: minutesAgo(30) })
            await createTaskStatus('m', CITY, { type: 'fixFromMinutes', status: 'succeeded', createdAt: minutesAgo(20) })
            await createTaskStatus('m', CITY, { type: 'fixTranscript', status: 'succeeded', createdAt: minutesAgo(10) })
            expect(await minutesCorrectionNeverStarted(CITY, 'm')).toBe(true)
        })

        test('is false for a meeting without minutes, or without a corrected transcript', async () => {
            expect(await minutesCorrectionNeverStarted(CITY, 'm')).toBe(false)

            await prisma.councilMeeting.update({ where: { cityId_id: { cityId: CITY, id: 'm' } }, data: { municipalMinutesUrl: null } })
            await createTaskStatus('m', CITY, { type: 'fixTranscript', status: 'succeeded', createdAt: minutesAgo(30) })
            expect(await minutesCorrectionNeverStarted(CITY, 'm')).toBe(false)
        })
    })
})
