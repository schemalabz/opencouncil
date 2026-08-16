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

/** A raw-query unique violation (Postgres 23505) surfaced through Prisma. */
function isUniqueViolation(error: unknown): boolean {
  const meta = (error as { meta?: { code?: unknown } } | undefined)?.meta;
  return meta?.code === "23505";
}

/**
 * Claim the next due live item: one atomic statement, so concurrent workers
 * (the webhook kick and the sweeper, or two instances) never double-claim —
 * FOR UPDATE SKIP LOCKED skips rows a parallel claim is locking.
 *
 * Two eligibility rules beyond "pending and due":
 * - a running row whose claim went stale is claimable again (crash recovery);
 * - a subscription with a FRESH running row yields nothing — wakes for one
 *   person run strictly one at a time, or journal seq allocation would race
 *   and the conversation would interleave.
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
        WHERE c.lane = 'live'::"QueueLane"
          AND c."runAfter" <= now()
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
              AND r."claimedAt" >= now() - make_interval(secs => ${staleSeconds})
          )
        ORDER BY c."runAfter", c."createdAt"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING q.id, q."subscriptionId", q.events, q.attempts
    `;
    return rows[0] ?? null;
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
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
export async function failItem(
  db: Db,
  id: string,
  attempts: number,
  error: string,
): Promise<void> {
  await db.notisWakeQueue.updateMany({
    where: { id, status: "running", attempts },
    data: { status: "pending", claimedAt: null, lastError: error.slice(0, 2000) },
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
