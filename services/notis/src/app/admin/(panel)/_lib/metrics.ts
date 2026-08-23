// Not "server-only": pctChange and the metric types are imported by client
// components (DeltaChip, rendered inside the client MetricCard). The data
// readers here are guarded at their server-page call sites; see the
// (panel) auth-guard test.
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

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Chart resolution per range: sub-day windows need sub-day buckets. */
export type BucketUnit = "minute" | "hour" | "day";

/**
 * `label` is the whole phrase, not a noun to prefix: Greek gender and number
 * have to agree, and «τελευταίες» + «3 μήνες» (masculine) or «1 ώρα»
 * (singular) does not. `since` is the same phrase in the accusative, for
 * "compared with the previous …".
 */
export const RANGES = {
  "1h": {
    ms: HOUR_MS,
    label: "την τελευταία ώρα",
    since: "την προηγούμενη ώρα",
    short: "1ω",
    bucket: "minute" as BucketUnit,
  },
  "24h": {
    ms: DAY_MS,
    label: "τις τελευταίες 24 ώρες",
    since: "τις προηγούμενες 24 ώρες",
    short: "24ω",
    bucket: "hour" as BucketUnit,
  },
  "7d": {
    ms: 7 * DAY_MS,
    label: "τις τελευταίες 7 ημέρες",
    since: "τις προηγούμενες 7 ημέρες",
    short: "7ημ",
    bucket: "day" as BucketUnit,
  },
  "14d": {
    ms: 14 * DAY_MS,
    label: "τις τελευταίες 14 ημέρες",
    since: "τις προηγούμενες 14 ημέρες",
    short: "14ημ",
    bucket: "day" as BucketUnit,
  },
  "30d": {
    ms: 30 * DAY_MS,
    label: "τις τελευταίες 30 ημέρες",
    since: "τις προηγούμενες 30 ημέρες",
    short: "30ημ",
    bucket: "day" as BucketUnit,
  },
  "90d": {
    ms: 90 * DAY_MS,
    label: "τους τελευταίους 3 μήνες",
    since: "τους προηγούμενους 3 μήνες",
    short: "3μ",
    bucket: "day" as BucketUnit,
  },
} as const;

export type RangeKey = keyof typeof RANGES;

export function parseRange(value: string | undefined): RangeKey {
  // Object.hasOwn, not `in`: `in` walks the prototype chain, so
  // ?range=constructor would pass and crash the overview.
  return value && Object.hasOwn(RANGES, value) ? (value as RangeKey) : "7d";
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
  userId: string;
  userName: string;
  body: string;
  at: string;
}

/** One Athens-local bucket (minute / hour / day) inside the current window. */
export interface SeriesPoint {
  /** Athens-local key: YYYY-MM-DD for days, YYYY-MM-DDTHH:MM below that. */
  key: string;
  activeUsers: number;
  sent: number;
  received: number;
  unsubscribes: number;
}

export interface OverviewStats {
  range: RangeKey;
  current: PeriodStats;
  previous: PeriodStats;
  series: SeriesPoint[];
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

const BUCKET_STEP_MS: Record<BucketUnit, number> = {
  minute: 60 * 1000,
  hour: HOUR_MS,
  day: DAY_MS,
};

/** Key length: YYYY-MM-DD for days, YYYY-MM-DDTHH:MM below that. */
const keySlice = (bucket: BucketUnit) => (bucket === "day" ? 10 : 16);

/** The Athens-local bucket key of an instant, truncated TO the bucket —
 *  an hour key is always :00, matching what date_trunc emits. */
export function athensBucketKey(date: Date, bucket: BucketUnit): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const minute = bucket === "minute" ? get("minute") : "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${minute}`.slice(
    0,
    keySlice(bucket),
  );
}

/** Every Athens-local bucket from `from` to `to`, inclusive, in order.
 *  Day buckets step by 6h, not 24h: a fixed-24h stride across the
 *  spring-forward DST transition skips one local calendar day entirely
 *  (the dedupe below only collapses duplicates, it cannot invent the
 *  missing key), and a skipped key silently drops that day's counts. */
export function listBuckets(from: Date, to: Date, bucket: BucketUnit): string[] {
  const step = bucket === "day" ? 6 * HOUR_MS : BUCKET_STEP_MS[bucket];
  const keys: string[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += step) {
    const key = athensBucketKey(new Date(t), bucket);
    if (keys[keys.length - 1] !== key) keys.push(key);
  }
  const last = athensBucketKey(to, bucket);
  if (keys[keys.length - 1] !== last) keys.push(last);
  return keys;
}

interface BucketCount {
  key: string;
  count: number;
}

/** Zero-fill sparse per-bucket counts — charts need every bucket. */
export function fillSeries(
  from: Date,
  to: Date,
  bucket: BucketUnit,
  rows: {
    sent: BucketCount[];
    received: BucketCount[];
    activeUsers: BucketCount[];
    unsubscribes: BucketCount[];
  },
): SeriesPoint[] {
  const lookup = (list: BucketCount[], key: string) =>
    list.find((r) => r.key === key)?.count ?? 0;
  return listBuckets(from, to, bucket).map((key) => ({
    key,
    sent: lookup(rows.sent, key),
    received: lookup(rows.received, key),
    activeUsers: lookup(rows.activeUsers, key),
    unsubscribes: lookup(rows.unsubscribes, key),
  }));
}

async function bucketedSeries(
  db: Db,
  from: Date,
  to: Date,
  bucket: BucketUnit,
): Promise<SeriesPoint[]> {
  // date_trunc over the Athens-local timestamp yields a naive local time;
  // the driver parses it as UTC, so the ISO prefix IS the local key. The
  // bucket unit is a text parameter — Postgres accepts it as $n.
  const slice = keySlice(bucket);
  const rawKey = (row: { bucket: Date; count: number }): BucketCount => ({
    key: row.bucket.toISOString().slice(0, slice),
    count: row.count,
  });

  const [messages, actives, unsubscribes] = await Promise.all([
    db.$queryRaw<Array<{ bucket: Date; direction: string; count: number }>>`
      SELECT date_trunc(${bucket}, "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Athens') AS bucket,
             direction::text AS direction, COUNT(*)::int AS count
      FROM "NotisMessage"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      GROUP BY 1, 2
    `,
    db.$queryRaw<Array<{ bucket: Date; count: number }>>`
      SELECT bucket, COUNT(DISTINCT sid)::int AS count FROM (
        SELECT date_trunc(${bucket}, "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Athens') AS bucket,
               "subscriptionId" AS sid
        FROM "NotisMessage" WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
        UNION ALL
        SELECT date_trunc(${bucket}, "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Athens'),
               "subscriptionId"
        FROM "NotisWake" WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      ) t GROUP BY 1
    `,
    db.$queryRaw<Array<{ bucket: Date; count: number }>>`
      SELECT date_trunc(${bucket}, "unsubscribedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Athens') AS bucket,
             COUNT(*)::int AS count
      FROM "NotisSubscription"
      WHERE "unsubscribedAt" >= ${from} AND "unsubscribedAt" < ${to}
      GROUP BY 1
    `,
  ]);

  return fillSeries(from, to, bucket, {
    sent: messages.filter((r) => r.direction === "outbound").map(rawKey),
    received: messages.filter((r) => r.direction === "inbound").map(rawKey),
    activeUsers: actives.map(rawKey),
    unsubscribes: unsubscribes.map(rawKey),
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
  const { ms: periodMs, bucket } = RANGES[range];
  const currentFrom = new Date(now.getTime() - periodMs);
  const previousFrom = new Date(now.getTime() - 2 * periodMs);

  if (!hasNotisDb()) {
    return {
      range,
      current: EMPTY_PERIOD,
      previous: EMPTY_PERIOD,
      series: fillSeries(currentFrom, now, bucket, {
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
    bucketedSeries(db, currentFrom, now, bucket),
    db.notisMessage.findMany({
      // Ranged like everything else on the page: an unfiltered list sat under
      // a received-counter reading 0 for the same window.
      where: { direction: "inbound", createdAt: { gte: currentFrom, lte: now } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        body: true,
        createdAt: true,
        subscription: { select: { id: true, userId: true, userName: true } },
      },
    }),
    db.notisSubscription.count(),
    db.notisSubscription.count({ where: { status: "unsubscribed" } }),
  ]);

  return {
    range,
    current,
    previous,
    series,
    recentInbound: recent.map((m) => ({
      id: m.id,
      subscriptionId: m.subscription.id,
      userId: m.subscription.userId,
      userName: m.subscription.userName ?? "—",
      body: m.body,
      at: m.createdAt.toISOString(),
    })),
    totals: { subscriptions, unsubscribed },
  };
}
