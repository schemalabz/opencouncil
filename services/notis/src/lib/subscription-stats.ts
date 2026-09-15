/**
 * The numbers behind the main app's signups page, computed here because only
 * Notis knows them: who is active (a ΣΤΟΠ never reaches the main database),
 * when each subscription started, and when it stopped. Pure, so the shape is
 * testable without a database; the route feeds it the two tables.
 *
 * Weeks start on Monday, in UTC. The last week is the current one, so its
 * `active` is the count as of now.
 *
 * One known blur: a reactivated subscription keeps its `createdAt` and loses
 * its `unsubscribedAt`, so the weekly series reads it as active throughout
 * and the stop it once had is not in the history. Reactivation is rare (the
 * profile switch), and the last-7-days figures read the rows as they are
 * now, so they are exact.
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

export interface WeekStats {
  /** Monday of the week, YYYY-MM-DD. */
  start: string;
  /** Subscriptions that started this week. */
  fresh: number;
  /** Subscriptions that stopped this week. */
  stopped: number;
  /** Active subscriptions at the end of the week (as of now for the current week). */
  active: number;
}

export interface SubscriptionStats {
  active: number;
  cities: Array<{ cityId: string; active: number }>;
  weeks: WeekStats[];
  newLast7Days: number;
  newPrev7Days: number;
  stoppedLast7Days: number;
}

export const WEEKS = 12;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** Monday 00:00 UTC of the week that holds `at`. */
export function weekStart(at: Date): Date {
  const day = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const offset = (day.getUTCDay() + 6) % 7; // Monday → 0 … Sunday → 6
  return new Date(day.getTime() - offset * DAY_MS);
}

const isActive = (sub: SubscriptionRow) => sub.status === "active";

export function computeSubscriptionStats(
  subs: SubscriptionRow[],
  targets: TargetRow[],
  now: Date = new Date(),
): SubscriptionStats {
  const activeUsers = new Set(subs.filter(isActive).map((s) => s.userId));

  const byCity = new Map<string, number>();
  for (const target of targets) {
    if (!activeUsers.has(target.userId)) continue;
    byCity.set(target.cityId, (byCity.get(target.cityId) ?? 0) + 1);
  }

  const thisWeek = weekStart(now).getTime();
  const weeks: WeekStats[] = [];
  for (let i = WEEKS - 1; i >= 0; i--) {
    const start = thisWeek - i * WEEK_MS;
    const end = start + WEEK_MS;
    const inWeek = (at: Date | null) => at !== null && at.getTime() >= start && at.getTime() < end;
    weeks.push({
      start: new Date(start).toISOString().slice(0, 10),
      fresh: subs.filter((s) => inWeek(s.createdAt)).length,
      stopped: subs.filter((s) => !isActive(s) && inWeek(s.unsubscribedAt)).length,
      active: subs.filter(
        (s) => s.createdAt.getTime() < end && (isActive(s) || (s.unsubscribedAt?.getTime() ?? 0) >= end),
      ).length,
    });
  }

  const since = (days: number) => now.getTime() - days * DAY_MS;
  const within = (at: Date | null, from: number, to: number) =>
    at !== null && at.getTime() >= from && at.getTime() < to;

  return {
    active: activeUsers.size,
    cities: [...byCity].map(([cityId, active]) => ({ cityId, active })),
    weeks,
    newLast7Days: subs.filter((s) => within(s.createdAt, since(7), now.getTime())).length,
    newPrev7Days: subs.filter((s) => within(s.createdAt, since(14), since(7))).length,
    stoppedLast7Days: subs.filter((s) => !isActive(s) && within(s.unsubscribedAt, since(7), now.getTime())).length,
  };
}
