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
 */

export type Db = PrismaClient | Prisma.TransactionClient;

export const MAX_ATTEMPTS = 3;
export const STALE_CLAIM_MS = 5 * 60_000;

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
 */
export async function claimNext(db: Db): Promise<ClaimedItem | null> {
  const staleSeconds = STALE_CLAIM_MS / 1000;
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
}

/** Mark done — called INSIDE the wake's persist transaction: once the wake
 *  row is committed, a retry must never re-run the model. */
export async function completeItem(db: Db, id: string): Promise<void> {
  await db.notisWakeQueue.update({
    where: { id },
    data: { status: "done", lastError: null },
  });
}

/** Return to pending for a later retry (attempts already counted at claim). */
export async function failItem(db: Db, id: string, error: string): Promise<void> {
  await db.notisWakeQueue.update({
    where: { id },
    data: { status: "pending", claimedAt: null, lastError: error.slice(0, 2000) },
  });
}

/** Terminal failure — the item is out of retries. */
export async function markFailed(db: Db, id: string, error: string): Promise<void> {
  await db.notisWakeQueue.update({
    where: { id },
    data: { status: "failed", lastError: error.slice(0, 2000) },
  });
}

export type { NotisWakeQueue };
