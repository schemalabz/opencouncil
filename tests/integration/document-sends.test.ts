/** @jest-environment node */
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn(), isUserAuthorizedToEdit: jest.fn().mockResolvedValue(true) }))
jest.mock('next/cache', () => ({ revalidateTag: jest.fn(), revalidatePath: jest.fn() }))
jest.mock('next/server', () => ({ ...jest.requireActual('next/server'), after: () => {} }))
// The renderers have their own tests; here the claim, the race and the stale claim.
const mockPayload = jest.fn()
jest.mock('@/lib/documents/registry', () => ({
    documents: {
        transcript: { payload: (...a: unknown[]) => mockPayload(...a) },
        minutes: { payload: (...a: unknown[]) => mockPayload(...a) },
    },
}))

import fs from 'fs'
import path from 'path'
import prisma from '@/lib/db/prisma'
import { sendDocument, type DocumentPayload } from '@/lib/documents/send'
import { documentsAfterReview, MAX_AUTOMATIC_ATTEMPTS, sendDueDocuments, sendReadyDocuments } from '@/lib/documents/automatic'
import { CANDIDATE_PAGE_SIZE, claimDocumentSend, failStaleDocumentSends, replaceDocumentSendSettings, settleDocumentSend, STALE_PENDING_MINUTES } from '@/lib/db/documentSends'
import { MINUTES_THRESHOLD_DAYS } from '@/lib/documents/settings'
import { sendDocumentSentAdminAlert } from '@/lib/discord'
import { RESULT_PERSISTING_STAGE } from '@/lib/tasks/resultStage'
import { resetDatabase } from '../helpers/test-db'
import { splitSqlStatements } from '../helpers/sql'
import { createAdministrativeBody, createCity, createMeeting, createSubject, createTaskStatus } from '../helpers/factories'

const DAY_MS = 24 * 60 * 60 * 1000
const meetingDate = new Date('2026-03-10T17:00:00Z')
const daysAfter = (days: number) => new Date(meetingDate.getTime() + days * DAY_MS)

const payload: DocumentPayload = { filename: 'doc.docx', buffer: Buffer.from('docx'), subject: 'Πρακτικά', html: '<p/>' }

/** A send that takes a while to render, so that two of them overlap. */
const slowPayload = (): Promise<DocumentPayload> => new Promise(resolve => setTimeout(() => resolve(payload), 50))

const MIGRATION = path.join(__dirname, '../../prisma/migrations/20261016120000_document_sends/migration.sql')

/**
 * The guard against a double send is a partial unique index, written by hand
 * in the migration. A test database built with `prisma db push` knows nothing
 * of it, so the test replays that one statement. It drops the index first: a
 * reused database keeps an older definition otherwise, and an edit to the
 * migration's statement would never be tested.
 */
async function addAutomaticSlotIndex() {
    const sql = fs.readFileSync(MIGRATION, 'utf8')
    const [statement] = splitSqlStatements(sql)
        .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
        .filter((s) => /CREATE UNIQUE INDEX IF NOT EXISTS "DocumentSend_automatic_key"/.test(s))
    await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "DocumentSend_automatic_key"')
    await prisma.$executeRawUnsafe(statement)
}

/**
 * Hold every insert into DocumentSend open for a moment, so that a second
 * claim is issued while the first one is still uncommitted. Without it two
 * "concurrent" claims run one after the other, and a check-then-insert claim
 * with no index would pass.
 */
async function slowDocumentSendInserts() {
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION test_slow_document_send_insert() RETURNS trigger AS $$ BEGIN PERFORM pg_sleep(0.3); RETURN NEW; END $$ LANGUAGE plpgsql`)
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS test_slow_document_send_insert ON "DocumentSend"')
    await prisma.$executeRawUnsafe('CREATE TRIGGER test_slow_document_send_insert BEFORE INSERT ON "DocumentSend" FOR EACH ROW EXECUTE FUNCTION test_slow_document_send_insert()')
}

async function normalDocumentSendInserts() {
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS test_slow_document_send_insert ON "DocumentSend"')
}

describe('document sends', () => {
    let cityId: string
    let bodyId: string
    let meetingId: string

    beforeAll(async () => {
        await addAutomaticSlotIndex()
    })

    beforeEach(async () => {
        await resetDatabase(prisma)
        jest.clearAllMocks()
        mockPayload.mockImplementation(slowPayload)
        cityId = (await createCity({ id: 'c1' })).id
        bodyId = (await createAdministrativeBody(cityId, { notificationBehavior: 'NOTIFICATIONS_DISABLED' })).id
        await prisma.documentSendSetting.create({
            data: { administrativeBodyId: bodyId, document: 'minutes', enabled: true, enabledAt: null, recipientEmails: ['to@example.org', 'cc@example.org'] },
        })
        meetingId = (await createMeeting(cityId, { id: 'm1', administrativeBodyId: bodyId, dateTime: meetingDate })).id
        await createTaskStatus(meetingId, cityId, { type: 'humanReview', status: 'succeeded' })
    })

    const sends = () => prisma.documentSend.findMany({ where: { cityId, councilMeetingId: meetingId }, orderBy: { createdAt: 'asc' } })

    describe('two senders at the same moment', () => {
        beforeEach(slowDocumentSendInserts)
        afterEach(normalDocumentSendInserts)

        test('two claims in flight at once: one wins, the other sees the slot taken', async () => {
            const claim = () => claimDocumentSend({
                cityId, councilMeetingId: meetingId, document: 'minutes', trigger: 'complete', automatic: true,
                recipientEmails: ['to@example.org'], complete: true, missingSubjectIds: [],
            })

            const results = await Promise.all([claim(), claim()])

            expect(results.filter(r => r === 'taken')).toHaveLength(1)
            expect(await sends()).toHaveLength(1)
        })

        test('two concurrent automatic sends produce one sent row and one email', async () => {
            const send = () => sendDocument(cityId, meetingId, 'minutes', () => mockPayload(), { trigger: 'complete', automatic: true })

            const [a, b] = await Promise.all([send(), send()])

            expect([a, b].filter(r => r.success && !r.skipped)).toHaveLength(1)
            expect([a, b].filter(r => r.skipped)).toHaveLength(1)
            const rows = await sends()
            expect(rows).toHaveLength(1)
            expect(rows[0]).toMatchObject({ status: 'sent', trigger: 'complete', automatic: true, recipientEmails: ['to@example.org', 'cc@example.org'], complete: true })
            expect(rows[0].sentAt).not.toBeNull()
            // One render, one email (the alert follows the email), one alert
            expect(mockPayload).toHaveBeenCalledTimes(1)
            expect(sendDocumentSentAdminAlert).toHaveBeenCalledTimes(1)
        })

        test('a manual claim in flight makes the automatic claim issued after it see the send', async () => {
            const claim = (automatic: boolean) => claimDocumentSend({
                cityId, councilMeetingId: meetingId, document: 'minutes', trigger: automatic ? 'complete' : 'manual', automatic,
                recipientEmails: ['to@example.org'], complete: true, missingSubjectIds: [],
            })

            const manual = claim(false)
            // The manual insert is still open (the trigger holds it) when the cron claims
            await new Promise(resolve => setTimeout(resolve, 100))
            const automatic = claim(true)

            expect(await manual).toEqual({ id: expect.any(String) })
            expect(await automatic).toBe('taken')
            expect(await sends()).toHaveLength(1)
        })
    })

    test('an automatic claim after a manual send is taken, and a manual claim after an automatic send is not', async () => {
        const claim = (automatic: boolean) => claimDocumentSend({
            cityId, councilMeetingId: meetingId, document: 'minutes', trigger: automatic ? 'complete' : 'manual', automatic,
            recipientEmails: ['to@example.org'], complete: true, missingSubjectIds: [],
        })
        await prisma.documentSend.create({
            data: { cityId, councilMeetingId: meetingId, document: 'minutes', status: 'sent', trigger: 'manual', automatic: false, recipientEmails: ['to@example.org'] },
        })

        expect(await claim(true)).toBe('taken')
        expect(await claim(false)).toEqual({ id: expect.any(String) })
    })

    test('the slot is per document: an automatic transcript send leaves the minutes slot free', async () => {
        await prisma.documentSend.create({
            data: { cityId, councilMeetingId: meetingId, document: 'transcript', status: 'sent', trigger: 'review', automatic: true, recipientEmails: ['to@example.org'] },
        })

        const minutes = await sendDocument(cityId, meetingId, 'minutes', slowPayload, { trigger: 'complete', automatic: true })

        expect(minutes).toMatchObject({ success: true, recipientEmails: ['to@example.org', 'cc@example.org'] })
        expect(minutes.skipped).toBeUndefined()
    })

    test('a second automatic send after a sent one is skipped, a manual one goes out', async () => {
        await sendDocument(cityId, meetingId, 'minutes', slowPayload, { trigger: 'complete', automatic: true })

        const again = await sendDocument(cityId, meetingId, 'minutes', slowPayload, { trigger: 'complete', automatic: true })
        const byHand = await sendDocument(cityId, meetingId, 'minutes', slowPayload, { trigger: 'manual', automatic: false })

        expect(again).toEqual({ success: true, skipped: true })
        expect(byHand).toMatchObject({ success: true, recipientEmails: ['to@example.org', 'cc@example.org'] })
        expect((await sends()).map(s => [s.trigger, s.automatic, s.status])).toEqual([['complete', true, 'sent'], ['manual', false, 'sent']])
    })

    test('a render failure records a failed row and frees the slot for the next attempt', async () => {
        mockPayload.mockRejectedValueOnce(new Error('no transcript'))
        const failed = await sendDocument(cityId, meetingId, 'minutes', () => mockPayload(), { trigger: 'complete', automatic: true })
        expect(failed).toEqual({ success: false, error: 'no transcript' })
        expect((await sends()).map(s => [s.status, s.failureReason])).toEqual([['failed', 'no transcript']])

        const retry = await sendDocument(cityId, meetingId, 'minutes', () => mockPayload(), { trigger: 'complete', automatic: true })
        expect(retry.success && !retry.skipped).toBe(true)
        expect((await sends()).map(s => s.status)).toEqual(['failed', 'sent'])
    })

    test('a document that is switched off sends nothing and records nothing', async () => {
        await prisma.documentSendSetting.update({ where: { administrativeBodyId_document: { administrativeBodyId: bodyId, document: 'minutes' } }, data: { enabled: false } })
        expect(await sendDocument(cityId, meetingId, 'minutes', slowPayload, { trigger: 'complete', automatic: true })).toEqual({ success: true, skipped: true })
        expect(await sends()).toEqual([])
        expect(mockPayload).not.toHaveBeenCalled()
    })

    test('switching the minutes on never emails the archive: the cron and the hooks skip an older meeting', async () => {
        await prisma.documentSendSetting.update({ where: { administrativeBodyId_document: { administrativeBodyId: bodyId, document: 'minutes' } }, data: { enabledAt: daysAfter(1) } })

        const summary = await sendDueDocuments({ now: daysAfter(MINUTES_THRESHOLD_DAYS + 1) })
        const outcomes = await sendReadyDocuments(cityId, meetingId, daysAfter(MINUTES_THRESHOLD_DAYS + 1))

        expect(summary.sent).toEqual([])
        expect(outcomes[0]).toMatchObject({ readiness: { state: 'none', reason: 'beforeSwitch' }, result: null })
        expect(await sends()).toEqual([])
    })

    describe('the cron', () => {
        test('reclaims a stale pending row, then sends the minutes that are due', async () => {
            await createSubject(meetingId, cityId, { name: 'Θέμα 1', agendaItemIndex: 1 })
            // The threshold passed: the minutes go out provisional, naming the subject without a decision
            const now = daysAfter(MINUTES_THRESHOLD_DAYS + 1)
            // A sender died after it claimed the row, longer ago than the cron tolerates
            const staleAt = new Date(now.getTime() - (STALE_PENDING_MINUTES + 1) * 60 * 1000)
            await prisma.documentSend.create({
                data: { cityId, councilMeetingId: meetingId, document: 'minutes', status: 'pending', trigger: 'threshold', automatic: true, recipientEmails: ['to@example.org'], createdAt: staleAt },
            })

            const summary = await sendDueDocuments({ now })

            expect(summary.staleReleased).toBe(1)
            expect(summary.sent).toEqual([{ cityId, meetingId, document: 'minutes', complete: false }])
            const rows = await sends()
            expect(rows.map(s => [s.status, s.failureReason, s.trigger])).toEqual([['failed', 'stale', 'threshold'], ['sent', null, 'threshold']])
            expect(rows[1].complete).toBe(false)
            expect(rows[1].missingSubjectIds).toHaveLength(1)
            // The payload builder saw why the minutes went out
            expect(mockPayload).toHaveBeenCalledWith(expect.objectContaining({ id: meetingId }), expect.objectContaining({ state: 'incomplete' }))
        })

        test('releases only the pending claims older than the stale limit, never a sent row', async () => {
            const now = daysAfter(20)
            const ago = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000)
            const row = { cityId, councilMeetingId: meetingId, trigger: 'manual' as const, automatic: false, recipientEmails: ['to@example.org'] }
            await prisma.documentSend.create({ data: { ...row, document: 'minutes', status: 'pending', createdAt: ago(STALE_PENDING_MINUTES - 1) } })
            await prisma.documentSend.create({ data: { ...row, document: 'minutes', status: 'pending', createdAt: ago(STALE_PENDING_MINUTES + 1) } })
            await prisma.documentSend.create({ data: { ...row, document: 'minutes', status: 'sent', createdAt: ago(10_000) } })

            expect(await failStaleDocumentSends(now)).toBe(1)

            const rows = await prisma.documentSend.findMany({ where: { cityId }, orderBy: { createdAt: 'desc' } })
            expect(rows.map(r => [r.status, r.failureReason])).toEqual([['pending', null], ['failed', 'stale'], ['sent', null]])
        })

        test('a send by hand closes the meeting: the cron sends nothing after it', async () => {
            await createSubject(meetingId, cityId, { name: 'Θέμα 1', agendaItemIndex: 1 })
            // The minutes are overdue, and an operator sends them by hand before the cron runs
            const byHand = await sendDocument(cityId, meetingId, 'minutes', slowPayload, {
                trigger: 'manual', automatic: false, completeness: { complete: false, missingSubjectIds: ['s1'] },
            })
            expect(byHand.success && !byHand.skipped).toBe(true)

            const summary = await sendDueDocuments({ now: daysAfter(MINUTES_THRESHOLD_DAYS + 1) })

            expect(summary).toMatchObject({ evaluated: 0, sent: [], failed: [] })
            expect((await sends()).map(s => [s.trigger, s.automatic])).toEqual([['manual', false]])
        })

        test('never releases a claim whose email may have gone out, and never sends it again', async () => {
            await createSubject(meetingId, cityId, { name: 'Θέμα 1', agendaItemIndex: 1 })
            const now = daysAfter(MINUTES_THRESHOLD_DAYS + 1)
            // The sender handed the email over, then could not record the outcome
            await prisma.documentSend.create({
                data: { cityId, councilMeetingId: meetingId, document: 'minutes', status: 'sending', trigger: 'threshold', automatic: true, recipientEmails: ['to@example.org'], createdAt: new Date(now.getTime() - (STALE_PENDING_MINUTES + 1) * 60 * 1000) },
            })

            const summary = await sendDueDocuments({ now })
            const outcomes = await sendReadyDocuments(cityId, meetingId, now)

            expect(summary).toMatchObject({ staleReleased: 0, sent: [], failed: [] })
            expect(outcomes[0].result).toBeNull()
            expect(mockPayload).not.toHaveBeenCalled()
            expect((await sends()).map(s => s.status)).toEqual(['sending'])
        })

        test('a send goes from pending through sending to sent', async () => {
            await createSubject(meetingId, cityId, { name: 'Θέμα 1', agendaItemIndex: 1 })
            const seen: string[] = []
            mockPayload.mockImplementation(async () => {
                seen.push(...(await sends()).map(s => s.status))
                return payload
            })

            await sendDueDocuments({ now: daysAfter(MINUTES_THRESHOLD_DAYS + 1) })

            expect(seen).toEqual(['pending'])
            expect((await sends()).map(s => s.status)).toEqual(['sent'])
        })

        test('a sender that outlives its claim cannot mark it sent beside the claim that replaced it', async () => {
            const now = daysAfter(20)
            // A slow sender's claim, released as stale while it was still rendering
            const slow = await claimDocumentSend({ cityId, councilMeetingId: meetingId, document: 'minutes', trigger: 'threshold', automatic: true, recipientEmails: ['to@example.org'], complete: true, missingSubjectIds: [] })
            if (slow === 'taken') throw new Error('the first claim must win')
            await prisma.documentSend.update({ where: { id: slow.id }, data: { createdAt: new Date(now.getTime() - (STALE_PENDING_MINUTES + 1) * 60 * 1000) } })
            expect(await failStaleDocumentSends(now)).toBe(1)
            const fresh = await claimDocumentSend({ cityId, councilMeetingId: meetingId, document: 'minutes', trigger: 'threshold', automatic: true, recipientEmails: ['to@example.org'], complete: true, missingSubjectIds: [] })
            if (fresh === 'taken') throw new Error('the stale release must free the slot')
            await settleDocumentSend(fresh.id, { status: 'sent', sentAt: now })

            // The slow sender finishes: its settle reports the lost claim instead of breaking the index
            expect(await settleDocumentSend(slow.id, { status: 'sent', sentAt: now })).toBe(false)
            expect((await sends()).map(s => [s.status, s.failureReason])).toEqual([['failed', 'stale'], ['sent', null]])
        })

        test(`stops the automatic attempts after ${MAX_AUTOMATIC_ATTEMPTS} failures`, async () => {
            await createSubject(meetingId, cityId, { name: 'Θέμα 1', agendaItemIndex: 1 })
            for (let i = 0; i < MAX_AUTOMATIC_ATTEMPTS; i++) {
                await prisma.documentSend.create({ data: { cityId, councilMeetingId: meetingId, document: 'minutes', status: 'failed', trigger: 'threshold', automatic: true, recipientEmails: ['to@example.org'], failureReason: 'render failed' } })
            }

            const summary = await sendDueDocuments({ now: daysAfter(MINUTES_THRESHOLD_DAYS + 1) })
            const outcomes = await sendReadyDocuments(cityId, meetingId, daysAfter(MINUTES_THRESHOLD_DAYS + 1))

            expect(summary).toMatchObject({ exhausted: 1, evaluated: 0, sent: [], failed: [] })
            expect(outcomes[0].result).toBeNull()
            expect(mockPayload).not.toHaveBeenCalled()
            expect(await sends()).toHaveLength(MAX_AUTOMATIC_ATTEMPTS)
        })

        test('reads past a full page of meetings that wait, to the ready meeting after them', async () => {
            // A page of older reviewed meetings with no agenda: they wait, and stay candidates every day
            const older = Array.from({ length: CANDIDATE_PAGE_SIZE }, (_, i) => ({
                id: `old-${String(i).padStart(3, '0')}`, cityId, administrativeBodyId: bodyId, name: 'Old', name_en: 'Old',
                dateTime: new Date(meetingDate.getTime() - (i + 1) * 60 * 60 * 1000),
            }))
            await prisma.councilMeeting.createMany({ data: older })
            await prisma.taskStatus.createMany({
                data: older.map(meeting => ({ type: 'humanReview', status: 'succeeded', requestBody: '{}', councilMeetingId: meeting.id, cityId })),
            })
            const subject = await createSubject(meetingId, cityId, { name: 'Θέμα 1', agendaItemIndex: 1 })
            await prisma.decision.create({ data: { subjectId: subject.id, pdfUrl: 'https://example.com/1.pdf', ada: 'ADA-1' } })

            const summary = await sendDueDocuments({ now: daysAfter(1) })

            expect(summary).toMatchObject({ waiting: CANDIDATE_PAGE_SIZE, sent: [{ meetingId, document: 'minutes', complete: true }] })
        })

        test('pages past two cities\' meetings that share an id and a start time', async () => {
            // A full page ends on c1/m1, which waits for its agenda. c2 has a meeting
            // with the same id at the same moment, and it is ready: a cursor on the
            // date and the id alone would skip it on the next page.
            const older = Array.from({ length: CANDIDATE_PAGE_SIZE - 1 }, (_, i) => ({
                id: `old-${String(i).padStart(3, '0')}`, cityId, administrativeBodyId: bodyId, name: 'Old', name_en: 'Old',
                dateTime: new Date(meetingDate.getTime() - (i + 1) * 60 * 60 * 1000),
            }))
            await prisma.councilMeeting.createMany({ data: older })
            await prisma.taskStatus.createMany({
                data: older.map(meeting => ({ type: 'humanReview', status: 'succeeded', requestBody: '{}', councilMeetingId: meeting.id, cityId })),
            })
            const otherCity = (await createCity({ id: 'c2' })).id
            const otherBody = (await createAdministrativeBody(otherCity, { notificationBehavior: 'NOTIFICATIONS_DISABLED' })).id
            await prisma.documentSendSetting.create({ data: { administrativeBodyId: otherBody, document: 'minutes', enabled: true, enabledAt: null, recipientEmails: ['c2@example.org'] } })
            await createMeeting(otherCity, { id: meetingId, administrativeBodyId: otherBody, dateTime: meetingDate })
            await createTaskStatus(meetingId, otherCity, { type: 'humanReview', status: 'succeeded' })
            const subject = await createSubject(meetingId, otherCity, { name: 'Θέμα 1', agendaItemIndex: 1 })
            await prisma.decision.create({ data: { subjectId: subject.id, pdfUrl: 'https://example.com/1.pdf', ada: 'ADA-1' } })

            const summary = await sendDueDocuments({ now: daysAfter(1) })

            expect(summary).toMatchObject({ waiting: CANDIDATE_PAGE_SIZE, sent: [{ cityId: otherCity, meetingId, document: 'minutes', complete: true }] })
        })

        test('leaves a fresh pending row alone and waits for a meeting before the threshold', async () => {
            await createSubject(meetingId, cityId, { name: 'Θέμα 1', agendaItemIndex: 1 })
            const summary = await sendDueDocuments({ now: daysAfter(2) })
            expect(summary).toMatchObject({ staleReleased: 0, sent: [], failed: [], waiting: 1 })
            expect(await sends()).toEqual([])
        })

        test('skips a meeting whose review is not complete, and one the setting does not cover', async () => {
            await prisma.taskStatus.deleteMany({ where: { councilMeetingId: meetingId } })
            const unreviewed = await sendDueDocuments({ now: daysAfter(20) })
            expect(unreviewed.evaluated).toBe(0)

            await createTaskStatus(meetingId, cityId, { type: 'humanReview', status: 'succeeded' })
            await prisma.documentSendSetting.update({ where: { administrativeBodyId_document: { administrativeBodyId: bodyId, document: 'minutes' } }, data: { enabled: false } })
            const off = await sendDueDocuments({ now: daysAfter(20) })
            expect(off.evaluated).toBe(0)
            expect(await sends()).toEqual([])
        })
    })

    describe('the poll callback and the review completion', () => {
        test('send the complete minutes the moment the last decision is in', async () => {
            const subject = await createSubject(meetingId, cityId, { name: 'Θέμα 1', agendaItemIndex: 1 })
            await prisma.decision.create({ data: { subjectId: subject.id, pdfUrl: 'https://example.com/1.pdf', ada: 'ADA-1' } })

            const outcomes = await sendReadyDocuments(cityId, meetingId, daysAfter(2))

            expect(outcomes).toHaveLength(1)
            expect(outcomes[0]).toMatchObject({ document: 'minutes', readiness: { state: 'complete' } })
            expect((await sends()).map(s => [s.status, s.trigger, s.complete])).toEqual([['sent', 'complete', true]])
        })

        test('do nothing twice: a meeting with a sent row is not evaluated into a second send', async () => {
            const subject = await createSubject(meetingId, cityId, { name: 'Θέμα 1', agendaItemIndex: 1 })
            await prisma.decision.create({ data: { subjectId: subject.id, pdfUrl: 'https://example.com/1.pdf', ada: 'ADA-1' } })
            await sendReadyDocuments(cityId, meetingId, daysAfter(2))
            const second = await sendReadyDocuments(cityId, meetingId, daysAfter(3))
            expect(second[0].result).toBeNull()
            expect(await sends()).toHaveLength(1)
        })

        test('hold the minutes while a decision poll of the meeting writes its results', async () => {
            const subject = await createSubject(meetingId, cityId, { name: 'Θέμα 1', agendaItemIndex: 1 })
            await prisma.decision.create({ data: { subjectId: subject.id, pdfUrl: 'https://example.com/1.pdf', ada: 'ADA-1' } })
            // The poll linked the decision; its excerpts, votes and attendance are still being written
            const poll = await prisma.taskStatus.create({
                data: { type: 'pollDecisions', status: 'pending', stage: RESULT_PERSISTING_STAGE, requestBody: '{}', responseBody: '{}', councilMeetingId: meetingId, cityId },
            })

            const held = await sendReadyDocuments(cityId, meetingId, daysAfter(2))
            const cron = await sendDueDocuments({ now: daysAfter(2) })

            expect(held[0]).toMatchObject({ readiness: { state: 'complete' }, result: null })
            expect(cron).toMatchObject({ sent: [], waiting: 1 })
            expect(await sends()).toEqual([])

            // The poll's results are written: its own hook sends
            await prisma.taskStatus.update({ where: { id: poll.id }, data: { status: 'succeeded', stage: null } })
            const sent = await sendReadyDocuments(cityId, meetingId, daysAfter(2))
            expect(sent[0].result).toMatchObject({ success: true })
        })

        test('a poll that died while writing holds the minutes no longer than a stale claim', async () => {
            const subject = await createSubject(meetingId, cityId, { name: 'Θέμα 1', agendaItemIndex: 1 })
            await prisma.decision.create({ data: { subjectId: subject.id, pdfUrl: 'https://example.com/1.pdf', ada: 'ADA-1' } })
            const poll = await prisma.taskStatus.create({
                data: { type: 'pollDecisions', status: 'pending', stage: RESULT_PERSISTING_STAGE, requestBody: '{}', responseBody: '{}', councilMeetingId: meetingId, cityId },
            })
            await prisma.taskStatus.update({ where: { id: poll.id }, data: { updatedAt: new Date(Date.now() - (STALE_PENDING_MINUTES + 1) * 60 * 1000) } })

            const outcomes = await sendReadyDocuments(cityId, meetingId, daysAfter(2))

            expect(outcomes[0].result).toMatchObject({ success: true })
        })

        test('send the minutes of an agenda whose every item was withdrawn, as complete', async () => {
            const subject = await createSubject(meetingId, cityId, { name: 'Θέμα 1', agendaItemIndex: 1 })
            await prisma.subject.update({ where: { id: subject.id }, data: { withdrawn: true } })

            const outcomes = await sendReadyDocuments(cityId, meetingId, daysAfter(2))

            expect(outcomes[0]).toMatchObject({ readiness: { state: 'complete' }, result: { success: true } })
        })

        test('wait for a meeting with no agenda subject at all', async () => {
            const outcomes = await sendReadyDocuments(cityId, meetingId, daysAfter(2))

            expect(outcomes[0]).toMatchObject({ readiness: { state: 'wait', reason: 'agenda' }, result: null })
        })

        test('a send by hand closes the meeting for the hooks too', async () => {
            const subject = await createSubject(meetingId, cityId, { name: 'Θέμα 1', agendaItemIndex: 1 })
            await sendDocument(cityId, meetingId, 'minutes', slowPayload, {
                trigger: 'manual', automatic: false, completeness: { complete: false, missingSubjectIds: [subject.id] },
            })
            // The last decision arrives later; the poll callback must not send a second version
            await prisma.decision.create({ data: { subjectId: subject.id, pdfUrl: 'https://example.com/1.pdf', ada: 'ADA-1' } })

            const outcomes = await sendReadyDocuments(cityId, meetingId, daysAfter(5))

            expect(outcomes[0]).toMatchObject({ readiness: { state: 'complete' }, result: null })
            expect(await sends()).toHaveLength(1)
        })

        test('the completion dialog promises no minutes that the hooks will not send', async () => {
            const subject = await createSubject(meetingId, cityId, { name: 'Θέμα 1', agendaItemIndex: 1 })
            await prisma.decision.create({ data: { subjectId: subject.id, pdfUrl: 'https://example.com/1.pdf', ada: 'ADA-1' } })
            expect((await documentsAfterReview(cityId, meetingId, daysAfter(2))).map(d => d.document)).toEqual(['minutes'])

            // Sent by hand already
            const manual = await prisma.documentSend.create({
                data: { cityId, councilMeetingId: meetingId, document: 'minutes', status: 'sent', trigger: 'manual', automatic: false, recipientEmails: ['to@example.org'] },
            })
            expect(await documentsAfterReview(cityId, meetingId, daysAfter(2))).toEqual([])

            // The automatic attempts are used up
            await prisma.documentSend.delete({ where: { id: manual.id } })
            for (let i = 0; i < MAX_AUTOMATIC_ATTEMPTS; i++) {
                await prisma.documentSend.create({ data: { cityId, councilMeetingId: meetingId, document: 'minutes', status: 'failed', trigger: 'complete', automatic: true, recipientEmails: ['to@example.org'], failureReason: 'render failed' } })
            }
            expect(await documentsAfterReview(cityId, meetingId, daysAfter(2))).toEqual([])
        })

        test('a λογοδοσία with agenda subjects is complete at review time, not provisional', async () => {
            await prisma.councilMeeting.update({ where: { cityId_id: { cityId, id: meetingId } }, data: { kind: 'accountability' } })
            await createSubject(meetingId, cityId, { name: 'Απολογισμός πεπραγμένων', agendaItemIndex: 1 })

            const outcomes = await sendReadyDocuments(cityId, meetingId, daysAfter(MINUTES_THRESHOLD_DAYS + 1))

            expect(outcomes[0]).toMatchObject({ readiness: { state: 'complete' } })
            expect((await sends()).map(s => [s.status, s.trigger, s.complete])).toEqual([['sent', 'complete', true]])
        })

        test('a λογοδοσία with no subjects is complete at review time', async () => {
            await prisma.councilMeeting.update({ where: { cityId_id: { cityId, id: meetingId } }, data: { kind: 'accountability' } })
            const outcomes = await sendReadyDocuments(cityId, meetingId, daysAfter(1))
            expect(outcomes[0]).toMatchObject({ readiness: { state: 'complete' } })
            expect((await sends()).map(s => s.status)).toEqual(['sent'])
        })
    })

    describe('the settings write', () => {
        test('stamps enabledAt on a switch-on and keeps it while the document stays on', async () => {
            await replaceDocumentSendSettings(bodyId, [{ document: 'transcript', enabled: true, recipientEmails: ['a@example.org'] }])
            const first = await prisma.documentSendSetting.findUniqueOrThrow({ where: { administrativeBodyId_document: { administrativeBodyId: bodyId, document: 'transcript' } } })
            expect(first.enabledAt).not.toBeNull()

            await replaceDocumentSendSettings(bodyId, [{ document: 'transcript', enabled: true, recipientEmails: ['b@example.org'] }])
            const second = await prisma.documentSendSetting.findUniqueOrThrow({ where: { administrativeBodyId_document: { administrativeBodyId: bodyId, document: 'transcript' } } })
            expect(second.enabledAt).toEqual(first.enabledAt)
            expect(second.recipientEmails).toEqual(['b@example.org'])

            // Off, then on again: the archive between the two is not emailed
            await replaceDocumentSendSettings(bodyId, [{ document: 'transcript', enabled: false, recipientEmails: [] }])
            await new Promise(resolve => setTimeout(resolve, 5))
            await replaceDocumentSendSettings(bodyId, [{ document: 'transcript', enabled: true, recipientEmails: ['a@example.org'] }])
            const third = await prisma.documentSendSetting.findUniqueOrThrow({ where: { administrativeBodyId_document: { administrativeBodyId: bodyId, document: 'transcript' } } })
            expect(third.enabledAt!.getTime()).toBeGreaterThan(first.enabledAt!.getTime())
        })

        test('a setting from the migration keeps its null enabledAt while it stays on', async () => {
            await replaceDocumentSendSettings(bodyId, [{ document: 'minutes', enabled: true, recipientEmails: ['to@example.org'] }])
            const row = await prisma.documentSendSetting.findUniqueOrThrow({ where: { administrativeBodyId_document: { administrativeBodyId: bodyId, document: 'minutes' } } })
            expect(row.enabledAt).toBeNull()
        })
    })
})
