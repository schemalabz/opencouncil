import { alert as sendAlert } from "./alert";
import { hasNotisDb, notisDb } from "./db";
import { hasMainDb, mainDb } from "./main-db";

/**
 * Reconciliation janitor: every subscription belongs to an OpenCouncil user
 * (inbound never enrolls unknown numbers), so a userId with no notis_users
 * row means the account was deleted — purge the subscription, cascading its
 * wakes, messages and journal. Behind a blast-radius guard: a broken view
 * looks exactly like a mass deletion, so past the threshold it alarms and
 * deletes nothing.
 *
 * The delete runs under a transaction-scoped advisory lock, so overlapping
 * instances (horizontal scale, deploy overlap) never purge concurrently —
 * the loser skips instead of repeating the work. The reads sit outside it:
 * they mutate nothing, and a transaction held open across a cross-database
 * round trip is how a run dies on Prisma's timeout instead of finishing.
 */

// Arbitrary constant identifying "the notis janitor" in pg_locks.
const JANITOR_LOCK_KEY = 0x6e6f7469;

/** The delete transaction's budget. Prisma's default is 5s, which the first
 *  run after a deploy can miss on client construction and the TLS handshake
 *  alone — instrumentation.ts fires that run 60s after boot, so the cold
 *  path is on every deploy. */
const DELETE_TIMEOUT_MS = 30_000;

export interface JanitorResult {
  ran: boolean;
  reason?: string;
  subscriptions: number;
  missingUsers: number;
  deleted: number;
  refused: boolean;
}

/** The guard rule: allow at most max(1, 1% of subscriptions) deletions. */
export function blastRadiusExceeded(subscriptions: number, missing: number): boolean {
  return missing > Math.max(1, Math.floor(subscriptions * 0.01));
}

const alert = (message: string) => sendAlert("janitor", message, "🧹");

export async function runJanitor(): Promise<JanitorResult> {
  if (!hasNotisDb() || !hasMainDb()) {
    return {
      ran: false,
      reason: "NOTIS_DATABASE_URL and MAIN_DATABASE_URL are both required",
      subscriptions: 0,
      missingUsers: 0,
      deleted: 0,
      refused: false,
    };
  }

  try {
    // Phase 1, outside any transaction: who is orphaned? Neither read
    // mutates anything, and duplicating them across an overlapping run
    // costs two queries — while holding a transaction open across a
    // cross-database round trip risks P2028 and loses the whole run.
    const db = notisDb();
    const subscriptions = await db.notisSubscription.findMany({
      select: { id: true, userId: true },
    });
    if (subscriptions.length === 0) {
      return { ran: true, subscriptions: 0, missingUsers: 0, deleted: 0, refused: false };
    }

    const existing = await mainDb().notisUserRow.findMany({
      where: { id: { in: subscriptions.map((s) => s.userId) } },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((u) => u.id));
    const orphaned = subscriptions.filter((s) => !existingIds.has(s.userId));

    if (blastRadiusExceeded(subscriptions.length, orphaned.length)) {
      await alert(
        `REFUSED: ${orphaned.length}/${subscriptions.length} subscriptions have no notis_users row — deleting nothing. ` +
          `The purge stays off until someone looks: confirm the views are healthy, then clear the backlog by hand.`,
      );
      return {
        ran: true,
        subscriptions: subscriptions.length,
        missingUsers: orphaned.length,
        deleted: 0,
        refused: true,
      };
    }

    if (orphaned.length === 0) {
      return {
        ran: true,
        subscriptions: subscriptions.length,
        missingUsers: 0,
        deleted: 0,
        refused: false,
      };
    }

    // Phase 2: the mutation, serialized. The advisory lock is xact-scoped,
    // so it covers exactly the delete and is released with it — a pooled
    // connection can never carry it into another run.
    const deleted = await db.$transaction(
      async (tx) => {
        const [{ locked }] = await tx.$queryRaw<Array<{ locked: boolean }>>`
          SELECT pg_try_advisory_xact_lock(${JANITOR_LOCK_KEY}) AS locked
        `;
        if (!locked) return null;
        const result = await tx.notisSubscription.deleteMany({
          where: { id: { in: orphaned.map((s) => s.id) } },
        });
        return result.count;
      },
      { timeout: DELETE_TIMEOUT_MS },
    );

    if (deleted === null) {
      return {
        ran: false,
        reason: "another janitor run holds the lock",
        subscriptions: subscriptions.length,
        missingUsers: orphaned.length,
        deleted: 0,
        refused: false,
      };
    }

    console.log(
      `[notis:janitor] purged ${deleted} subscription(s) whose user left notis_users`,
    );
    return {
      ran: true,
      subscriptions: subscriptions.length,
      missingUsers: orphaned.length,
      deleted,
      refused: false,
    };
  } catch (error) {
    await alert(`run failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
