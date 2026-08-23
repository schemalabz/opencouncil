import "server-only";
import { EditorialBrief } from "@/agent/types";
import { ActivePhase, activePhase, clampToActiveHours } from "@/lib/active-hours";
import { hasNotisDb, notisDb } from "@/lib/db";
import { POLLER_STATUS_KEY, getProactiveSettings } from "@/lib/settings";
import { WEEKLY_CAP } from "@/lib/queue";

/**
 * The system page's snapshot: queue state with per-item deadlines, the
 * agent's upcoming scheduled wakes, the digested-meetings ledger, and the
 * poller heartbeat. Built for the thousand-user shape: aggregates first,
 * worst-first lists, hard take-limits with honest "+N" counts.
 */

export const POLLER_INTERVAL_MS = 5 * 60_000;
const QUEUE_LIST_LIMIT = 30;
const SCHEDULE_LIST_LIMIT = 30;
const BRIEF_LIST_LIMIT = 20;

export interface QueueItemView {
  id: string;
  lane: "live" | "batch";
  status: string;
  subscriptionId: string;
  userId: string;
  userName: string;
  eventTypes: string[];
  runAfter: string;
  createdAt: string;
  claimedAt: string | null;
  attempts: number;
  lastError: string | null;
}

export interface ScheduledView {
  id: string;
  subscriptionId: string;
  userId: string;
  userName: string;
  runAfter: string;
  createdAt: string;
  reason: string;
  origin: "reply" | "proactive";
  /** Where the fire actually lands after the quiet-hours clamp; equals
   *  runAfter when it falls inside active hours. */
  firesAt: string;
}

export interface DigestedMeetingView {
  /** The row's own identity. taskId names the run that produced it, and a
   *  re-run would carry a different one — so it is not a key. */
  id: string;
  taskId: string;
  type: string;
  cityId: string;
  meetingId: string;
  meetingName: string | null;
  meetingDate: string | null;
  adminBodyName: string | null;
  processedAt: string;
  briefCostUsd: number | null;
  headline: string | null;
  subjectCount: number | null;
  wakes: number;
  brief: EditorialBrief | null;
}

export interface SystemSnapshot {
  now: string;
  phase: { kind: ActivePhase["phase"]; since: string; until: string };
  settings: { paused: boolean };
  poller: { lastTickAt: string | null; nextTickAt: string | null };
  queue: {
    counts: Record<string, number>;
    laneCounts: Record<string, number>;
    heldUntilRelease: number;
    items: QueueItemView[];
    more: number;
    /** Terminal failures in the last 7 days. Failed rows are history, not
     *  queue state — the table shows live work and this line shows the
     *  toll, until the janitor removes the rows entirely (30 days). */
    failures: { count: number; latestAt: string | null };
  };
  scheduled: { items: ScheduledView[]; more: number; total: number };
  digested: { items: DigestedMeetingView[]; total: number };
  atCap: Array<{ subscriptionId: string; userId: string; userName: string; count: number }>;
}

const EMPTY: SystemSnapshot = {
  now: new Date(0).toISOString(),
  phase: { kind: "active", since: new Date(0).toISOString(), until: new Date(0).toISOString() },
  settings: { paused: true },
  poller: { lastTickAt: null, nextTickAt: null },
  queue: { counts: {}, laneCounts: {}, heldUntilRelease: 0, items: [], more: 0, failures: { count: 0, latestAt: null } },
  scheduled: { items: [], more: 0, total: 0 },
  digested: { items: [], total: 0 },
  atCap: [],
};

/** Users whose rolling-week unprompted budget is spent — the same countable
 *  rule the send boundary applies. */
async function usersAtCap(db: ReturnType<typeof notisDb>) {
  const counts = await db.notisMessage.groupBy({
    by: ["subscriptionId"],
    where: {
      proactive: true,
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60_000) },
      status: { in: ["pending", "sent", "delivered", "read"] },
    },
    _count: { _all: true },
  });
  const capped = counts.filter((c) => c._count._all >= WEEKLY_CAP);
  if (capped.length === 0) return [];
  const subs = await db.notisSubscription.findMany({
    where: { id: { in: capped.map((c) => c.subscriptionId) } },
    select: { id: true, userId: true, userName: true },
  });
  const byId = new Map(subs.map((s) => [s.id, s]));
  return capped
    .map((c) => ({
      subscriptionId: c.subscriptionId,
      userId: byId.get(c.subscriptionId)?.userId ?? c.subscriptionId,
      userName: byId.get(c.subscriptionId)?.userName ?? "—",
      count: c._count._all,
    }))
    .sort((a, b) => b.count - a.count);
}

export interface RailsNow {
  phase: { kind: ActivePhase["phase"]; since: string; until: string };
  settings: { paused: boolean };
  heldUntilRelease: number;
  atCapCount: number;
  /** Wakes in trouble: terminal failures in the last 7 days, and live items
   *  that have failed at least once and are waiting to retry. Zero on a
   *  healthy system, so the overview can shout when it is not. */
  queueTrouble: { failed: number; retrying: number };
}

/** The lightweight "now" slice the overview strip needs. */
export async function getRailsNow(): Promise<RailsNow | null> {
  if (!hasNotisDb()) return null;
  const db = notisDb();
  const now = new Date();
  const phase = activePhase(now);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
  const [settings, heldUntilRelease, capped, failed, retryPending, retryRunning] =
    await Promise.all([
      getProactiveSettings(db),
      db.notisWakeQueue.count({ where: { status: "pending", runAfter: { gt: now } } }),
      usersAtCap(db),
      db.notisWakeQueue.count({ where: { status: "failed", updatedAt: { gte: weekAgo } } }),
      db.notisWakeQueue.count({ where: { status: "pending", attempts: { gt: 0 } } }),
      // attempts counts claims, and a first run holds claim #1 — only a
      // second-or-later claim means an earlier attempt failed.
      db.notisWakeQueue.count({ where: { status: "running", attempts: { gt: 1 } } }),
    ]);
  return {
    phase: {
      kind: phase.phase,
      since: phase.since.toISOString(),
      until: phase.until.toISOString(),
    },
    settings,
    heldUntilRelease,
    atCapCount: capped.length,
    queueTrouble: { failed, retrying: retryPending + retryRunning },
  };
}

export async function getSystemSnapshot(): Promise<SystemSnapshot> {
  if (!hasNotisDb()) return EMPTY;
  const db = notisDb();
  const now = new Date();
  const phase = activePhase(now);

  const [settings, pollerRow, statusCounts, laneStatusCounts, heldUntilRelease] =
    await Promise.all([
      getProactiveSettings(db),
      db.notisSetting.findUnique({ where: { key: POLLER_STATUS_KEY } }),
      db.notisWakeQueue.groupBy({ by: ["status"], _count: { _all: true } }),
      db.notisWakeQueue.groupBy({
        by: ["lane"],
        where: { status: { in: ["pending", "running"] } },
        _count: { _all: true },
      }),
      db.notisWakeQueue.count({ where: { status: "pending", runAfter: { gt: now } } }),
    ]);

  // Live work only, worst first: running (possibly stuck), then pending by
  // due time. Done and failed rows are history, not state — failures roll
  // up into the `failures` line instead of squatting in the table.
  const activeItems = await db.notisWakeQueue.findMany({
    where: { status: { in: ["running", "pending"] } },
    orderBy: [{ status: "desc" }, { runAfter: "asc" }],
    take: QUEUE_LIST_LIMIT + 1,
    select: {
      id: true,
      lane: true,
      status: true,
      subscriptionId: true,
      events: true,
      runAfter: true,
      createdAt: true,
      claimedAt: true,
      attempts: true,
      lastError: true,
      subscription: { select: { userId: true, userName: true } },
    },
  });

  const [scheduledTotal, scheduledRows] = await Promise.all([
    db.notisScheduledWake.count({ where: { firedAt: null } }),
    db.notisScheduledWake.findMany({
      where: { firedAt: null },
      orderBy: { runAfter: "asc" },
      take: SCHEDULE_LIST_LIMIT + 1,
      select: {
        id: true,
        subscriptionId: true,
        runAfter: true,
        createdAt: true,
        reason: true,
        origin: true,
        subscription: { select: { userId: true, userName: true } },
      },
    }),
  ]);

  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
  const failuresAgg = await db.notisWakeQueue.aggregate({
    where: { status: "failed", updatedAt: { gte: weekAgo } },
    _count: { _all: true },
    _max: { updatedAt: true },
  });

  const [digestedTotal, digestedRows] = await Promise.all([
    db.notisProcessedEvent.count(),
    db.notisProcessedEvent.findMany({
      orderBy: { processedAt: "desc" },
      take: BRIEF_LIST_LIMIT,
    }),
  ]);

  // Fan-out width per digested meeting: wakes whose primary event named it.
  const meetingIds = [...new Set(digestedRows.map((r) => r.meetingId))];
  const wakeCounts =
    meetingIds.length === 0
      ? []
      : await db.$queryRaw<Array<{ meetingId: string; count: bigint }>>`
          SELECT event->>'meetingId' AS "meetingId", count(*) AS count
          FROM "NotisWake"
          WHERE event->>'meetingId' = ANY(${meetingIds}::text[])
          GROUP BY 1
        `;
  const wakesByMeeting = new Map(wakeCounts.map((r) => [r.meetingId, Number(r.count)]));

  const statusMap = Object.fromEntries(statusCounts.map((r) => [r.status, r._count._all]));
  const queueItems = activeItems.slice(0, QUEUE_LIST_LIMIT).map((item) => ({
    id: item.id,
    lane: item.lane as "live" | "batch",
    status: item.status,
    subscriptionId: item.subscriptionId,
    userId: item.subscription.userId,
    userName: item.subscription.userName ?? "—",
    eventTypes: Array.isArray(item.events)
      ? (item.events as Array<{ type?: string }>).map((e) => e?.type ?? "?")
      : [],
    runAfter: item.runAfter.toISOString(),
    createdAt: item.createdAt.toISOString(),
    claimedAt: item.claimedAt?.toISOString() ?? null,
    attempts: item.attempts,
    lastError: item.lastError,
  }));

  const lastTickAt = (pollerRow?.value as { at?: string } | null)?.at ?? null;

  return {
    now: now.toISOString(),
    phase: {
      kind: phase.phase,
      since: phase.since.toISOString(),
      until: phase.until.toISOString(),
    },
    settings,
    poller: {
      lastTickAt,
      nextTickAt: lastTickAt
        ? new Date(new Date(lastTickAt).getTime() + POLLER_INTERVAL_MS).toISOString()
        : null,
    },
    queue: {
      counts: statusMap,
      laneCounts: Object.fromEntries(laneStatusCounts.map((r) => [r.lane, r._count._all])),
      heldUntilRelease,
      items: queueItems,
      more: Math.max(0, activeItems.length - QUEUE_LIST_LIMIT),
      failures: {
        count: failuresAgg._count._all,
        latestAt: failuresAgg._max.updatedAt?.toISOString() ?? null,
      },
    },
    scheduled: {
      items: scheduledRows.slice(0, SCHEDULE_LIST_LIMIT).map((row) => ({
        id: row.id,
        subscriptionId: row.subscriptionId,
        userId: row.subscription.userId,
        userName: row.subscription.userName ?? "—",
        runAfter: row.runAfter.toISOString(),
        createdAt: row.createdAt.toISOString(),
        reason: row.reason,
        origin: row.origin,
        firesAt: clampToActiveHours(
          row.runAfter > now ? row.runAfter : now,
          () => 0,
        ).toISOString(),
      })),
      more: Math.max(0, scheduledRows.length - SCHEDULE_LIST_LIMIT),
      total: scheduledTotal,
    },
    digested: {
      items: digestedRows.map((row) => {
        const brief = (row.brief as unknown as EditorialBrief | null) ?? null;
        return {
          id: row.id,
          taskId: row.taskId,
          type: row.type,
          cityId: row.cityId,
          meetingId: row.meetingId,
          meetingName: row.meetingName,
          meetingDate: row.meetingDate?.toISOString() ?? null,
          adminBodyName: row.adminBodyName,
          processedAt: row.processedAt.toISOString(),
          briefCostUsd: row.briefCostUsd,
          headline: brief?.headline ?? null,
          subjectCount: brief?.subjects.length ?? null,
          wakes: wakesByMeeting.get(row.meetingId) ?? 0,
          brief,
        };
      }),
      total: digestedTotal,
    },
    atCap: await usersAtCap(db),
  };
}
