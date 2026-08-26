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

/** The queue states that are (or were) live work — what the panel thread
 *  and the evaluation export both mean by "still in the queue". */
export const LIVE_QUEUE_STATUSES = ["pending", "running", "failed"] as const;

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

/**
 * Enqueue on the live lane, coalescing per subscription like the batch lane:
 * while a pending live row exists (the previous message's wake has not been
 * claimed yet), a new inbound APPENDS its event instead of queueing behind —
 * so «τι γίνεται με Χ;» followed seconds later by «άκυρο, Υ εννοούσα» runs as
 * ONE wake that sees both messages, and the reader never gets an answer to a
 * request they already corrected.
 *
 * The append is a compare-and-swap fenced on updatedAt (no raw SQL: the
 * webhook handlers call this inside their interactive transaction, where a
 * caught 23505 would poison the transaction — see enqueueBatchWake). A CAS
 * loss re-reads; a row the claimer flipped to running no longer matches and
 * the event correctly becomes a fresh pending row. The residual both-create
 * race hits the partial unique index and fails the webhook, which Bird
 * retries — the retry lands on the append path.
 */
export async function enqueueLiveWake(
  db: Db,
  input: { subscriptionId: string; event: unknown; runAfter?: Date },
): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const pending = await db.notisWakeQueue.findFirst({
      where: { subscriptionId: input.subscriptionId, lane: "live", status: "pending" },
      select: { id: true, events: true, updatedAt: true, runAfter: true },
    });
    if (!pending) break;
    const runAfter = input.runAfter ?? new Date();
    const appended = await db.notisWakeQueue.updateMany({
      where: { id: pending.id, status: "pending", updatedAt: pending.updatedAt },
      data: {
        events: [
          ...(pending.events as Prisma.InputJsonValue[]),
          input.event,
        ] as Prisma.InputJsonValue,
        // A fresh reader message must not inherit a retry-backoff row's
        // fate: pull runAfter forward (LEAST, like the batch path) and
        // reset the attempts budget — materially this is a new wake, and
        // without the reset the appended message could be terminally
        // failed without a single model run of its own.
        runAfter: pending.runAfter < runAfter ? pending.runAfter : runAfter,
        attempts: 0,
        updatedAt: new Date(),
      },
    });
    if (appended.count === 1) return pending.id;
  }
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
 * Refresh a running claim's claimedAt — the wake's heartbeat. A wake can
 * legally run far past STALE_CLAIM_MS (turns x the Anthropic client budget),
 * and without a heartbeat the reclaimer starts a SECOND model run while the
 * first still delivers. Touching the claim each turn keeps a live worker's
 * claim fresh; a dead worker stops touching it and is reclaimed on the old
 * schedule. Returns false when the claim is no longer ours — the caller
 * must stop working.
 */
export async function touchClaim(db: Db, id: string, attempts: number): Promise<boolean> {
  const touched = await db.notisWakeQueue.updateMany({
    where: { id, status: "running", attempts },
    data: { claimedAt: new Date() },
  });
  return touched.count === 1;
}

/**
 * Consume the subscription's pending live rows and return their events — the
 * mid-run absorption primitive: a running wake adopts messages that arrived
 * after it started, and the rows that would have answered them separately
 * are closed as done so the reader never gets two answers.
 *
 * Ordering makes it lose-nothing: rows are flipped pending→done first
 * (fenced, one by one), and events are read back AFTER the flip — an append
 * that raced in before the flip is included in the read; one that lost the
 * fence created a fresh pending row that stays for the next wake.
 */
export async function consumePendingLiveEvents(db: Db, subscriptionId: string): Promise<unknown[]> {
  const rows = await db.notisWakeQueue.findMany({
    where: { subscriptionId, lane: "live", status: "pending" },
    select: { id: true },
  });
  if (rows.length === 0) return [];
  const consumed: string[] = [];
  for (const row of rows) {
    const flipped = await db.notisWakeQueue.updateMany({
      where: { id: row.id, status: "pending" },
      data: { status: "done" },
    });
    if (flipped.count === 1) consumed.push(row.id);
  }
  if (consumed.length === 0) return [];
  const done = await Promise.all(
    consumed.map((id) => db.notisWakeQueue.findUnique({ where: { id } })),
  );
  return done.flatMap((r) => (Array.isArray(r?.events) ? (r.events as unknown[]) : []));
}

/**
 * Enqueue on the batch lane, coalescing per subscription: while a pending
 * batch row exists, new events append to it and the earliest runAfter wins,
 * so someone in three cities gets ONE wake holding all three briefs.
 *
 * The append is an atomic UPDATE with a row lock; when it matches nothing
 * a fresh row is created. A row the claimer just flipped to running no
 * longer matches the UPDATE, so the new event correctly becomes a fresh
 * pending row (the index covers only `pending`).
 *
 * Concurrency is serialized per subscription by a transaction-scoped
 * advisory lock, NOT by catching the index violation: inside a caller's
 * interactive transaction a 23505 aborts the whole transaction, so the
 * retry below would fail with 25P02 and take the caller's fan-out down with
 * it. Holding the lock makes the append-then-create sequence atomic against
 * other transactions — the loser waits, then sees the winner's committed
 * row and appends to it. Callers that pass a plain client (auto-commit, so
 * the lock is released immediately) still race, and for them the retry loop
 * is the correct fallback: without a surrounding transaction the caught
 * violation costs nothing.
 */
export async function enqueueBatchWake(
  db: Db,
  input: { subscriptionId: string; event: unknown; runAfter: Date },
): Promise<{ id: string; coalesced: boolean }> {
  const eventJson = JSON.stringify(input.event);
  // $executeRaw, not $queryRaw: the lock function returns void, which has no
  // Prisma column type to deserialize.
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.subscriptionId})::bigint)`;
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
export function isUniqueViolation(error: unknown): boolean {
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
 *   for one person run strictly one at a time, or concurrent state reads
 *   would race and the conversation would interleave. The guard covers stale
 *   running rows too, and deliberately so: while a stale row exists it is
 *   the subscription's only candidate, so reclaiming it is the sole way
 *   forward. Excluding merely FRESH running rows would let a newer live row
 *   outrank the stale one under the live-first ORDER BY, and promoting it
 *   would collide with "NotisWakeQueue_one_running_per_sub" on every pass —
 *   the stale row unreclaimable, the live row unclaimable, and (since a null
 *   claim reads as "queue empty") every other subscription's work stranded
 *   behind it.
 *
 * The NOT EXISTS guard is snapshot-based and still raceable (a concurrent
 * claim's `running` is invisible until it commits while SKIP LOCKED hides
 * its row from the candidate scan). The partial unique index is the real
 * invariant; losing that race means another worker is already serving this
 * subscription, so the claim retries for a different one rather than
 * reporting the whole queue empty.
 */
export async function claimNext(db: Db): Promise<ClaimedItem | null> {
  const staleSeconds = STALE_CLAIM_MS / 1000;
  for (let attempt = 0; attempt < 3; attempt++) {
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
      if (!isUniqueViolation(error)) throw error;
    }
  }
  return null;
}

/**
 * Fold a claimed batch row's events into the pending batch row that took its
 * slot, then close it as done — one statement, so the events can never be
 * lost or counted twice.
 *
 * This is the running → pending path's other half. `enqueueBatchWake` opens a
 * fresh pending row the moment a claim flips the old one to `running`, which
 * is correct and tested; the partial unique index then allows only one, so a
 * plain re-pend of the claimed row (a defer or a retryable failure) would
 * raise 23505 — aborting the drain, stranding the row in `running` until the
 * stale reclaim, and burning attempts until its coalesced briefs are dropped
 * terminally. Merging is what coalescing means anyway: the events belong in
 * the survivor.
 *
 * Both callers reach this by catching the violation, which is safe only
 * because deferItem and failItem run OUTSIDE any caller transaction (see
 * processItem): a 23505 inside one would abort it before the recovery could
 * run. Keep it that way.
 */
async function mergeIntoPendingRow(
  db: Db,
  id: string,
  attempts: number,
  runAfter: Date,
  note: string,
): Promise<void> {
  // Lane-agnostic on purpose: BOTH lanes now carry a one-pending-per-sub
  // partial unique index, so a running row of either lane can lose its
  // re-pend to a newer pending row and must merge into it — a batch-only
  // merge left a live row stranded in `running` until the stale reclaim.
  await db.$queryRaw`
    WITH src AS (
      SELECT id, "subscriptionId", lane, events
      FROM "NotisWakeQueue"
      WHERE id = ${id}
        AND status = 'running'::"QueueItemStatus"
        AND attempts = ${attempts}
    ), merged AS (
      UPDATE "NotisWakeQueue" p
      SET events = p.events || src.events,
          "runAfter" = LEAST(p."runAfter", ${runAfter}),
          "updatedAt" = now()
      FROM src
      WHERE p."subscriptionId" = src."subscriptionId"
        AND p.lane = src.lane
        AND p.status = 'pending'::"QueueItemStatus"
        AND p.id <> src.id
      RETURNING p.id
    )
    UPDATE "NotisWakeQueue" q
    SET status = 'done'::"QueueItemStatus",
        "claimedAt" = NULL,
        "lastError" = ${note},
        "updatedAt" = now()
    FROM src
    WHERE q.id = src.id AND EXISTS (SELECT 1 FROM merged)
  `;
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
  try {
    await db.notisWakeQueue.updateMany({
      where: { id, status: "running", attempts },
      data: { status: "pending", claimedAt: null, attempts: attempts - 1, runAfter },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    await mergeIntoPendingRow(db, id, attempts, runAfter, "deferred into a newer pending row");
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
 *  already-completed item is left untouched. Merge-aware like deferItem —
 *  a batch row whose slot was taken folds its events into the survivor
 *  rather than colliding with the coalescing index. */
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
  const lastError = error.slice(0, 2000);
  try {
    await db.notisWakeQueue.updateMany({
      where: { id, status: "running", attempts },
      data: {
        status: "pending",
        claimedAt: null,
        runAfter: new Date(Date.now() + retryDelayMs(attempts)),
        lastError,
      },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // The survivor inherits this row's schedule so the merged events keep
    // the retry they were owed.
    const src = await db.notisWakeQueue.findUnique({ where: { id }, select: { runAfter: true } });
    if (!src) return;
    await mergeIntoPendingRow(
      db,
      id,
      attempts,
      src.runAfter,
      `merged into a newer pending batch row after: ${lastError}`.slice(0, 2000),
    );
  }
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
