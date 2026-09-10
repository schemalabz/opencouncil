import type { Prisma } from "../../generated/client";
import type { Db } from "./queue-core";

/**
 * Put terminally failed wakes back in the queue.
 *
 * A failed row is not a loss: it still carries its events, its subscription
 * and its lane, which is everything the drain reads. When an outage takes
 * the model away, the queue burns its attempts on each wake and then drops
 * it, and the reader who asked a question gets silence. This is the way
 * back, for an operator who has fixed the cause.
 *
 * Only failed rows are re-opened, and every write is fenced on the status
 * the plan saw. A row the drain has taken back in the meantime is left
 * alone.
 */

/** One pending row per subscription per lane — two partial unique indexes
 *  say so (NotisWakeQueue_one_pending_batch_per_sub and its live twin), and
 *  the plan honours them: a group re-opens one row and folds the rest. */
const keyOf = (row: { subscriptionId: string; lane: string }) => `${row.subscriptionId}:${row.lane}`;

/** What the plan needs of a failed row, and nothing more. */
export interface RequeueCandidate {
    id: string;
    subscriptionId: string;
    lane: string;
    events: unknown[];
    updatedAt: Date;
}

export interface RequeuePlan {
    /** Failed rows to re-open, each with its own events and any it absorbed. */
    revive: { id: string; events: unknown[] }[];
    /** Pending rows that gain the events of failed rows they share a slot with. */
    appendTo: { id: string; events: unknown[] }[];
    /** Failed rows to close, because their events now live somewhere else. */
    close: string[];
    /** Candidates the ceiling left for a later run. */
    skipped: number;
}

/**
 * Decide what to do with a set of failed rows, given the slots that pending
 * rows already hold. Pure, so the rules are testable without a database.
 *
 * A group is every failed row of one subscription and one lane. When a
 * pending row already holds that slot, the group's events go to it. When no
 * row holds it, the newest of the group is re-opened and its siblings fold
 * into it.
 */
export function planRequeue(
    candidates: RequeueCandidate[],
    pendingByKey: Map<string, string>,
    limit: number,
): RequeuePlan {
    const groups = new Map<string, RequeueCandidate[]>();
    for (const row of candidates) {
        const group = groups.get(keyOf(row)) ?? [];
        group.push(row);
        groups.set(keyOf(row), group);
    }

    const plan: RequeuePlan = { revive: [], appendTo: [], close: [], skipped: 0 };
    let budget = limit;

    for (const [key, group] of groups) {
        // Newest first: its events are the ones that keep their row.
        const ordered = [...group].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        if (budget <= 0) {
            plan.skipped += ordered.length;
            continue;
        }
        budget--;

        const holder = pendingByKey.get(key);
        if (holder) {
            plan.appendTo.push({ id: holder, events: ordered.flatMap((row) => row.events) });
            plan.close.push(...ordered.map((row) => row.id));
            continue;
        }

        const [survivor, ...rest] = ordered;
        plan.revive.push({
            id: survivor.id,
            events: [...survivor.events, ...rest.flatMap((row) => row.events)],
        });
        plan.close.push(...rest.map((row) => row.id));
    }

    return plan;
}

export interface RequeueResult {
    /** Failed rows inside the window, before the ceiling. */
    matched: number;
    /** Rows returned to pending. */
    revived: number;
    /** Rows closed because their events moved to another row. */
    folded: number;
    /** Rows the ceiling left for a second run. */
    skipped: number;
}

/** How many slots one call may re-open. A window typed with one zero too
 *  many should not wake a year of failures in a single tick. */
export const REQUEUE_LIMIT = 200;

const FOLDED_NOTE = "events moved to the row that holds the slot, on an operator retry";

export async function requeueFailedWakes(
    db: Db,
    opts: { since: Date; limit?: number; now?: () => Date },
): Promise<RequeueResult> {
    const now = opts.now ?? (() => new Date());
    const failed = await db.notisWakeQueue.findMany({
        where: { status: "failed", updatedAt: { gte: opts.since } },
        select: { id: true, subscriptionId: true, lane: true, events: true, updatedAt: true },
    });
    if (failed.length === 0) return { matched: 0, revived: 0, folded: 0, skipped: 0 };

    const candidates: RequeueCandidate[] = failed.map((row) => ({
        id: row.id,
        subscriptionId: row.subscriptionId,
        lane: String(row.lane),
        events: Array.isArray(row.events) ? (row.events as unknown[]) : [],
        updatedAt: row.updatedAt,
    }));

    const pending = await db.notisWakeQueue.findMany({
        where: {
            status: "pending",
            subscriptionId: { in: [...new Set(candidates.map((c) => c.subscriptionId))] },
        },
        select: { id: true, subscriptionId: true, lane: true },
    });
    const pendingByKey = new Map(
        pending.map((row) => [keyOf({ subscriptionId: row.subscriptionId, lane: String(row.lane) }), row.id]),
    );

    const plan = planRequeue(candidates, pendingByKey, opts.limit ?? REQUEUE_LIMIT);
    const at = now();
    let revived = 0;
    let folded = 0;

    for (const item of plan.revive) {
        const result = await db.notisWakeQueue.updateMany({
            where: { id: item.id, status: "failed" },
            data: {
                status: "pending",
                attempts: 0,
                claimedAt: null,
                runAfter: at,
                lastError: null,
                events: item.events as Prisma.InputJsonValue,
            },
        });
        revived += result.count;
    }

    for (const item of plan.appendTo) {
        if (item.events.length === 0) continue;
        // The same append the enqueue path uses, so a drain running beside
        // this one sees one row grow rather than two rows compete.
        await db.$executeRaw`
      UPDATE "NotisWakeQueue"
      SET events = events || ${JSON.stringify(item.events)}::jsonb,
          "runAfter" = LEAST("runAfter", ${at}),
          "updatedAt" = now()
      WHERE id = ${item.id} AND status = 'pending'::"QueueItemStatus"
    `;
    }

    for (const id of plan.close) {
        const result = await db.notisWakeQueue.updateMany({
            where: { id, status: "failed" },
            data: { status: "done", lastError: FOLDED_NOTE },
        });
        folded += result.count;
    }

    return { matched: candidates.length, revived, folded, skipped: plan.skipped };
}
