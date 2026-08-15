import { hasNotisDb, notisDb } from "./db";
import { hasMainDb, mainDb } from "./main-db";

/**
 * Reconciliation janitor: every subscription belongs to an OpenCouncil user
 * (inbound never enrolls unknown numbers), so a userId with no notis_users
 * row means the account was deleted — purge the subscription, cascading its
 * wakes, messages and journal. Behind a blast-radius guard: a broken view
 * looks exactly like a mass deletion, so past the threshold it alarms and
 * deletes nothing.
 */

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
    console.error(
      `[notis:janitor] REFUSED: ${orphaned.length}/${subscriptions.length} subscriptions have no notis_users row — deleting nothing`,
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
    await db.notisSubscription.deleteMany({
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
}
