import "server-only";
import { EditorialBrief } from "@/agent/types";
import { ActivePhase, activePhase, clampToActiveHours } from "@/lib/active-hours";
import { hasNotisDb, notisDb } from "@/lib/db";
import { POLLER_STATUS_KEY, getProactiveSettings } from "@/lib/settings";
import { subscriptionsAtTemplateCap } from "@/lib/queue";

/**
 * The system page's snapshot: queue state with per-item deadlines, the
 * agent's upcoming scheduled wakes, the digested-meetings ledger, and the
 * poller heartbeat. Built for the thousand-user shape: aggregates first,
 * worst-first lists, hard take-limits with honest "+N" counts.
 */

export const POLLER_INTERVAL_MS = 5 * 60_000;
const QUEUE_LIST_LIMIT = 30;
const SCHEDULE_LIST_LIMIT = 30;
export const DIGESTED_PAGE_SIZE = 20;

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
  /** Wakes whose primary event named this meeting. */
  wakes: number;
  /** What those wakes produced: messages written, and wakes that ended in
   *  silence or in an error. Message counts come from the recorded outcome,
   *  the same source the wake feed counts. */
  messages: number;
  silences: number;
  errors: number;
  /** Per subject of the brief, how far it travelled: the messages that
   *  carried its link, and how many wakes wrote one. Keyed by subjectId. */
  subjectFanout: Record<string, SubjectFanout>;
  brief: EditorialBrief | null;
}

export interface SubjectFanout {
  messages: number;
  wakes: number;
}

interface MeetingFanout {
  wakes: number;
  messages: number;
  silences: number;
  errors: number;
}

/** One row of the fan-out query. `kind` says what `key` names: a wake
 *  decision for a meeting total, or a subjectId for a subject total. */
interface FanoutRow {
  kind: "meeting" | "subject";
  meetingId: string;
  key: string;
  wakes: number;
  messages: number;
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
    failures: {
      count: number;
      latestAt: string | null;
      /** Failed rows older than the 7-day window but not yet janitored
       *  (up to 30 days) — otherwise invisible anywhere. */
      older: number;
    };
  };
  scheduled: { items: ScheduledView[]; more: number; total: number };
  digested: { items: DigestedMeetingView[]; total: number; page: number; pages: number };
  atCap: Array<{ subscriptionId: string; userId: string; userName: string; count: number }>;
}

const EMPTY: SystemSnapshot = {
  now: new Date(0).toISOString(),
  phase: { kind: "active", since: new Date(0).toISOString(), until: new Date(0).toISOString() },
  settings: { paused: true },
  poller: { lastTickAt: null, nextTickAt: null },
  queue: { counts: {}, laneCounts: {}, heldUntilRelease: 0, items: [], more: 0, failures: { count: 0, latestAt: null, older: 0 } },
  scheduled: { items: [], more: 0, total: 0 },
  digested: { items: [], total: 0, page: 1, pages: 1 },
  atCap: [],
};

/** Readers whose rolling-week budget of cold pushes is spent — measured by
 *  the same code the send boundary enforces, so the two cannot drift. */
async function usersAtCap(db: ReturnType<typeof notisDb>) {
  const capped = await subscriptionsAtTemplateCap(db);
  if (capped.length === 0) return [];
  const subs = await db.notisSubscription.findMany({
    where: { id: { in: capped.map((c) => c.subscriptionId) } },
    select: { id: true, userId: true, userName: true },
  });
  const byId = new Map(subs.map((s) => [s.id, s]));
  return capped.map((c) => ({
    subscriptionId: c.subscriptionId,
    userId: byId.get(c.subscriptionId)?.userId ?? c.subscriptionId,
    userName: byId.get(c.subscriptionId)?.userName ?? "—",
    count: c.count,
  }));
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
  const [settings, capped, queueCounts] = await Promise.all([
    getProactiveSettings(db),
    usersAtCap(db),
    // One scan for all four queue cells. held excludes retry-backoff rows
    // (attempts > 0 belongs to «ξαναδοκιμάζει», not «σε αναμονή»), and
    // running counts a retry only from the second claim — the first run
    // holds claim #1.
    db.$queryRaw<
      Array<{ held: number; failed7d: number; retry_pending: number; retry_running: number }>
    >`
      SELECT
        count(*) FILTER (
          WHERE status = 'pending' AND "runAfter" > ${now} AND attempts = 0
        )::int AS held,
        count(*) FILTER (
          WHERE status = 'failed' AND "updatedAt" >= ${weekAgo}
        )::int AS failed7d,
        count(*) FILTER (WHERE status = 'pending' AND attempts > 0)::int AS retry_pending,
        count(*) FILTER (WHERE status = 'running' AND attempts > 1)::int AS retry_running
      FROM "NotisWakeQueue"
    `,
  ]);
  const q = queueCounts[0] ?? { held: 0, failed7d: 0, retry_pending: 0, retry_running: 0 };
  return {
    phase: {
      kind: phase.phase,
      since: phase.since.toISOString(),
      until: phase.until.toISOString(),
    },
    settings,
    heldUntilRelease: q.held,
    atCapCount: capped.length,
    queueTrouble: { failed: q.failed7d, retrying: q.retry_pending + q.retry_running },
  };
}

export async function getSystemSnapshot(digestedPage = 1): Promise<SystemSnapshot> {
  if (!hasNotisDb()) return EMPTY;
  const db = notisDb();
  const now = new Date();
  const phase = activePhase(now);

  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
  const [settings, pollerRow, statusCounts, laneStatusCounts, heldUntilRelease, failuresAgg] =
    await Promise.all([
      getProactiveSettings(db),
      db.notisSetting.findUnique({ where: { key: POLLER_STATUS_KEY } }),
      db.notisWakeQueue.groupBy({ by: ["status"], _count: { _all: true } }),
      db.notisWakeQueue.groupBy({
        by: ["lane"],
        where: { status: { in: ["pending", "running"] } },
        _count: { _all: true },
      }),
      db.notisWakeQueue.count({
        where: { status: "pending", runAfter: { gt: now }, attempts: 0 },
      }),
      db.notisWakeQueue.aggregate({
        where: { status: "failed", updatedAt: { gte: weekAgo } },
        _count: { _all: true },
        _max: { updatedAt: true },
      }),
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

  // Count first: the page is clamped into range, so a stale ?digested=99
  // link lands on the last page instead of an empty list.
  const digestedTotal = await db.notisProcessedEvent.count();
  const digestedPages = Math.max(1, Math.ceil(digestedTotal / DIGESTED_PAGE_SIZE));
  const digestedCurrent = Math.min(Math.max(1, digestedPage), digestedPages);
  const digestedRows = await db.notisProcessedEvent.findMany({
    orderBy: { processedAt: "desc" },
    skip: (digestedCurrent - 1) * DIGESTED_PAGE_SIZE,
    take: DIGESTED_PAGE_SIZE,
  });

  // Fan-out per digested meeting, and per subject inside it.
  const meetingIds = [...new Set(digestedRows.map((r) => r.meetingId))];
  const briefs = digestedRows.map((r) => (r.brief as unknown as EditorialBrief | null) ?? null);
  // (meeting, subject) pairs to attribute messages to. Deduped: the agenda
  // row and the summary row of one meeting carry the same subject ids.
  const subjectPairs = [
    ...new Set(
      digestedRows.flatMap((row, i) =>
        (briefs[i]?.subjects ?? []).map((s) => `${row.meetingId}\u0000${s.subjectId}`),
      ),
    ),
  ].map((pair) => pair.split("\u0000"));
  const pairMeetingIds = subjectPairs.map((pair) => pair[0]);
  const pairSubjectIds = subjectPairs.map((pair) => pair[1]);
  const fanoutRows =
    meetingIds.length === 0
      ? []
      : await db.$queryRaw<FanoutRow[]>`
          WITH scoped AS (
            SELECT
              w.id,
              w.event->>'meetingId' AS "meetingId",
              w.decision::text      AS decision,
              CASE WHEN jsonb_typeof(w.outcome->'messages') = 'array'
                   THEN w.outcome->'messages'
                   ELSE '[]'::jsonb END AS messages
            FROM "NotisWake" w
            WHERE w.event->>'meetingId' = ANY(${meetingIds}::text[])
          )
          SELECT 'meeting' AS kind,
                 s."meetingId",
                 s.decision AS key,
                 count(*)::int AS wakes,
                 coalesce(sum(jsonb_array_length(s.messages)), 0)::int AS messages
          FROM scoped s
          GROUP BY s."meetingId", s.decision
          UNION ALL
          SELECT 'subject' AS kind,
                 t."meetingId",
                 t."subjectId" AS key,
                 count(DISTINCT s.id)::int AS wakes,
                 count(*)::int AS messages
          FROM scoped s
          CROSS JOIN LATERAL jsonb_array_elements_text(s.messages) AS m(body)
          JOIN unnest(${pairMeetingIds}::text[], ${pairSubjectIds}::text[])
            AS t("meetingId", "subjectId") ON t."meetingId" = s."meetingId"
          WHERE strpos(m.body, '/subjects/' || t."subjectId") > 0
          GROUP BY t."meetingId", t."subjectId"
        `;

  const fanoutByMeeting = new Map<string, MeetingFanout>();
  const fanoutBySubject = new Map<string, SubjectFanout>();
  for (const row of fanoutRows) {
    if (row.kind === "subject") {
      fanoutBySubject.set(`${row.meetingId}\u0000${row.key}`, {
        messages: row.messages,
        wakes: row.wakes,
      });
      continue;
    }
    const agg = fanoutByMeeting.get(row.meetingId) ?? {
      wakes: 0,
      messages: 0,
      silences: 0,
      errors: 0,
    };
    agg.wakes += row.wakes;
    agg.messages += row.messages;
    if (row.key === "silence") agg.silences += row.wakes;
    if (row.key === "error") agg.errors += row.wakes;
    fanoutByMeeting.set(row.meetingId, agg);
  }

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
      // From the full counts, not the LIMIT+1 fetch — that could only ever
      // say «+1 ακόμη» no matter how deep the queue.
      more: Math.max(
        0,
        (statusMap.pending ?? 0) + (statusMap.running ?? 0) - queueItems.length,
      ),
      failures: {
        count: failuresAgg._count._all,
        latestAt: failuresAgg._max.updatedAt?.toISOString() ?? null,
        older: Math.max(0, (statusMap.failed ?? 0) - failuresAgg._count._all),
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
      page: digestedCurrent,
      pages: digestedPages,
      items: digestedRows.map((row, i) => {
        const brief = briefs[i];
        const fanout = fanoutByMeeting.get(row.meetingId);
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
          wakes: fanout?.wakes ?? 0,
          messages: fanout?.messages ?? 0,
          silences: fanout?.silences ?? 0,
          errors: fanout?.errors ?? 0,
          subjectFanout: Object.fromEntries(
            (brief?.subjects ?? []).map((s) => [
              s.subjectId,
              fanoutBySubject.get(`${row.meetingId}\u0000${s.subjectId}`) ?? {
                messages: 0,
                wakes: 0,
              },
            ]),
          ),
          brief,
        };
      }),
      total: digestedTotal,
    },
    atCap: await usersAtCap(db),
  };
}
