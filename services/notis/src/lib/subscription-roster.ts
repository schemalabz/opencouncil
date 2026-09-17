/**
 * The roster behind the main app's signups page: one entry per subscription,
 * with the municipalities it fans out to. Notis alone knows who is active — a
 * ΣΤΟΠ never reaches the main database — so the main app cannot build this
 * half itself. The arithmetic happens there instead (src/lib/admin/
 * signup-series.ts), over this roster and the email half together, so one
 * calendar serves both.
 *
 * Pure, so the shape is testable without a database; the route feeds it the
 * two tables.
 *
 * One known blur: a reactivated subscription keeps its `createdAt` and loses
 * its `unsubscribedAt`, so it reads as active throughout and the stop it once
 * had is not in the history. Reactivation is rare (the profile switch).
 */

export interface SubscriptionRow {
  userId: string;
  status: string;
  createdAt: Date;
  unsubscribedAt: Date | null;
}

/** One (reader, municipality) pair from notis_fanout_targets. */
export interface TargetRow {
  userId: string;
  cityId: string;
}

export interface RosterEntry {
  userId: string;
  cityIds: string[];
  createdAt: string;
  /** When the subscription stopped. Null while it is on. */
  endedAt: string | null;
}

export function subscriptionRoster(subs: SubscriptionRow[], targets: TargetRow[]): RosterEntry[] {
  const citiesByUser = new Map<string, Set<string>>();
  for (const target of targets) {
    const cities = citiesByUser.get(target.userId);
    if (cities) cities.add(target.cityId);
    else citiesByUser.set(target.userId, new Set([target.cityId]));
  }

  return subs.map((sub) => ({
    userId: sub.userId,
    cityIds: [...(citiesByUser.get(sub.userId) ?? [])],
    createdAt: sub.createdAt.toISOString(),
    // A stopped subscription without a date reads as stopped from its start.
    // That keeps it out of every week, rather than in all of them.
    endedAt: sub.status === "active" ? null : (sub.unsubscribedAt ?? sub.createdAt).toISOString(),
  }));
}
