import { hasNotisDb, notisDb } from "@/lib/db";

/**
 * Overview metrics over a selectable window, always computed twice — the
 * current period and the one before it — so every number can carry its
 * change. Without NOTIS_DATABASE_URL (playground-only mode) every number is
 * an honest zero and liveData() is false so pages can label themselves.
 */

export function liveData(): boolean {
  return hasNotisDb();
}

export const RANGES = {
  "7d": { days: 7, label: "7 ημέρες", short: "7ημ" },
  "14d": { days: 14, label: "14 ημέρες", short: "14ημ" },
  "30d": { days: 30, label: "30 ημέρες", short: "30ημ" },
  "90d": { days: 90, label: "3 μήνες", short: "3μ" },
} as const;

export type RangeKey = keyof typeof RANGES;

export function parseRange(value: string | undefined): RangeKey {
  return value && value in RANGES ? (value as RangeKey) : "7d";
}

/** Relative change in percent; null when the previous period is empty. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export interface WakeEventStats {
  eventType: string;
  count: number;
  costUsd: number;
}

export interface PeriodStats {
  /** Distinct subscriptions with a message or a wake in the period. */
  activeUsers: number;
  newSubscriptions: number;
  messagesSent: number;
  messagesReceived: number;
  unsubscribes: number;
  outboundByStatus: Record<string, number>;
  /** failed / all outbound carrying a status; null when nothing was sent. */
  failRate: number | null;
  failureReasons: Array<{ reason: string; count: number }>;
  wakesTotal: number;
  wakesByDecision: { send: number; silence: number; error: number };
  wakesByEvent: WakeEventStats[];
  costUsd: number;
}

export interface RecentInbound {
  id: string;
  subscriptionId: string;
  userName: string;
  body: string;
  at: string;
}

/** One Athens-local day inside the current window. */
export interface DailyPoint {
  day: string; // YYYY-MM-DD
  activeUsers: number;
  sent: number;
  received: number;
  unsubscribes: number;
}

export interface OverviewStats {
  range: RangeKey;
  current: PeriodStats;
  previous: PeriodStats;
  dailySeries: DailyPoint[];
  recentInbound: RecentInbound[];
  totals: { subscriptions: number; unsubscribed: number };
}

const EMPTY_PERIOD: PeriodStats = {
  activeUsers: 0,
  newSubscriptions: 0,
  messagesSent: 0,
  messagesReceived: 0,
  unsubscribes: 0,
  outboundByStatus: {},
  failRate: null,
  failureReasons: [],
  wakesTotal: 0,
  wakesByDecision: { send: 0, silence: 0, error: 0 },
  wakesByEvent: [],
  costUsd: 0,
};

type Db = ReturnType<typeof notisDb>;

/** The Athens-local calendar date of an instant, as YYYY-MM-DD. */
export function athensDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Every Athens-local day from `from` to `to`, inclusive, in order. */
export function listDays(from: Date, to: Date): string[] {
  const days: string[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    const key = athensDay(new Date(t));
    if (days[days.length - 1] !== key) days.push(key);
  }
  const last = athensDay(to);
  if (days[days.length - 1] !== last) days.push(last);
  return days;
}

interface DayCount {
  day: string;
  count: number;
}

/** Zero-fill sparse per-day counts over the window — charts need every day. */
export function fillDailySeries(
  from: Date,
  to: Date,
  rows: {
    sent: DayCount[];
    received: DayCount[];
    activeUsers: DayCount[];
    unsubscribes: DayCount[];
  },
): DailyPoint[] {
  const lookup = (list: DayCount[], day: string) =>
    list.find((r) => r.day === day)?.count ?? 0;
  return listDays(from, to).map((day) => ({
    day,
    sent: lookup(rows.sent, day),
    received: lookup(rows.received, day),
    activeUsers: lookup(rows.activeUsers, day),
    unsubscribes: lookup(rows.unsubscribes, day),
  }));
}

// date_trunc over the Athens-local timestamp yields a naive local midnight;
// the driver parses it as UTC, so toISOString().slice(0,10) IS the local day.
const rawDay = (row: { day: Date; count: number }): DayCount => ({
  day: row.day.toISOString().slice(0, 10),
  count: row.count,
});

async function dailySeries(db: Db, from: Date, to: Date): Promise<DailyPoint[]> {
  const [messages, actives, unsubscribes] = await Promise.all([
    db.$queryRaw<Array<{ day: Date; direction: string; count: number }>>`
      SELECT date_trunc('day', "createdAt" AT TIME ZONE 'Europe/Athens') AS day,
             direction::text AS direction, COUNT(*)::int AS count
      FROM "NotisMessage"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      GROUP BY 1, 2
    `,
    db.$queryRaw<Array<{ day: Date; count: number }>>`
      SELECT day, COUNT(DISTINCT sid)::int AS count FROM (
        SELECT date_trunc('day', "createdAt" AT TIME ZONE 'Europe/Athens') AS day,
               "subscriptionId" AS sid
        FROM "NotisMessage" WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
        UNION ALL
        SELECT date_trunc('day', "createdAt" AT TIME ZONE 'Europe/Athens'),
               "subscriptionId"
        FROM "NotisWake" WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      ) t GROUP BY 1
    `,
    db.$queryRaw<Array<{ day: Date; count: number }>>`
      SELECT date_trunc('day', "unsubscribedAt" AT TIME ZONE 'Europe/Athens') AS day,
             COUNT(*)::int AS count
      FROM "NotisSubscription"
      WHERE "unsubscribedAt" >= ${from} AND "unsubscribedAt" < ${to}
      GROUP BY 1
    `,
  ]);

  return fillDailySeries(from, to, {
    sent: messages.filter((r) => r.direction === "outbound").map(rawDay),
    received: messages.filter((r) => r.direction === "inbound").map(rawDay),
    activeUsers: actives.map(rawDay),
    unsubscribes: unsubscribes.map(rawDay),
  });
}

async function periodStats(db: Db, from: Date, to: Date): Promise<PeriodStats> {
  const createdInPeriod = { createdAt: { gte: from, lt: to } };
  const [
    messagesByDirection,
    outboundStatus,
    failures,
    activeByMessage,
    activeByWake,
    newSubscriptions,
    unsubscribes,
    wakesByDecision,
    wakesByEvent,
  ] = await Promise.all([
    db.notisMessage.groupBy({ by: ["direction"], where: createdInPeriod, _count: { _all: true } }),
    db.notisMessage.groupBy({
      by: ["status"],
      where: { ...createdInPeriod, direction: "outbound", status: { not: null } },
      _count: { _all: true },
    }),
    db.notisMessage.groupBy({
      by: ["failureReason"],
      where: { ...createdInPeriod, direction: "outbound", status: "failed" },
      _count: { _all: true },
      orderBy: { _count: { failureReason: "desc" } },
      take: 5,
    }),
    db.notisMessage.groupBy({ by: ["subscriptionId"], where: createdInPeriod }),
    db.notisWake.groupBy({ by: ["subscriptionId"], where: createdInPeriod }),
    db.notisSubscription.count({ where: createdInPeriod }),
    db.notisSubscription.count({ where: { unsubscribedAt: { gte: from, lt: to } } }),
    db.notisWake.groupBy({ by: ["decision"], where: createdInPeriod, _count: { _all: true } }),
    db.notisWake.groupBy({
      by: ["eventType"],
      where: createdInPeriod,
      _count: { _all: true },
      _sum: { costUsd: true },
    }),
  ]);

  const directionCount = (d: string) =>
    messagesByDirection.find((r) => r.direction === d)?._count._all ?? 0;
  const outboundByStatus = Object.fromEntries(
    outboundStatus.map((r) => [r.status as string, r._count._all]),
  );
  const outboundTotal = Object.values(outboundByStatus).reduce((a, b) => a + b, 0);
  const failed = outboundByStatus.failed ?? 0;

  const decisionCount = (d: string) =>
    wakesByDecision.find((r) => r.decision === d)?._count._all ?? 0;
  const byEvent = wakesByEvent
    .map((r) => ({
      eventType: r.eventType,
      count: r._count._all,
      costUsd: r._sum.costUsd ?? 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    activeUsers: new Set([
      ...activeByMessage.map((r) => r.subscriptionId),
      ...activeByWake.map((r) => r.subscriptionId),
    ]).size,
    newSubscriptions,
    messagesSent: directionCount("outbound"),
    messagesReceived: directionCount("inbound"),
    unsubscribes,
    outboundByStatus,
    failRate: outboundTotal > 0 ? failed / outboundTotal : null,
    failureReasons: failures.map((r) => ({
      reason: r.failureReason ?? "άγνωστος λόγος",
      count: r._count._all,
    })),
    wakesTotal: wakesByDecision.reduce((a, r) => a + r._count._all, 0),
    wakesByDecision: {
      send: decisionCount("send"),
      silence: decisionCount("silence"),
      error: decisionCount("error"),
    },
    wakesByEvent: byEvent,
    costUsd: byEvent.reduce((a, r) => a + r.costUsd, 0),
  };
}

export async function getOverviewStats(range: RangeKey): Promise<OverviewStats> {
  const now = new Date();
  const days = RANGES[range].days;
  const periodMs = days * 24 * 60 * 60 * 1000;
  const currentFrom = new Date(now.getTime() - periodMs);
  const previousFrom = new Date(now.getTime() - 2 * periodMs);

  if (!hasNotisDb()) {
    return {
      range,
      current: EMPTY_PERIOD,
      previous: EMPTY_PERIOD,
      dailySeries: fillDailySeries(currentFrom, now, {
        sent: [],
        received: [],
        activeUsers: [],
        unsubscribes: [],
      }),
      recentInbound: [],
      totals: { subscriptions: 0, unsubscribed: 0 },
    };
  }

  const db = notisDb();

  const [current, previous, series, recent, subscriptions, unsubscribed] = await Promise.all([
    periodStats(db, currentFrom, now),
    periodStats(db, previousFrom, currentFrom),
    dailySeries(db, currentFrom, now),
    db.notisMessage.findMany({
      where: { direction: "inbound" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        body: true,
        createdAt: true,
        subscription: { select: { id: true, userName: true } },
      },
    }),
    db.notisSubscription.count(),
    db.notisSubscription.count({ where: { status: "unsubscribed" } }),
  ]);

  return {
    range,
    current,
    previous,
    dailySeries: series,
    recentInbound: recent.map((m) => ({
      id: m.id,
      subscriptionId: m.subscription.id,
      userName: m.subscription.userName ?? "—",
      body: m.body,
      at: m.createdAt.toISOString(),
    })),
    totals: { subscriptions, unsubscribed },
  };
}
