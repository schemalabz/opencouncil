/** @jest-environment node */
import fs from 'fs'
import path from 'path'
import prisma from '@/lib/db/prisma'
import { ensureTestDb } from '../helpers/test-db'
import { splitSqlStatements } from '../helpers/sql'
import type { PrismaClient as NotisPrismaClient } from '../../services/notis/generated/client'
import {
    MAX_ATTEMPTS,
    STALE_CLAIM_MS,
    claimNext,
    completeItem,
    deferItem,
    enqueueBatchWake,
    enqueueLiveWake,
    failItem,
    markFailed,
    retryDelayMs,
} from '../../services/notis/src/lib/queue-core'

/**
 * The live-lane queue state machine against a real Postgres: the claim
 * statement's concurrency rules (SKIP LOCKED, stale reclaim, per-
 * subscription serialization) only mean something on the real engine.
 * A second database in the same container plays the notis DB.
 */

const NOTIS_DB = 'notis_queue_test'
const MIGRATIONS_DIR = path.join(__dirname, '../../services/notis/prisma/migrations')

let notisDb: NotisPrismaClient

async function applyNotisMigrations(db: NotisPrismaClient, onlyIdempotent = false) {
    const dirs = fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((d) => fs.existsSync(path.join(MIGRATIONS_DIR, d, 'migration.sql')))
        .sort()
    for (const dir of dirs) {
        if (onlyIdempotent && dir.includes('_init')) continue
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8')
        for (const statement of splitSqlStatements(sql)) {
            await db.$executeRawUnsafe(statement)
        }
    }
}

async function createSubscription(id: string): Promise<string> {
    const row = await notisDb.notisSubscription.create({
        data: {
            id,
            userId: `user_${id}`,
            phone: `+30690${id}`,
            origin: 'inbound',
            profileText: 'x',
        },
        select: { id: true },
    })
    return row.id
}

const EVENT = { type: 'user_message', at: '2026-08-16T10:00:00.000Z', text: 'γεια' }

describe('notis wake queue (live lane)', () => {
    beforeAll(async () => {
        const { databaseUrl } = await ensureTestDb()
        await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${NOTIS_DB}`)
        await prisma.$executeRawUnsafe(`CREATE DATABASE ${NOTIS_DB}`)

        // Import AFTER ensureTestDb: the generated client dotenv-loads
        // services/notis/.env on require, and existing env vars must win.
        const { PrismaClient } = await import('../../services/notis/generated/client')
        const notisUrl = databaseUrl.replace(/\/testdb\?/, `/${NOTIS_DB}?`)
        notisDb = new PrismaClient({ datasources: { db: { url: notisUrl } } })

        await applyNotisMigrations(notisDb)
        // The follow-up migration must be idempotent — prod applies it once,
        // but a db-push'd dev database may already carry its objects.
        await applyNotisMigrations(notisDb, true)
    })

    afterAll(async () => {
        await notisDb?.$disconnect()
    })

    beforeEach(async () => {
        await notisDb.$executeRawUnsafe(
            'TRUNCATE TABLE "NotisWakeQueue", "NotisSubscription" RESTART IDENTITY CASCADE',
        )
    })

    test('enqueue → claim marks running and counts the attempt', async () => {
        const sub = await createSubscription('s1')
        const itemId = await enqueueLiveWake(notisDb, { subscriptionId: sub, event: EVENT })

        const item = await claimNext(notisDb)
        expect(item).not.toBeNull()
        expect(item!.id).toBe(itemId)
        expect(item!.subscriptionId).toBe(sub)
        expect(item!.attempts).toBe(1)
        expect(item!.events).toEqual([EVENT])

        const row = await notisDb.notisWakeQueue.findUnique({ where: { id: itemId } })
        expect(row?.status).toBe('running')
        expect(row?.claimedAt).toBeInstanceOf(Date)

        expect(await completeItem(notisDb, itemId, item!.attempts)).toBe(true)
        expect(
            (await notisDb.notisWakeQueue.findUnique({ where: { id: itemId } }))?.status,
        ).toBe('done')
    })

    test('a future runAfter is not claimable yet', async () => {
        const sub = await createSubscription('s2')
        await enqueueLiveWake(notisDb, {
            subscriptionId: sub,
            event: EVENT,
            runAfter: new Date(Date.now() + 60_000),
        })
        expect(await claimNext(notisDb)).toBeNull()
    })

    test('one running wake per subscription: the second item waits for the first', async () => {
        const sub = await createSubscription('s3')
        await enqueueLiveWake(notisDb, { subscriptionId: sub, event: EVENT })
        await enqueueLiveWake(notisDb, { subscriptionId: sub, event: { ...EVENT, text: 'δεύτερο' } })

        const first = await claimNext(notisDb)
        expect(first).not.toBeNull()
        // Same subscription, first still running → nothing to claim.
        expect(await claimNext(notisDb)).toBeNull()

        expect(await completeItem(notisDb, first!.id, first!.attempts)).toBe(true)
        const second = await claimNext(notisDb)
        expect(second).not.toBeNull()
        expect(second!.id).not.toBe(first!.id)
    })

    test('distinct subscriptions claim independently, including in parallel', async () => {
        const subA = await createSubscription('s4a')
        const subB = await createSubscription('s4b')
        await enqueueLiveWake(notisDb, { subscriptionId: subA, event: EVENT })
        await enqueueLiveWake(notisDb, { subscriptionId: subB, event: EVENT })

        const [a, b] = await Promise.all([claimNext(notisDb), claimNext(notisDb)])
        expect(a).not.toBeNull()
        expect(b).not.toBeNull()
        expect(a!.id).not.toBe(b!.id)
        expect(new Set([a!.subscriptionId, b!.subscriptionId])).toEqual(new Set([subA, subB]))
    })

    test('a stale running claim is reclaimable (crashed worker recovery)', async () => {
        const sub = await createSubscription('s5')
        const itemId = await enqueueLiveWake(notisDb, { subscriptionId: sub, event: EVENT })

        const first = await claimNext(notisDb)
        expect(first!.id).toBe(itemId)
        // A fresh running claim is NOT reclaimable...
        expect(await claimNext(notisDb)).toBeNull()

        // ...but a stale one is: backdate past the threshold.
        await notisDb.$executeRawUnsafe(
            `UPDATE "NotisWakeQueue" SET "claimedAt" = now() - interval '${(STALE_CLAIM_MS + 60_000) / 1000} seconds' WHERE id = '${itemId}'`,
        )
        const reclaimed = await claimNext(notisDb)
        expect(reclaimed?.id).toBe(itemId)
        expect(reclaimed?.attempts).toBe(2)
    })

    test('failItem returns to pending; attempts accumulate to the give-up threshold', async () => {
        const sub = await createSubscription('s6')
        const itemId = await enqueueLiveWake(notisDb, { subscriptionId: sub, event: EVENT })

        for (let round = 1; round <= MAX_ATTEMPTS; round++) {
            const item = await claimNext(notisDb)
            expect(item?.id).toBe(itemId)
            expect(item?.attempts).toBe(round)
            const failedAt = Date.now()
            await failItem(notisDb, itemId, item!.attempts, `boom ${round}`)
            const row = await notisDb.notisWakeQueue.findUnique({ where: { id: itemId } })
            expect(row?.status).toBe('pending')
            expect(row?.lastError).toBe(`boom ${round}`)
            // A retry waits: without a delay every attempt lands in the same
            // drain call against the same outage, so the budget buys nothing.
            expect(row!.runAfter.getTime()).toBeGreaterThanOrEqual(failedAt + retryDelayMs(round))
            expect(await claimNext(notisDb)).toBeNull()
            // Fast-forward past the backoff to reach the next round.
            await notisDb.notisWakeQueue.update({
                where: { id: itemId },
                data: { runAfter: new Date(Date.now() - 1000) },
            })
        }

        // The give-up round: the claim itself succeeds and the drainer's
        // attempts > MAX_ATTEMPTS policy fails it terminally.
        const final = await claimNext(notisDb)
        expect(final?.attempts).toBe(MAX_ATTEMPTS + 1)
        expect(final!.attempts).toBeGreaterThan(MAX_ATTEMPTS)
        await markFailed(notisDb, itemId, final!.attempts, 'gave up')
        const row = await notisDb.notisWakeQueue.findUnique({ where: { id: itemId } })
        expect(row?.status).toBe('failed')
        expect(row?.lastError).toBe('gave up')
        // Terminal: never claimed again.
        expect(await claimNext(notisDb)).toBeNull()
    })

    test('a stale-claim fence: the original worker cannot complete a reclaimed item', async () => {
        const sub = await createSubscription('s8')
        const itemId = await enqueueLiveWake(notisDb, { subscriptionId: sub, event: EVENT })

        const original = await claimNext(notisDb)
        expect(original?.id).toBe(itemId)

        // Reclaim: backdate the claim and claim again (attempts bumps to 2).
        await notisDb.$executeRawUnsafe(
            `UPDATE "NotisWakeQueue" SET "claimedAt" = now() - interval '${(STALE_CLAIM_MS + 60_000) / 1000} seconds' WHERE id = '${itemId}'`,
        )
        const reclaimer = await claimNext(notisDb)
        expect(reclaimer?.attempts).toBe(2)

        // The original worker's fence (attempts=1) misses everywhere.
        expect(await completeItem(notisDb, itemId, original!.attempts)).toBe(false)
        await failItem(notisDb, itemId, original!.attempts, 'late failure')
        let row = await notisDb.notisWakeQueue.findUnique({ where: { id: itemId } })
        expect(row?.status).toBe('running')

        // The reclaimer's fence works.
        expect(await completeItem(notisDb, itemId, reclaimer!.attempts)).toBe(true)
        row = await notisDb.notisWakeQueue.findUnique({ where: { id: itemId } })
        expect(row?.status).toBe('done')
    })

    test('the partial unique index allows at most one running row per subscription', async () => {
        const sub = await createSubscription('s9')
        await enqueueLiveWake(notisDb, { subscriptionId: sub, event: EVENT })
        await enqueueLiveWake(notisDb, { subscriptionId: sub, event: { ...EVENT, text: 'δεύτερο' } })

        const first = await claimNext(notisDb)
        expect(first).not.toBeNull()

        // Forcing the second row to running — what a raced claim would do —
        // must violate the index; claimNext maps that to nothing-claimable.
        const second = await notisDb.notisWakeQueue.findFirst({
            where: { subscriptionId: sub, status: 'pending' },
        })
        await expect(
            notisDb.$executeRawUnsafe(
                `UPDATE "NotisWakeQueue" SET status = 'running' WHERE id = '${second!.id}'`,
            ),
        ).rejects.toThrow(/23505|already exists/i)
    })

    test('the inbound migration created the unique index on birdMessageId', async () => {
        const sub = await createSubscription('s7')
        await notisDb.notisMessage.create({
            data: { subscriptionId: sub, direction: 'inbound', body: 'a', birdMessageId: 'dup' },
        })
        await expect(
            notisDb.notisMessage.create({
                data: { subscriptionId: sub, direction: 'inbound', body: 'b', birdMessageId: 'dup' },
            }),
        ).rejects.toMatchObject({ code: 'P2002' })
    })

    test('batch enqueue coalesces into the pending row: events append, earliest runAfter wins', async () => {
        const sub = await createSubscription('b1')
        const later = new Date(Date.now() + 120_000)
        const sooner = new Date(Date.now() + 60_000)

        const first = await enqueueBatchWake(notisDb, {
            subscriptionId: sub,
            event: EVENT,
            runAfter: later,
        })
        expect(first.coalesced).toBe(false)

        const second = await enqueueBatchWake(notisDb, {
            subscriptionId: sub,
            event: { ...EVENT, text: 'δεύτερο' },
            runAfter: sooner,
        })
        expect(second).toEqual({ id: first.id, coalesced: true })

        const row = await notisDb.notisWakeQueue.findUnique({ where: { id: first.id } })
        expect(row?.events).toEqual([EVENT, { ...EVENT, text: 'δεύτερο' }])
        expect(row?.runAfter.getTime()).toBe(sooner.getTime())
    })

    test('concurrent batch enqueues for one subscription land in a single row', async () => {
        const sub = await createSubscription('b2')
        const runAfter = new Date()

        const results = await Promise.all(
            Array.from({ length: 5 }, (_, i) =>
                enqueueBatchWake(notisDb, {
                    subscriptionId: sub,
                    event: { ...EVENT, text: `e${i}` },
                    runAfter,
                }),
            ),
        )

        const ids = new Set(results.map((r) => r.id))
        expect(ids.size).toBe(1)
        const row = await notisDb.notisWakeQueue.findUnique({ where: { id: [...ids][0] } })
        expect((row?.events as unknown[]).length).toBe(5)
    })

    test('an enqueue after the claim opens a fresh pending row beside the running one', async () => {
        const sub = await createSubscription('b3')
        const first = await enqueueBatchWake(notisDb, {
            subscriptionId: sub,
            event: EVENT,
            runAfter: new Date(Date.now() - 1000),
        })

        const claimed = await claimNext(notisDb)
        expect(claimed?.id).toBe(first.id)
        expect(claimed?.lane).toBe('batch')

        // The running row no longer matches the append; the partial index
        // covers only pending, so a fresh row is correct and allowed.
        const second = await enqueueBatchWake(notisDb, {
            subscriptionId: sub,
            event: { ...EVENT, text: 'μετά το claim' },
            runAfter: new Date(),
        })
        expect(second.coalesced).toBe(false)
        expect(second.id).not.toBe(first.id)
    })

    test('claim prefers a due live row over an older due batch row', async () => {
        const subA = await createSubscription('b4a')
        const subB = await createSubscription('b4b')
        await enqueueBatchWake(notisDb, {
            subscriptionId: subA,
            event: EVENT,
            runAfter: new Date(Date.now() - 60_000),
        })
        await enqueueLiveWake(notisDb, { subscriptionId: subB, event: EVENT })

        const first = await claimNext(notisDb)
        expect(first?.lane).toBe('live')
        const second = await claimNext(notisDb)
        expect(second?.lane).toBe('batch')
    })

    test('deferItem re-pends without consuming the attempt, fenced on the claim', async () => {
        const sub = await createSubscription('b5')
        await enqueueBatchWake(notisDb, {
            subscriptionId: sub,
            event: EVENT,
            runAfter: new Date(Date.now() - 1000),
        })
        const claimed = await claimNext(notisDb)
        expect(claimed?.attempts).toBe(1)

        const runAfter = new Date(Date.now() + 3_600_000)
        await deferItem(notisDb, claimed!.id, claimed!.attempts, runAfter)
        const row = await notisDb.notisWakeQueue.findUnique({ where: { id: claimed!.id } })
        expect(row?.status).toBe('pending')
        expect(row?.attempts).toBe(0)
        expect(row?.runAfter.getTime()).toBe(runAfter.getTime())

        // The fence: a second defer with the stale claim identity is a no-op.
        await deferItem(notisDb, claimed!.id, claimed!.attempts, new Date())
        const after = await notisDb.notisWakeQueue.findUnique({ where: { id: claimed!.id } })
        expect(after?.runAfter.getTime()).toBe(runAfter.getTime())
    })
})
