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
import { documentsAfterReview, sendDueDocuments, sendReadyDocuments, waitsForPoll } from '@/lib/documents/automatic'
import { CANDIDATE_PAGE_SIZE, claimDocumentSend, failStaleDocumentSends, replaceDocumentSendSettings, settleDocumentSend } from '@/lib/db/documentSends'
import { MAX_AUTOMATIC_ATTEMPTS, MINUTES_THRESHOLD_DAYS, STALE_PENDING_MINUTES } from '@/lib/documents/settings'
import type { DocumentSendSettingInput } from '@/lib/zod-schemas/administrativeBody'
import { sendDocumentSentAdminAlert } from '@/lib/discord'
import { CLAIM_REPLAY_AFTER_MS, RESULT_PERSISTING_STAGE } from '@/lib/tasks/resultStage'
import { resetDatabase } from '../helpers/test-db'
import { splitSqlStatements } from '../helpers/sql'
import { createAdministrativeBody, createCity, createMeeting, createSubject, createTaskStatus, createUser } from '../helpers/factories'

const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000
const meetingDate = new Date('2026-03-10T17:00:00Z')
const daysAfter = (days: number) => new Date(meetingDate.getTime() + days * DAY_MS)
/** Before every dated meeting of the file: the minutes setting covers them all. */
const switchedOnAt = new Date('2026-01-01T00:00:00Z')

const payload: DocumentPayload = { filename: 'doc.docx', buffer: Buffer.from('docx'), subject: 'Πρακτικά', html: '<p/>' }

/** A send that takes a while to render, so that two of them overlap. */
const slowPayload = (): Promise<DocumentPayload> => new Promise(resolve => setTimeout(() => resolve(payload), 50))

const MIGRATION = path.join(__dirname, '../../prisma/migrations/20261108120000_document_sends/migration.sql')

/** The statements of the migration that match `pattern`, without their comments. */
function migrationStatements(pattern: RegExp): string[] {
    const sql = fs.readFileSync(MIGRATION, 'utf8')
    return splitSqlStatements(sql)
        .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
        .filter((s) => pattern.test(s))
}

/**
 * The guard against a double send is a partial unique index, written by hand
 * in the migration. A test database built with `prisma db push` knows nothing
 * of it, so the test replays that one statement. It drops the index first: a
 * reused database keeps an older definition otherwise, and an edit to the
 * migration's statement would never be tested.
 */
async function addAutomaticSlotIndex() {
    const [statement, ...more] = migrationStatements(/CREATE UNIQUE INDEX (IF NOT EXISTS )?"DocumentSend_automatic_key"/)
    if (!statement || more.length > 0) throw new Error('The migration must create DocumentSend_automatic_key exactly once')
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

/** The settings write runs inside the caller's transaction, as the body routes call it. */
const writeSettings = (administrativeBodyId: string, settings: DocumentSendSettingInput[]) =>
    prisma.$transaction(tx => replaceDocumentSendSettings(tx, administrativeBodyId, settings))

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
        // Reset, not clear: a once-implementation that a test left unused must not reach the next test
        mockPayload.mockReset()
        mockPayload.mockImplementation(slowPayload)
        cityId = (await createCity({ id: 'c1' })).id
        bodyId = (await createAdministrativeBody(cityId, { notificationBehavior: 'NOTIFICATIONS_DISABLED' })).id
        await prisma.documentSendSetting.create({
            data: { administrativeBodyId: bodyId, kind: 'minutes', enabled: true, enabledAt: switchedOnAt, recipientEmails: ['to@example.org', 'cc@example.org'] },
        })
        meetingId = (await createMeeting(cityId, { id: 'm1', administrativeBodyId: bodyId, dateTime: meetingDate })).id
        await createTaskStatus(meetingId, cityId, { type: 'humanReview', status: 'succeeded' })
        // The minutes take the subjects outside the agenda from the summarize: they wait for one
        await createTaskStatus(meetingId, cityId, { type: 'summarize', status: 'succeeded' })
    })

    const sends = (ofCity = cityId, ofMeeting = meetingId) => prisma.documentSend.findMany({
        where: { cityId: ofCity, councilMeetingId: ofMeeting },
        include: { missingSubjects: { select: { subjectId: true }, orderBy: { subjectId: 'asc' } } },
        orderBy: { createdAt: 'asc' },
    })

    const minutesClaim = (trigger: 'complete' | 'threshold' | 'manual') => claimDocumentSend({
        cityId, councilMeetingId: meetingId, kind: 'minutes', trigger, recipientEmails: ['to@example.org'], missingSubjectIds: [],
    })

    /** An agenda with every decision in: the minutes of the meeting are complete. */
    const decidedAgenda = async () => {
        const subject = await createSubject(meetingId, cityId, { name: 'Θέμα 1', agendaItemIndex: 1 })
        await prisma.decision.create({ data: { subjectId: subject.id, pdfUrl: 'https://example.com/1.pdf', ada: 'ADA-1' } })
    }

    describe('two senders at the same moment', () => {
        beforeEach(slowDocumentSendInserts)
        afterEach(normalDocumentSendInserts)

        test('two claims in flight at once: one wins, the other sees the slot taken', async () => {
            const results = await Promise.all([minutesClaim('complete'), minutesClaim('complete')])

            expect(results.filter(r => r === 'taken')).toHaveLength(1)
            expect(await sends()).toHaveLength(1)
        })

        test('two concurrent automatic sends produce one sent row and one email', async () => {
            await decidedAgenda()
            const send = () => sendDocument(cityId, meetingId, 'minutes', { by: 'automatic' })

            const [a, b] = await Promise.all([send(), send()])

            expect([a, b].filter(r => r.success && !r.skipped)).toHaveLength(1)
            expect([a, b].filter(r => r.skipped)).toHaveLength(1)
            const rows = await sends()
            expect(rows).toHaveLength(1)
            expect(rows[0]).toMatchObject({ status: 'sent', trigger: 'complete', recipientEmails: ['to@example.org', 'cc@example.org'], createdById: null, missingSubjects: [] })
            expect(rows[0].sentAt).not.toBeNull()
            // One render, one email (the alert follows the email), one alert
            expect(mockPayload).toHaveBeenCalledTimes(1)
            expect(sendDocumentSentAdminAlert).toHaveBeenCalledTimes(1)
        })

        test('a manual claim in flight makes the automatic claim issued after it see the send', async () => {
            const manual = minutesClaim('manual')
            // The manual insert is still open (the trigger holds it) when the cron claims
            await new Promise(resolve => setTimeout(resolve, 100))
            const automatic = minutesClaim('complete')

            expect(await manual).toEqual({ id: expect.any(String) })
            expect(await automatic).toBe('taken')
            expect(await sends()).toHaveLength(1)
        })
    })

    describe('the automatic slot index on its own', () => {
        // Every claim holds an advisory lock, so no claim ever reaches the index.
        // These rows go in directly, as a second sender without the lock would.
        const row = (data: { kind?: 'minutes' | 'transcript'; trigger: 'complete' | 'threshold' | 'review' | 'manual'; status: 'pending' | 'sending' | 'sent' | 'failed' }) =>
            prisma.documentSend.create({
                data: { cityId, councilMeetingId: meetingId, kind: data.kind ?? 'minutes', trigger: data.trigger, status: data.status, recipientEmails: ['to@example.org'] },
            })

        test.each(['pending', 'sending', 'sent'] as const)('refuses a second automatic %s row beside an automatic one that is not failed', async (status) => {
            await row({ trigger: 'complete', status: 'sent' })
            await expect(row({ trigger: 'threshold', status })).rejects.toMatchObject({ code: 'P2002' })
        })

        test('refuses a second automatic row beside a pending one, whatever the trigger', async () => {
            await row({ trigger: 'threshold', status: 'pending' })
            await expect(row({ trigger: 'complete', status: 'pending' })).rejects.toMatchObject({ code: 'P2002' })
            await expect(row({ trigger: 'review', status: 'sent' })).rejects.toMatchObject({ code: 'P2002' })
        })

        test('leaves out a failed row, every manual row and the other document', async () => {
            await row({ trigger: 'complete', status: 'failed' })
            await row({ trigger: 'complete', status: 'failed' })
            await row({ trigger: 'complete', status: 'sent' })
            await row({ trigger: 'manual', status: 'sent' })
            await row({ trigger: 'manual', status: 'pending' })
            await row({ trigger: 'manual', status: 'sent' })
            await row({ kind: 'transcript', trigger: 'review', status: 'sent' })

            expect(await sends()).toHaveLength(7)
        })

        test('a failed row frees the slot: the next automatic row goes in', async () => {
            const first = await row({ trigger: 'complete', status: 'pending' })
            await prisma.documentSend.update({ where: { id: first.id }, data: { status: 'failed' } })
            await row({ trigger: 'complete', status: 'pending' })

            expect((await sends()).map(s => s.status)).toEqual(['failed', 'pending'])
        })

        test('a failed automatic row cannot turn live again beside a live one', async () => {
            await row({ trigger: 'complete', status: 'sent' })
            const failed = await row({ trigger: 'complete', status: 'failed' })

            await expect(prisma.documentSend.update({ where: { id: failed.id }, data: { status: 'pending' } })).rejects.toMatchObject({ code: 'P2002' })
        })
    })

    describe('the migration backfill', () => {
        /**
         * The harness builds the schema with `db push`, so the backfill never
         * runs. The test re-adds the column that the migration drops, writes
         * the rows the old code wrote, and replays the two INSERT ... SELECT
         * statements of the migration.
         */
        const backfill = () => migrationStatements(/^INSERT INTO "DocumentSend(Setting)?"/)

        beforeEach(async () => {
            await prisma.$executeRawUnsafe('ALTER TABLE "AdministrativeBody" ADD COLUMN IF NOT EXISTS "contactEmails" TEXT[] DEFAULT ARRAY[]::TEXT[]')
        })

        afterEach(async () => {
            await prisma.$executeRawUnsafe('ALTER TABLE "AdministrativeBody" DROP COLUMN IF EXISTS "contactEmails"')
        })

        test('the migration holds the two backfill statements', () => {
            expect(backfill().map(s => s.match(/^INSERT INTO "(\w+)"/)?.[1])).toEqual(['DocumentSendSetting', 'DocumentSend'])
        })

        test('turns the contact emails of a body into its transcript setting, in order', async () => {
            const empty = (await createAdministrativeBody(cityId, { name: 'Empty' })).id
            const unset = (await createAdministrativeBody(cityId, { name: 'Unset' })).id
            await prisma.$executeRawUnsafe(`UPDATE "AdministrativeBody" SET "contactEmails" = ARRAY['z@example.org', 'a@example.org', 'm@example.org'] WHERE id = '${bodyId}'`)
            await prisma.$executeRawUnsafe(`UPDATE "AdministrativeBody" SET "contactEmails" = NULL WHERE id = '${unset}'`)
            const before = new Date()

            for (const statement of backfill()) await prisma.$executeRawUnsafe(statement)

            const settings = await prisma.documentSendSetting.findMany({ where: { kind: 'transcript' } })
            expect(settings).toEqual([expect.objectContaining({ administrativeBodyId: bodyId, enabled: true, recipientEmails: ['z@example.org', 'a@example.org', 'm@example.org'] })])
            expect(settings[0].enabledAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - MINUTE_MS)
            // A body with no address, or none recorded, gets no setting
            expect(await prisma.documentSendSetting.count({ where: { administrativeBodyId: { in: [empty, unset] } } })).toBe(0)
            // The minutes setting of the body stays as it was
            expect(await prisma.documentSendSetting.count({ where: { administrativeBodyId: bodyId, kind: 'minutes' } })).toBe(1)
        })

        test('turns each transcriptSent task into a sent row: the first of a meeting is the review send, the rest are manual', async () => {
            const other = (await createMeeting(cityId, { id: 'm2', administrativeBodyId: bodyId, dateTime: daysAfter(7) })).id
            const task = (councilMeetingId: string, createdAt: Date, requestBody: string, status = 'succeeded') => prisma.taskStatus.create({
                data: { type: 'transcriptSent', status, requestBody, councilMeetingId, cityId, createdAt },
            })
            const first = await task(meetingId, daysAfter(1), JSON.stringify({ recipientEmails: ['z@example.org', 'a@example.org', 'm@example.org'] }))
            await task(meetingId, daysAfter(2), JSON.stringify({ recipientEmails: ['again@example.org'] }))
            // A requestBody that is not JSON, and ones with no recipient array: an empty list, not a failed migration
            await task(meetingId, daysAfter(3), 'not json {')
            await task(meetingId, daysAfter(4), JSON.stringify({ recipientEmails: 'z@example.org' }))
            await task(meetingId, daysAfter(5), JSON.stringify({}))
            // A send that failed sent nothing
            await task(meetingId, daysAfter(6), JSON.stringify({ recipientEmails: ['failed@example.org'] }), 'failed')
            // Another meeting has its own first send, here one with no recipient array
            await task(other, daysAfter(8), JSON.stringify({ recipientEmails: null }))

            for (const statement of backfill()) await prisma.$executeRawUnsafe(statement)

            const rows = await sends()
            expect(rows.map(r => [r.kind, r.status, r.trigger, r.recipientEmails, r.createdById])).toEqual([
                ['transcript', 'sent', 'review', ['z@example.org', 'a@example.org', 'm@example.org'], null],
                ['transcript', 'sent', 'manual', ['again@example.org'], null],
                ['transcript', 'sent', 'manual', [], null],
                ['transcript', 'sent', 'manual', [], null],
                ['transcript', 'sent', 'manual', [], null],
            ])
            expect(rows[0]).toMatchObject({ id: first.id, sentAt: daysAfter(1), createdAt: daysAfter(1), missingSubjects: [] })
            expect((await sends(cityId, other)).map(r => [r.trigger, r.recipientEmails])).toEqual([['review', []]])
        })
    })

    test('an automatic claim after a manual send is taken, and a manual claim after an automatic send is not', async () => {
        await prisma.documentSend.create({
            data: { cityId, councilMeetingId: meetingId, kind: 'minutes', status: 'sent', trigger: 'manual', recipientEmails: ['to@example.org'] },
        })

        expect(await minutesClaim('complete')).toBe('taken')
        expect(await minutesClaim('manual')).toEqual({ id: expect.any(String) })
    })

    test('the slot is per document: an automatic transcript send leaves the minutes slot free', async () => {
        await decidedAgenda()
        await prisma.documentSend.create({
            data: { cityId, councilMeetingId: meetingId, kind: 'transcript', status: 'sent', trigger: 'review', recipientEmails: ['to@example.org'] },
        })

        const minutes = await sendDocument(cityId, meetingId, 'minutes', { by: 'automatic' })

        expect(minutes).toMatchObject({ success: true, recipientEmails: ['to@example.org', 'cc@example.org'] })
        expect(minutes.skipped).toBeUndefined()
    })

    test('a second automatic send after a sent one is skipped, a manual one goes out', async () => {
        await decidedAgenda()
        await sendDocument(cityId, meetingId, 'minutes', { by: 'automatic' })

        const again = await sendDocument(cityId, meetingId, 'minutes', { by: 'automatic' })
        const byHand = await sendDocument(cityId, meetingId, 'minutes', { by: 'person', userId: null })

        expect(again).toMatchObject({ success: true, skipped: true })
        expect(byHand).toMatchObject({ success: true, recipientEmails: ['to@example.org', 'cc@example.org'] })
        expect((await sends()).map(s => [s.trigger, s.status])).toEqual([['complete', 'sent'], ['manual', 'sent']])
    })

    test('a send by hand records who sent it; an automatic send records nobody', async () => {
        await decidedAgenda()
        const operator = await createUser('operator@example.org')

        await sendDocument(cityId, meetingId, 'minutes', { by: 'automatic' })
        const byHand = await sendDocument(cityId, meetingId, 'minutes', { by: 'person', userId: operator.id })

        expect(byHand.success && !byHand.skipped).toBe(true)
        expect((await sends()).map(s => [s.trigger, s.createdById])).toEqual([['complete', null], ['manual', operator.id]])
    })

    test('a render failure records a failed row and frees the slot for the next attempt', async () => {
        await decidedAgenda()
        mockPayload.mockRejectedValueOnce(new Error('no transcript'))
        const failed = await sendDocument(cityId, meetingId, 'minutes', { by: 'automatic' })
        expect(failed).toMatchObject({ success: false, error: 'no transcript' })
        expect((await sends()).map(s => [s.status, s.failureReason])).toEqual([['failed', 'no transcript']])

        const retry = await sendDocument(cityId, meetingId, 'minutes', { by: 'automatic' })
        expect(retry.success && !retry.skipped).toBe(true)
        expect((await sends()).map(s => s.status)).toEqual(['failed', 'sent'])
    })

    test('a document that is switched off sends nothing and records nothing', async () => {
        await prisma.documentSendSetting.update({ where: { administrativeBodyId_kind: { administrativeBodyId: bodyId, kind: 'minutes' } }, data: { enabled: false } })
        expect(await sendDocument(cityId, meetingId, 'minutes', { by: 'automatic' })).toMatchObject({ success: true, skipped: true, readiness: { state: 'none', reason: 'disabled' } })
        expect(await sends()).toEqual([])
        expect(mockPayload).not.toHaveBeenCalled()
    })

    test('switching the minutes on never emails the archive: the cron and the hooks skip an older meeting', async () => {
        await prisma.documentSendSetting.update({ where: { administrativeBodyId_kind: { administrativeBodyId: bodyId, kind: 'minutes' } }, data: { enabledAt: daysAfter(1) } })

        const summary = await sendDueDocuments({ now: daysAfter(MINUTES_THRESHOLD_DAYS + 1) })
        const outcomes = await sendReadyDocuments(cityId, meetingId)

        expect(summary).toMatchObject({ sent: [], notCovered: 1 })
        expect(outcomes[0]).toMatchObject({ readiness: { state: 'none', reason: 'beforeSwitch' }, result: { skipped: true } })
        expect(await sends()).toEqual([])
    })

    describe('the cron', () => {
        test('reclaims a stale pending row, then sends the minutes that are due', async () => {
            const subject = await createSubject(meetingId, cityId, { name: 'Θέμα 1', agendaItemIndex: 1 })
            // The threshold passed: the minutes go out provisional, naming the subject without a decision
            const now = daysAfter(MINUTES_THRESHOLD_DAYS + 1)
            // A sender died after it claimed the row, longer ago than the cron tolerates
            const staleAt = new Date(now.getTime() - (STALE_PENDING_MINUTES + 1) * MINUTE_MS)
            await prisma.documentSend.create({
                data: { cityId, councilMeetingId: meetingId, kind: 'minutes', status: 'pending', trigger: 'threshold', recipientEmails: ['to@example.org'], createdAt: staleAt },
            })

            const summary = await sendDueDocuments({ now })

            expect(summary.staleReleased).toBe(1)
            expect(summary.sent).toEqual([{ cityId, meetingId, document: 'minutes', complete: false }])
            const rows = await sends()
            expect(rows.map(s => [s.status, s.failureReason, s.trigger])).toEqual([['failed', 'stale', 'threshold'], ['sent', null, 'threshold']])
            expect(rows[1].missingSubjects).toEqual([{ subjectId: subject.id }])
            // The payload builder saw why the minutes went out
            expect(mockPayload).toHaveBeenCalledWith(expect.objectContaining({ id: meetingId }), expect.objectContaining({ state: 'incomplete' }))
        })

        test('releases only the pending claims older than the stale limit, never a sent row', async () => {
            const now = daysAfter(20)
            const ago = (minutes: number) => new Date(now.getTime() - minutes * MINUTE_MS)
            const row = { cityId, councilMeetingId: meetingId, kind: 'minutes' as const, trigger: 'manual' as const, recipientEmails: ['to@example.org'] }
            await prisma.documentSend.create({ data: { ...row, status: 'pending', createdAt: ago(STALE_PENDING_MINUTES - 1) } })
            await prisma.documentSend.create({ data: { ...row, status: 'pending', createdAt: ago(STALE_PENDING_MINUTES + 1) } })
            await prisma.documentSend.create({ data: { ...row, status: 'sent', createdAt: ago(10_000) } })

            expect(await failStaleDocumentSends(now)).toBe(1)

            const rows = await prisma.documentSend.findMany({ where: { cityId }, orderBy: { createdAt: 'desc' } })
            expect(rows.map(r => [r.status, r.failureReason])).toEqual([['pending', null], ['failed', 'stale'], ['sent', null]])
        })

        test('a send by hand closes the meeting: the cron sends nothing after it', async () => {
            const subject = await createSubject(meetingId, cityId, { name: 'Θέμα 1', agendaItemIndex: 1 })
            // The minutes are overdue, and an operator sends them by hand before the cron runs
            const byHand = await sendDocument(cityId, meetingId, 'minutes', { by: 'person', userId: null })
            expect(byHand.success && !byHand.skipped).toBe(true)
            expect(byHand.readiness).toEqual({ state: 'incomplete', missingSubjectIds: [subject.id] })

            const summary = await sendDueDocuments({ now: daysAfter(MINUTES_THRESHOLD_DAYS + 1) })

            expect(summary).toMatchObject({ evaluated: 0, sent: [], failed: [] })
            const rows = await sends()
            expect(rows.map(s => s.trigger)).toEqual(['manual'])
            expect(rows[0].missingSubjects).toEqual([{ subjectId: subject.id }])
        })

        test('never releases a claim whose email may have gone out, and never sends it again', async () => {
            await createSubject(meetingId, cityId, { name: 'Θέμα 1', agendaItemIndex: 1 })
            const now = daysAfter(MINUTES_THRESHOLD_DAYS + 1)
            // The sender handed the email over, then could not record the outcome
            await prisma.documentSend.create({
                data: { cityId, councilMeetingId: meetingId, kind: 'minutes', status: 'sending', trigger: 'threshold', recipientEmails: ['to@example.org'], createdAt: new Date(now.getTime() - (STALE_PENDING_MINUTES + 1) * MINUTE_MS) },
            })

            const summary = await sendDueDocuments({ now })
            const outcomes = await sendReadyDocuments(cityId, meetingId)

            expect(summary).toMatchObject({ staleReleased: 0, sent: [], failed: [] })
            expect(outcomes[0].result).toMatchObject({ success: true, skipped: true })
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
            const slow = await minutesClaim('threshold')
            if (slow === 'taken') throw new Error('the first claim must win')
            await prisma.documentSend.update({ where: { id: slow.id }, data: { createdAt: new Date(now.getTime() - (STALE_PENDING_MINUTES + 1) * MINUTE_MS) } })
            expect(await failStaleDocumentSends(now)).toBe(1)
            const fresh = await minutesClaim('threshold')
            if (fresh === 'taken') throw new Error('the stale release must free the slot')
            await settleDocumentSend(fresh.id, { status: 'sent', sentAt: now })

            // The slow sender finishes: its settle reports the lost claim instead of breaking the index
            expect(await settleDocumentSend(slow.id, { status: 'sent', sentAt: now })).toBe(false)
            expect((await sends()).map(s => [s.status, s.failureReason])).toEqual([['failed', 'stale'], ['sent', null]])
        })

        test(`stops the automatic attempts after ${MAX_AUTOMATIC_ATTEMPTS} failures`, async () => {
            await createSubject(meetingId, cityId, { name: 'Θέμα 1', agendaItemIndex: 1 })
            for (let i = 0; i < MAX_AUTOMATIC_ATTEMPTS; i++) {
                await prisma.documentSend.create({ data: { cityId, councilMeetingId: meetingId, kind: 'minutes', status: 'failed', trigger: 'threshold', recipientEmails: ['to@example.org'], failureReason: 'render failed' } })
            }

            const summary = await sendDueDocuments({ now: daysAfter(MINUTES_THRESHOLD_DAYS + 1) })
            const outcomes = await sendReadyDocuments(cityId, meetingId)

            expect(summary).toMatchObject({ exhausted: 1, evaluated: 0, sent: [], failed: [] })
            expect(outcomes[0].result).toMatchObject({ success: true, skipped: true })
            expect(mockPayload).not.toHaveBeenCalled()
            expect(await sends()).toHaveLength(MAX_AUTOMATIC_ATTEMPTS)
        })

        test('failed sends by hand do not use up the automatic attempts', async () => {
            await decidedAgenda()
            for (let i = 0; i < MAX_AUTOMATIC_ATTEMPTS; i++) {
                await prisma.documentSend.create({ data: { cityId, councilMeetingId: meetingId, kind: 'minutes', status: 'failed', trigger: 'manual', recipientEmails: ['to@example.org'], failureReason: 'rejected' } })
            }

            const summary = await sendDueDocuments({ now: daysAfter(2) })

            expect(summary).toMatchObject({ exhausted: 0, sent: [{ meetingId, document: 'minutes', complete: true }] })
        })

        test('reads past a full page of meetings that wait, to the ready meeting after them', async () => {
            // A page of older reviewed meetings with no summarize: they wait, and stay candidates every day
            const older = Array.from({ length: CANDIDATE_PAGE_SIZE }, (_, i) => ({
                id: `old-${String(i).padStart(3, '0')}`, cityId, administrativeBodyId: bodyId, name: 'Old', name_en: 'Old',
                dateTime: new Date(meetingDate.getTime() - (i + 1) * 60 * 60 * 1000),
            }))
            await prisma.councilMeeting.createMany({ data: older })
            await prisma.taskStatus.createMany({
                data: older.map(meeting => ({ type: 'humanReview', status: 'succeeded', requestBody: '{}', councilMeetingId: meeting.id, cityId })),
            })
            await decidedAgenda()

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
            await prisma.documentSendSetting.create({ data: { administrativeBodyId: otherBody, kind: 'minutes', enabled: true, enabledAt: switchedOnAt, recipientEmails: ['c2@example.org'] } })
            await createMeeting(otherCity, { id: meetingId, administrativeBodyId: otherBody, dateTime: meetingDate })
            await createTaskStatus(meetingId, otherCity, { type: 'humanReview', status: 'succeeded' })
            await createTaskStatus(meetingId, otherCity, { type: 'summarize', status: 'succeeded' })
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

        test('waits for the summarize: no minutes before one succeeded', async () => {
            await prisma.taskStatus.deleteMany({ where: { councilMeetingId: meetingId, type: 'summarize' } })
            await decidedAgenda()
            await createTaskStatus(meetingId, cityId, { type: 'summarize', status: 'failed' })

            const summary = await sendDueDocuments({ now: daysAfter(MINUTES_THRESHOLD_DAYS + 1) })
            const outcomes = await sendReadyDocuments(cityId, meetingId)

            expect(summary).toMatchObject({ sent: [], waiting: 1 })
            expect(outcomes[0]).toMatchObject({ readiness: { state: 'wait', reason: 'summarize' }, result: { skipped: true } })
            expect(await sends()).toEqual([])
        })

        test('skips a meeting whose review is not complete, and one the setting does not cover', async () => {
            await prisma.taskStatus.deleteMany({ where: { councilMeetingId: meetingId, type: 'humanReview' } })
            const unreviewed = await sendDueDocuments({ now: daysAfter(20) })
            expect(unreviewed.evaluated).toBe(0)

            await createTaskStatus(meetingId, cityId, { type: 'humanReview', status: 'succeeded' })
            await prisma.documentSendSetting.update({ where: { administrativeBodyId_kind: { administrativeBodyId: bodyId, kind: 'minutes' } }, data: { enabled: false } })
            const off = await sendDueDocuments({ now: daysAfter(20) })
            expect(off.evaluated).toBe(0)
            expect(await sends()).toEqual([])
        })
    })

    describe('the poll callback and the review completion', () => {
        test('send the complete minutes the moment the last decision is in', async () => {
            await decidedAgenda()

            const outcomes = await sendReadyDocuments(cityId, meetingId)

            expect(outcomes).toHaveLength(1)
            expect(outcomes[0]).toMatchObject({ document: 'minutes', readiness: { state: 'complete' } })
            expect((await sends()).map(s => [s.status, s.trigger, s.missingSubjects])).toEqual([['sent', 'complete', []]])
        })

        test('do nothing twice: a meeting with a sent row is not evaluated into a second send', async () => {
            await decidedAgenda()
            await sendReadyDocuments(cityId, meetingId)
            const second = await sendReadyDocuments(cityId, meetingId)
            expect(second[0].result).toMatchObject({ success: true, skipped: true })
            expect(await sends()).toHaveLength(1)
        })

        test('hold the minutes while a decision poll of the meeting writes its results', async () => {
            await decidedAgenda()
            // The poll linked the decision; its excerpts, votes and attendance are still being written
            const poll = await prisma.taskStatus.create({
                data: { type: 'pollDecisions', status: 'pending', stage: RESULT_PERSISTING_STAGE, requestBody: '{}', responseBody: '{}', councilMeetingId: meetingId, cityId },
            })

            const held = await sendReadyDocuments(cityId, meetingId)
            const cron = await sendDueDocuments({ now: daysAfter(2) })

            expect(held[0]).toMatchObject({ readiness: { state: 'complete' }, result: { success: true, skipped: true } })
            expect(cron).toMatchObject({ sent: [], waiting: 1 })
            expect(await sends()).toEqual([])

            // The poll's results are written: its own hook sends
            await prisma.taskStatus.update({ where: { id: poll.id }, data: { status: 'succeeded', stage: null } })
            const sent = await sendReadyDocuments(cityId, meetingId)
            expect(sent[0].result).toMatchObject({ success: true })
            expect(sent[0].result.skipped).toBeUndefined()
        })

        test('hold the minutes while a summarize of the meeting runs: its subjects are not there yet', async () => {
            await decidedAgenda()
            // A summarize run again rewrites the subjects outside the agenda when it ends
            const summarize = await prisma.taskStatus.create({
                data: { type: 'summarize', status: 'pending', stage: 'summarizing', requestBody: '{}', councilMeetingId: meetingId, cityId },
            })

            const held = await sendReadyDocuments(cityId, meetingId)

            expect(held[0]).toMatchObject({ readiness: { state: 'complete' }, result: { success: true, skipped: true } })
            expect(await sends()).toEqual([])

            // Its result handler sends through its own hook
            await prisma.taskStatus.update({ where: { id: summarize.id }, data: { status: 'succeeded' } })
            const sent = await sendReadyDocuments(cityId, meetingId)
            expect(sent[0].result).toMatchObject({ success: true })
            expect(sent[0].result.skipped).toBeUndefined()
        })

        test('a poll that died while writing holds the minutes no longer than a replay waits', async () => {
            await decidedAgenda()
            const poll = await prisma.taskStatus.create({
                data: { type: 'pollDecisions', status: 'pending', stage: RESULT_PERSISTING_STAGE, requestBody: '{}', responseBody: '{}', councilMeetingId: meetingId, cityId },
            })
            // Younger than the replay limit: it still holds
            await prisma.taskStatus.update({ where: { id: poll.id }, data: { updatedAt: new Date(Date.now() - CLAIM_REPLAY_AFTER_MS + 2 * MINUTE_MS) } })
            expect((await sendReadyDocuments(cityId, meetingId))[0].result).toMatchObject({ skipped: true })

            await prisma.taskStatus.update({ where: { id: poll.id }, data: { updatedAt: new Date(Date.now() - CLAIM_REPLAY_AFTER_MS - MINUTE_MS) } })
            const outcomes = await sendReadyDocuments(cityId, meetingId)

            expect(outcomes[0].result).toMatchObject({ success: true })
            expect(outcomes[0].result.skipped).toBeUndefined()
        })

        test('a summarize that stopped reporting holds the minutes for the stale limit, longer than a poll', async () => {
            await decidedAgenda()
            const summarize = await prisma.taskStatus.create({
                data: { type: 'summarize', status: 'pending', requestBody: '{}', councilMeetingId: meetingId, cityId },
            })
            // Past the replay limit of a poll, inside the stale limit of a summarize
            await prisma.taskStatus.update({ where: { id: summarize.id }, data: { updatedAt: new Date(Date.now() - CLAIM_REPLAY_AFTER_MS - MINUTE_MS) } })
            expect((await sendReadyDocuments(cityId, meetingId))[0].result).toMatchObject({ skipped: true })

            await prisma.taskStatus.update({ where: { id: summarize.id }, data: { updatedAt: new Date(Date.now() - (STALE_PENDING_MINUTES + 1) * MINUTE_MS) } })
            const outcomes = await sendReadyDocuments(cityId, meetingId)

            expect(outcomes[0].result).toMatchObject({ success: true })
            expect(outcomes[0].result.skipped).toBeUndefined()
        })

        test('send the minutes of an agenda whose every item was withdrawn, as complete', async () => {
            const subject = await createSubject(meetingId, cityId, { name: 'Θέμα 1', agendaItemIndex: 1 })
            await prisma.subject.update({ where: { id: subject.id }, data: { withdrawn: true } })

            const outcomes = await sendReadyDocuments(cityId, meetingId)

            expect(outcomes[0]).toMatchObject({ readiness: { state: 'complete' }, result: { success: true } })
        })

        test('wait for a meeting with no agenda subject at all', async () => {
            const outcomes = await sendReadyDocuments(cityId, meetingId)

            expect(outcomes[0]).toMatchObject({ readiness: { state: 'wait', reason: 'agenda' }, result: { success: true, skipped: true } })
        })

        test('a send by hand closes the meeting for the hooks too', async () => {
            const subject = await createSubject(meetingId, cityId, { name: 'Θέμα 1', agendaItemIndex: 1 })
            await sendDocument(cityId, meetingId, 'minutes', { by: 'person', userId: null })
            // The last decision arrives later; the poll callback must not send a second version
            await prisma.decision.create({ data: { subjectId: subject.id, pdfUrl: 'https://example.com/1.pdf', ada: 'ADA-1' } })

            const outcomes = await sendReadyDocuments(cityId, meetingId)

            expect(outcomes[0]).toMatchObject({ readiness: { state: 'complete' }, result: { success: true, skipped: true } })
            expect(await sends()).toHaveLength(1)
        })

        test('the completion dialog promises no minutes that the hooks will not send', async () => {
            await decidedAgenda()
            expect((await documentsAfterReview(cityId, meetingId, daysAfter(2))).map(d => d.document)).toEqual(['minutes'])

            // Sent by hand already
            const manual = await prisma.documentSend.create({
                data: { cityId, councilMeetingId: meetingId, kind: 'minutes', status: 'sent', trigger: 'manual', recipientEmails: ['to@example.org'] },
            })
            expect(await documentsAfterReview(cityId, meetingId, daysAfter(2))).toEqual([])

            // The automatic attempts are used up
            await prisma.documentSend.delete({ where: { id: manual.id } })
            for (let i = 0; i < MAX_AUTOMATIC_ATTEMPTS; i++) {
                await prisma.documentSend.create({ data: { cityId, councilMeetingId: meetingId, kind: 'minutes', status: 'failed', trigger: 'complete', recipientEmails: ['to@example.org'], failureReason: 'render failed' } })
            }
            expect(await documentsAfterReview(cityId, meetingId, daysAfter(2))).toEqual([])
        })

        test('a λογοδοσία with agenda subjects is complete at review time, not provisional', async () => {
            await prisma.councilMeeting.update({ where: { cityId_id: { cityId, id: meetingId } }, data: { kind: 'accountability' } })
            await createSubject(meetingId, cityId, { name: 'Απολογισμός πεπραγμένων', agendaItemIndex: 1 })

            const outcomes = await sendReadyDocuments(cityId, meetingId)

            expect(outcomes[0]).toMatchObject({ readiness: { state: 'complete' } })
            expect((await sends()).map(s => [s.status, s.trigger, s.missingSubjects])).toEqual([['sent', 'complete', []]])
        })

        test('a λογοδοσία with no subjects is complete at review time', async () => {
            await prisma.councilMeeting.update({ where: { cityId_id: { cityId, id: meetingId } }, data: { kind: 'accountability' } })
            const outcomes = await sendReadyDocuments(cityId, meetingId)
            expect(outcomes[0]).toMatchObject({ readiness: { state: 'complete' } })
            expect((await sends()).map(s => s.status)).toEqual(['sent'])
        })
    })

    describe('a due meeting that the cron polls: one poll after the summarize first', () => {
        // The readiness rule reads the clock itself, so this meeting is dated
        // from now: past its due date, inside the window of the decision polls.
        let pollCity: string
        let pollMeeting: string
        let missing: string[]
        let summarizedAt: Date

        const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * MINUTE_MS)

        beforeEach(async () => {
            pollCity = (await createCity({ id: 'cp', status: 'supported', diavgeiaUid: '6000' })).id
            const body = (await createAdministrativeBody(pollCity, { notificationBehavior: 'NOTIFICATIONS_DISABLED' })).id
            await prisma.documentSendSetting.create({
                data: { administrativeBodyId: body, kind: 'minutes', enabled: true, enabledAt: new Date(Date.now() - 60 * DAY_MS), recipientEmails: ['cp@example.org'] },
            })
            pollMeeting = (await createMeeting(pollCity, { id: 'pm', administrativeBodyId: body, dateTime: new Date(Date.now() - (MINUTES_THRESHOLD_DAYS + 5) * DAY_MS) })).id
            await createTaskStatus(pollMeeting, pollCity, { type: 'humanReview', status: 'succeeded', createdAt: hoursAgo(6) })
            const decided = await createSubject(pollMeeting, pollCity, { id: 'pm-s1', name: 'Θέμα 1', agendaItemIndex: 1 })
            await prisma.decision.create({ data: { subjectId: decided.id, pdfUrl: 'https://example.com/1.pdf', ada: 'ADA-1' } })
            missing = [
                (await createSubject(pollMeeting, pollCity, { id: 'pm-s2', name: 'Θέμα 2', agendaItemIndex: 2 })).id,
                (await createSubject(pollMeeting, pollCity, { id: 'pm-s3', name: 'Εκτός ημερησίας', nonAgendaReason: 'outOfAgenda' })).id,
            ]
            // A poll that ended before the summarize looked for none of the subjects it added
            await prisma.taskStatus.create({
                data: { type: 'pollDecisions', status: 'succeeded', requestBody: '{}', councilMeetingId: pollMeeting, cityId: pollCity, createdAt: hoursAgo(5), updatedAt: hoursAgo(4) },
            })
            summarizedAt = hoursAgo(2)
            await prisma.taskStatus.create({
                data: { type: 'summarize', status: 'succeeded', requestBody: '{}', councilMeetingId: pollMeeting, cityId: pollCity, createdAt: hoursAgo(3), updatedAt: summarizedAt },
            })
        })

        test('waits for the poll, then sends provisional minutes that name each missing subject', async () => {
            const waiting = await sendReadyDocuments(pollCity, pollMeeting)
            const cron = await sendDueDocuments({ now: new Date() })

            expect(waiting[0]).toMatchObject({ readiness: { state: 'wait', reason: 'poll' }, result: { success: true, skipped: true } })
            expect(waitsForPoll(waiting)).toBe(true)
            expect(cron).toMatchObject({ sent: [], failed: [], waiting: 1 })
            expect(await sends(pollCity, pollMeeting)).toEqual([])
            expect(mockPayload).not.toHaveBeenCalled()

            // The poll after the summarize found nothing more
            await prisma.taskStatus.create({
                data: {
                    type: 'pollDecisions', status: 'succeeded', requestBody: '{}', councilMeetingId: pollMeeting, cityId: pollCity,
                    createdAt: new Date(summarizedAt.getTime() + MINUTE_MS), updatedAt: new Date(summarizedAt.getTime() + 5 * MINUTE_MS),
                },
            })
            const sent = await sendReadyDocuments(pollCity, pollMeeting)

            expect(sent[0]).toMatchObject({
                readiness: { state: 'incomplete', missingSubjectIds: expect.arrayContaining(missing) },
                result: { success: true, recipientEmails: ['cp@example.org'] },
            })
            expect(sent[0].result.skipped).toBeUndefined()
            expect(waitsForPoll(sent)).toBe(false)
            const rows = await sends(pollCity, pollMeeting)
            expect(rows.map(s => [s.status, s.trigger, s.createdById])).toEqual([['sent', 'threshold', null]])
            expect(rows[0].missingSubjects).toEqual([...missing].sort().map(subjectId => ({ subjectId })))
            expect(await prisma.documentSendMissingSubject.count()).toBe(missing.length)
            expect(mockPayload).toHaveBeenCalledWith(expect.objectContaining({ id: pollMeeting }), expect.objectContaining({ state: 'incomplete' }))
        })

        test('a meeting the cron does not poll goes out provisional without waiting for a poll', async () => {
            await prisma.city.update({ where: { id: pollCity }, data: { status: 'demo' } })

            const sent = await sendReadyDocuments(pollCity, pollMeeting)

            expect(sent[0]).toMatchObject({ readiness: { state: 'incomplete' }, result: { success: true } })
            expect((await sends(pollCity, pollMeeting))[0].missingSubjects).toHaveLength(missing.length)
        })
    })

    describe('the settings write', () => {
        const enabledAtOf = async (kind: 'transcript' | 'minutes') =>
            (await prisma.documentSendSetting.findUniqueOrThrow({ where: { administrativeBodyId_kind: { administrativeBodyId: bodyId, kind } } })).enabledAt

        test('stamps enabledAt on a switch-on and keeps it while the document stays on', async () => {
            await writeSettings(bodyId, [{ kind: 'transcript', enabled: true, recipientEmails: ['a@example.org'] }])
            const first = await enabledAtOf('transcript')

            await writeSettings(bodyId, [{ kind: 'transcript', enabled: true, recipientEmails: ['b@example.org'] }])
            const second = await prisma.documentSendSetting.findUniqueOrThrow({ where: { administrativeBodyId_kind: { administrativeBodyId: bodyId, kind: 'transcript' } } })
            expect(second.enabledAt).toEqual(first)
            expect(second.recipientEmails).toEqual(['b@example.org'])

            // Off, then on again: the archive between the two is not emailed
            await writeSettings(bodyId, [{ kind: 'transcript', enabled: false, recipientEmails: [] }])
            await new Promise(resolve => setTimeout(resolve, 5))
            await writeSettings(bodyId, [{ kind: 'transcript', enabled: true, recipientEmails: ['a@example.org'] }])
            expect((await enabledAtOf('transcript')).getTime()).toBeGreaterThan(first.getTime())
        })

        test('a document that stays on keeps its enabledAt, and a switch-off keeps it for the record', async () => {
            await writeSettings(bodyId, [{ kind: 'minutes', enabled: true, recipientEmails: ['to@example.org'] }])
            expect(await enabledAtOf('minutes')).toEqual(switchedOnAt)

            await writeSettings(bodyId, [{ kind: 'minutes', enabled: false, recipientEmails: [] }])
            expect(await enabledAtOf('minutes')).toEqual(switchedOnAt)
        })
    })
})
