import type { NotisWakeQueue, Prisma, PrismaClient } from "../../generated/client";

/**
 * The wake queue's state machine, DB-injected and dependency-free (relative
 * imports only) so the main repo's integration tests can drive it against a
 * real Postgres without pulling in the service's env or singletons.
 *
 * Lifecycle: pending → running (claimed) → done | failed. A stale running
 * row (worker crashed mid-wake) becomes claimable again after
 * STALE_CLAIM_MS. Attempts are counted at claim time; a claim arriving with
 * attempts > MAX_ATTEMPTS is the signal to fail the item terminally instead
 * of processing it.
 *
 * Claim ownership: (id, attempts) names one claim. Every transition out of
 * `running` is fenced on it, so a worker whose claim was reclaimed (stale)
 * cannot complete, fail, or re-pend the item — its persist aborts via
 * ClaimLostError and the reclaimer's run is the only one that lands.
 */

export type Db = PrismaClient | Prisma.TransactionClient;

export const MAX_ATTEMPTS = 3;
// Reclaim threshold for crash recovery. With the Anthropic client capped at
// 3 minutes per call (lib/anthropic.ts), a single hung turn cannot push an
// alive wake past this on its own; a pathological full-length wake that
// still exceeds it loses its claim fence and aborts without side effects —
// the reclaim costs a duplicate model run, never a duplicate send.
export const STALE_CLAIM_MS = 15 * 60_000;

/** Thrown inside the persist transaction when the claim fence fails —
 *  another worker reclaimed the item while this one was running the model. */
export class ClaimLostError extends Error {
  constructor(id: string) {
    super(`queue item ${id}: claim lost to a reclaiming worker`);
    this.name = "ClaimLostError";
  }
}

export interface ClaimedItem {
  id: string;
  subscriptionId: string;
  lane: "live" | "batch";
  /** Coalesced WakeEvent[] Json — the shell validates with wakeEventSchema. */
  events: unknown;
  attempts: number;
}

export async function enqueueLiveWake(
  db: Db,
  input: { subscriptionId: string; event: unknown; runAfter?: Date },
): Promise<string> {
  const row = await db.notisWakeQueue.create({
    data: {
      subscriptionId: input.subscriptionId,
      lane: "live",
      events: [input.event] as Prisma.InputJsonValue,
      runAfter: input.runAfter ?? new Date(),
    },
    select: { id: true },
  });
  return row.id;
}

/**
 * Enqueue on the batch lane, coalescing per subscription: while a pending
 * batch row exists, new events append to it and the earliest runAfter wins,
 * so someone in three cities gets ONE wake holding all three briefs.
 *
 * The append is an atomic UPDATE with a row lock; when it matches nothing
 * a fresh row is created. The partial unique index
 * "NotisWakeQueue_one_pending_batch_per_sub" backstops the create race —
 * the loser hits 23505 and retries once, landing as an append. A row the
 * claimer just flipped to running no longer matches the UPDATE, so the new
 * event correctly becomes a fresh pending row (the index covers only
 * `pending`).
 */
export async function enqueueBatchWake(
  db: Db,
  input: { subscriptionId: string; event: unknown; runAfter: Date },
): Promise<{ id: string; coalesced: boolean }> {
  const eventJson = JSON.stringify(input.event);
  for (let attempt = 0; attempt < 2; attempt++) {
    const appended = await db.$queryRaw<Array<{ id: string }>>`
      UPDATE "NotisWakeQueue" q
      SET events = q.events || ${eventJson}::jsonb,
          "runAfter" = LEAST(q."runAfter", ${input.runAfter}),
          "updatedAt" = now()
      WHERE q.id = (
        SELECT c.id FROM "NotisWakeQueue" c
        WHERE c."subscriptionId" = ${input.subscriptionId}
          AND c.lane = 'batch'::"QueueLane"
          AND c.status = 'pending'::"QueueItemStatus"
        FOR UPDATE
        LIMIT 1
      )
      RETURNING q.id
    `;
    if (appended[0]) return { id: appended[0].id, coalesced: true };
    try {
      const row = await db.notisWakeQueue.create({
        data: {
          subscriptionId: input.subscriptionId,
          lane: "batch",
          events: [input.event] as Prisma.InputJsonValue,
          runAfter: input.runAfter,
        },
        select: { id: true },
      });
      return { id: row.id, coalesced: false };
    } catch (error) {
      // Concurrent create won the index — loop back into the append.
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new Error(
    `enqueueBatchWake: subscription ${input.subscriptionId} raced twice — giving up`,
  );
}

/** A unique violation (Postgres 23505) surfaced through Prisma — raw
 *  queries carry it in meta.code, client calls as PrismaClientKnownRequestError P2002. */
function isUniqueViolation(error: unknown): boolean {
  const err = error as { meta?: { code?: unknown }; code?: unknown } | undefined;
  return err?.meta?.code === "23505" || err?.code === "P2002";
}

/**
 * Claim the next due item across both lanes, live first (reply latency
 * beats batch fan-out; batch rows are jittered anyway): one atomic
 * statement, so concurrent workers
 * (the webhook kick and the sweeper, or two instances) never double-claim —
 * FOR UPDATE SKIP LOCKED skips rows a parallel claim is locking.
 *
 * Two eligibility rules beyond "pending and due":
 * - a running row whose claim went stale is claimable again (crash recovery);
 * - a subscription with a running row of ANY age yields nothing else. Wakes
 *   for one person run strictly one at a time, or journal seq allocation
 *   would race and the conversation would interleave. The guard deliberately
 *   covers stale running rows: while one exists it is that subscription's
 *   only candidate, so reclaiming it is the sole way forward. Excluding only
 *   FRESH ones let a pending row of the same subscription be selected
 *   instead, and promoting it violates the one-running-per-subscription
 *   index — which the catch below reads as "nothing claimable", so the drain
 *   stops for EVERY subscription, permanently.
 *
 * The NOT EXISTS guard alone is snapshot-based and raceable (a concurrent
 * claim's `running` is invisible until it commits while SKIP LOCKED hides
 * its row from the candidate scan). The partial unique index
 * "NotisWakeQueue_one_running_per_sub" is the real invariant: the losing
 * claim hits 23505 and reports nothing claimable.
 */
export async function claimNext(db: Db): Promise<ClaimedItem | null> {
  const staleSeconds = STALE_CLAIM_MS / 1000;
  try {
    const rows = await db.$queryRaw<Array<ClaimedItem>>`
      UPDATE "NotisWakeQueue" q
      SET status = 'running'::"QueueItemStatus",
          "claimedAt" = now(),
          attempts = q.attempts + 1,
          "updatedAt" = now()
      WHERE q.id = (
        SELECT c.id FROM "NotisWakeQueue" c
        WHERE c."runAfter" <= now()
          AND (
            c.status = 'pending'::"QueueItemStatus"
            OR (c.status = 'running'::"QueueItemStatus"
                AND c."claimedAt" < now() - make_interval(secs => ${staleSeconds}))
          )
          AND NOT EXISTS (
            SELECT 1 FROM "NotisWakeQueue" r
            WHERE r."subscriptionId" = c."subscriptionId"
              AND r.status = 'running'::"QueueItemStatus"
              AND r.id <> c.id
          )
        ORDER BY (c.lane = 'live'::"QueueLane") DESC, c."runAfter", c."createdAt"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING q.id, q."subscriptionId", q.lane, q.events, q.attempts
    `;
    return rows[0] ?? null;
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

/**
 * Return a claimed item to pending WITHOUT consuming an attempt — used when
 * a rail (pause, quiet hours) defers the work before the model ran. Fenced
 * like every transition out of `running`.
 */
export async function deferItem(
  db: Db,
  id: string,
  attempts: number,
  runAfter: Date,
): Promise<void> {
  await db.notisWakeQueue.updateMany({
    where: { id, status: "running", attempts },
    data: { status: "pending", claimedAt: null, attempts: attempts - 1, runAfter },
  });
}

/**
 * Mark done — called INSIDE the wake's persist transaction: once the wake
 * row is committed, a retry must never re-run the model. Returns false when
 * the claim fence fails (the item was reclaimed); the caller must abort the
 * transaction so nothing of the lost run lands.
 */
export async function completeItem(db: Db, id: string, attempts: number): Promise<boolean> {
  const result = await db.notisWakeQueue.updateMany({
    where: { id, status: "running", attempts },
    data: { status: "done", lastError: null },
  });
  return result.count === 1;
}

/** Return to pending for a later retry. Fenced on the claim: a lost or
 *  already-completed item is left untouched. */
/** How long a failed item waits before its next attempt: 1 minute, then 4,
 *  then 9. Without a delay all three attempts land inside a single drain call
 *  against the same outage, so the attempt budget buys nothing — a
 *  thirty-second model blip would drop the message permanently. */
export function retryDelayMs(attempts: number): number {
  return Math.min(attempts, MAX_ATTEMPTS) ** 2 * 60_000;
}

export async function failItem(
  db: Db,
  id: string,
  attempts: number,
  error: string,
): Promise<void> {
  await db.notisWakeQueue.updateMany({
    where: { id, status: "running", attempts },
    data: {
      status: "pending",
      claimedAt: null,
      runAfter: new Date(Date.now() + retryDelayMs(attempts)),
      lastError: error.slice(0, 2000),
    },
  });
}

/** Terminal failure — the item is out of retries. */
export async function markFailed(
  db: Db,
  id: string,
  attempts: number,
  error: string,
): Promise<void> {
  await db.notisWakeQueue.updateMany({
    where: { id, status: "running", attempts },
    data: { status: "failed", lastError: error.slice(0, 2000) },
  });
}

export type { NotisWakeQueue };
