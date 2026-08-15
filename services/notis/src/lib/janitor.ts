import { env } from "@/env.mjs";
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
 * Runs under a transaction-scoped advisory lock, so overlapping instances
 * (horizontal scale, deploy overlap) never reconcile concurrently — the
 * loser skips its run instead of doubling the work.
 */

// Arbitrary constant identifying "the notis janitor" in pg_locks.
const JANITOR_LOCK_KEY = 0x6e6f7469;

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

async function alert(message: string): Promise<void> {
  console.error(`[notis:janitor] ${message}`);
  if (!env.NOTIS_ALERT_WEBHOOK_URL) return;
  await fetch(env.NOTIS_ALERT_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: `🧹 notis janitor: ${message}` }),
  }).catch((e) => console.error("[notis:janitor] alert webhook failed:", e));
}

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
    return await notisDb().$transaction(async (tx) => {
      // xact-scoped: released automatically at commit/rollback, so a pooled
      // connection can never keep the lock across runs.
      const [{ locked }] = await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${JANITOR_LOCK_KEY}) AS locked
      `;
      if (!locked) {
        return {
          ran: false,
          reason: "another janitor run holds the lock",
          subscriptions: 0,
          missingUsers: 0,
          deleted: 0,
          refused: false,
        };
      }

      const subscriptions = await tx.notisSubscription.findMany({
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
          `REFUSED: ${orphaned.length}/${subscriptions.length} subscriptions have no notis_users row — deleting nothing`,
        );
        return {
          ran: true,
          subscriptions: subscriptions.length,
          missingUsers: orphaned.length,
          deleted: 0,
          refused: true,
        };
      }

      if (orphaned.length > 0) {
        await tx.notisSubscription.deleteMany({
          where: { id: { in: orphaned.map((s) => s.id) } },
        });
        console.log(
          `[notis:janitor] purged ${orphaned.length} subscription(s) whose user left notis_users`,
        );
      }

      return {
        ran: true,
        subscriptions: subscriptions.length,
        missingUsers: orphaned.length,
        deleted: orphaned.length,
        refused: false,
      };
    });
  } catch (error) {
    await alert(`run failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
