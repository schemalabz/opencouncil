// Not "server-only": pctChange and the metric types are imported by client
// components (DeltaChip, rendered inside the client MetricCard). The data
// readers here are guarded at their server-page call sites; see the
// (panel) auth-guard test.
import { Prisma, hasNotisDb, notisDb } from "@/lib/db";
import { WAKE_EVENT_TYPES } from "@/agent/schemas";

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

/**
 * Wake event types that carry municipal news — the ones the reply rate asks
 * about. A coalesced wake records its PRIMARY event, so a wake that absorbed
 * a meeting event behind a user message is a user_message wake and does not
 * count here: the reader was already talking.
 */
const NEWS_WAKE_EVENTS = [
  "agenda_processed",
  "meeting_summarized",
] as const satisfies readonly (typeof WAKE_EVENT_TYPES)[number][];

/**
 * How long a send keeps its claim on the reader's next message. Past it the
 * message answers something else, whatever the reader had in mind. Nothing
 * produces `heartbeat` wakes today, so without this cap a reader who gets no
 * other wake leaves a window open for days.
 */
export const REPLY_WINDOW_HOURS = 24;

/**
 * The share of news sends the reader answered; null when nothing went out, so
 * the card can say so instead of showing a confident 0%.
 *
 * A wake that decided to stay silent is not in the denominator. It could never
 * draw a reply, so counting it would only drag the rate down.
 *
 * The last REPLY_WINDOW_HOURS of any window read low by construction: a send
 * from an hour ago still has most of its window left, and a reader who has not
 * answered yet counts as not answering.
 */
export function replyRate(sends: number, answered: number): number | null {
  return sends > 0 ? answered / sends : null;
}

/** Relative change in percent; null when the previous period is empty. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * Change of a RATE, in percentage points, from two fractions. A rate does not
 * move by a percentage of itself: 4,8% becoming 2,5% is 2,3 points, and
 * calling it «48% down» describes five replies as a collapse.
 */
export function pointsChange(current: number, previous: number): number {
  return (current - previous) * 100;
}

/**
 * Below this the movement is finer than the data can express. At ~200 news
 * sends one reply is worth half a point, so a tenth of a point is not a move,
 * it is the chip reacting to a single reader. The fail rate uses the same
 * number, so two rates on one screen agree about what counts as a change.
 */
export const RATE_MOVE_POINTS = 0.5;
/** A count moves by a percentage, and half a percent of a count is noise. */
const COUNT_MOVE_PERCENT = 0.5;

export type Delta =
  /** Neither period has a value: nothing to say. */
  | { kind: "none" }
  /** The previous period has no baseline — not a rise from zero. */
  | { kind: "new" }
  | { kind: "flat" }
  | { kind: "move"; up: boolean; magnitude: number; unit: "percent" | "points"; improving: boolean };

/**
 * What the delta chip says, decided away from the JSX so it can be tested.
 * The chip itself lives in a `.tsx`, and this jest project runs `.ts` only.
 *
 * `null` means "this period has no value", which is not zero: a rate with no
 * denominator never had a value, and calling it 0% turns an absent baseline
 * into a rise. Both callers pass the rate through unchanged for that reason.
 */
export function deltaFor({
  current,
  previous,
  unit = "count",
  invert = false,
}: {
  current: number | null;
  previous: number | null;
  /** `percent` takes fractions (0,025 = 2,5%) and answers in points. */
  unit?: "count" | "percent";
  invert?: boolean;
}): Delta {
  if (current === null && previous === null) return { kind: "none" };
  if (current === 0 && previous === 0) return { kind: "none" };
  if (previous === null || (unit === "count" && previous === 0)) return { kind: "new" };
  if (current === null) return { kind: "new" };
  const change = unit === "percent" ? pointsChange(current, previous) : pctChange(current, previous);
  if (change === null) return { kind: "new" };
  const threshold = unit === "percent" ? RATE_MOVE_POINTS : COUNT_MOVE_PERCENT;
  if (Math.abs(change) < threshold) return { kind: "flat" };
  return {
    kind: "move",
    up: change > 0,
    magnitude: Math.abs(change),
    unit: unit === "percent" ? "points" : "percent",
    improving: invert ? change < 0 : change > 0,
  };
}

/**
 * A cumulative rate is at its wildest where its denominator is smallest: the
 * first bucket that sends can be 1/1, and a line that opens at 100% sets the
 * chart's scale from a single reply. Below this many sends there is no rate
 * worth drawing yet.
 */
export const MIN_SENDS_FOR_RATE = 20;

/**
 * The reply rate SO FAR at each bucket, as running totals.
 *
 * News goes out on the days councils meet, so a per-bucket rate is a handful
 * of sends against a handful of replies: most buckets have no denominator and
 * the rest swing between 0% and 100% on one reply. Running totals answer what
 * the card is asked — where the rate is settling — and the last bucket equals
 * the period figure printed above the chart.
 *
 * The early buckets have no rate at all, not a zero: nobody failed to answer a
 * message that was never sent, and a handful of sends cannot carry a rate.
 */
export function cumulativeReplyRates(
  series: Array<Pick<SeriesPoint, "newsWakesSent" | "newsWakesAnswered">>,
): Array<{ sent: number; answered: number; rate: number | null }> {
  let sent = 0;
  let answered = 0;
  return series.map((point) => {
    sent += point.newsWakesSent;
    answered += point.newsWakesAnswered;
    return {
      sent,
      answered,
      rate: sent < MIN_SENDS_FOR_RATE ? null : replyRate(sent, answered),
    };
  });
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
  /** News wakes in the period that sent (see NEWS_WAKE_EVENTS), and how many
   *  of them the reader answered. A send counts as answered when an inbound
   *  message arrives after it, within REPLY_WINDOW_HOURS, and before that
   *  reader's next wake of ANY type — once another wake runs, what the reader
   *  says belongs to it. */
  newsWakesSent: number;
  newsWakesAnswered: number;
  /** Wakes the queue gave up on in the period. Distinct from a wake whose
   *  decision was `error`: this one never reached the model, so it leaves no
   *  wake row at all — which is exactly what a model outage looks like. */
  droppedWakes: number;
  wakesByEvent: WakeEventStats[];
  costUsd: number;
  /** Shared editorial passes in the period — once per meeting event, on top
   *  of the per-wake model cost. */
  editorialCostUsd: number;
  /** Rail-stopped sends in the period, by reason (όριο μηνυμάτων, παύση, …). */
  suppressions: Array<{ reason: string; count: number }>;
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
  newsWakesSent: number;
  newsWakesAnswered: number;
  /** Wake errors and dropped wakes together — see PeriodStats. */
  errors: number;
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
  newsWakesSent: 0,
  newsWakesAnswered: 0,
  droppedWakes: 0,
  wakesByEvent: [],
  costUsd: 0,
  editorialCostUsd: 0,
  suppressions: [],
};

type Db = ReturnType<typeof notisDb>;

/**
 * The reply rate over one window, as ONE query both readers share — the card's
 * headline passes no bucket, the chart passes one and gets the same numbers
 * per bucket. Two hand-kept copies of this drifted apart on every edit.
 *
 * `spans` holds only the wakes that DELIVERED, which decides both halves:
 *  - the denominator, because a silent wake could never draw a reply;
 *  - `next_send`, because only a later delivery can claim a reply that the
 *    earlier one might otherwise own. A silent wake between the two delivers
 *    nothing, so it must not close the window — it cannot take the reply into
 *    its own count, and the reply would be credited to nobody.
 * The CTE keeps the outer lower bound and no upper one: LEAD only looks
 * forward, so every candidate still finds its successor and the scan stays the
 * size of the period, not of all retained history.
 */
function replyRateQuery(from: Date, to: Date, bucket?: BucketUnit): Prisma.Sql {
  const bucketColumn = bucket
    ? Prisma.sql`date_trunc(${bucket}, w."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Athens') AS bucket,`
    : Prisma.empty;
  return Prisma.sql`
    WITH spans AS (
      SELECT "subscriptionId", "eventType", "createdAt",
             LEAD("createdAt") OVER (
               PARTITION BY "subscriptionId" ORDER BY "createdAt", id
             ) AS next_send
      FROM "NotisWake"
      WHERE decision = 'send'::"WakeDecision" AND "createdAt" >= ${from}
    )
    SELECT ${bucketColumn}
           COUNT(*)::int AS sends,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM "NotisMessage" r
             WHERE r."subscriptionId" = w."subscriptionId"
               AND r.direction = 'inbound'::"MessageDirection"
               AND r."createdAt" > w."createdAt"
               AND r."createdAt" < w."createdAt" + make_interval(hours => ${REPLY_WINDOW_HOURS}::int)
               AND (w.next_send IS NULL OR r."createdAt" < w.next_send)
           ))::int AS answered
    FROM spans w
    WHERE w."eventType" = ANY(${NEWS_WAKE_EVENTS}::text[])
      AND w."createdAt" >= ${from} AND w."createdAt" < ${to}
    ${bucket ? Prisma.sql`GROUP BY 1` : Prisma.empty}
  `;
}

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
    newsWakesSent: BucketCount[];
    newsWakesAnswered: BucketCount[];
    errors: BucketCount[];
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
    newsWakesSent: lookup(rows.newsWakesSent, key),
    newsWakesAnswered: lookup(rows.newsWakesAnswered, key),
    errors: lookup(rows.errors, key),
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

  const [messages, actives, unsubscribes, newsSends, errors] = await Promise.all([
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
    db.$queryRaw<Array<{ bucket: Date; sends: number; answered: number }>>(
      replyRateQuery(from, to, bucket),
    ),
    // Both failure shapes in one line: a wake that ran and erred, and a wake
    // the queue dropped before the model ever saw it.
    db.$queryRaw<Array<{ bucket: Date; count: number }>>`
      SELECT bucket, SUM(count)::int AS count FROM (
        SELECT date_trunc(${bucket}, "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Athens') AS bucket,
               COUNT(*)::int AS count
        FROM "NotisWake"
        WHERE decision = 'error'::"WakeDecision"
          AND "createdAt" >= ${from} AND "createdAt" < ${to}
        GROUP BY 1
        UNION ALL
        SELECT date_trunc(${bucket}, "updatedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Athens'),
               COUNT(*)::int
        FROM "NotisWakeQueue"
        WHERE status = 'failed'::"QueueItemStatus"
          AND "updatedAt" >= ${from} AND "updatedAt" < ${to}
        GROUP BY 1
      ) t GROUP BY 1
    `,
  ]);

  return fillSeries(from, to, bucket, {
    sent: messages.filter((r) => r.direction === "outbound").map(rawKey),
    received: messages.filter((r) => r.direction === "inbound").map(rawKey),
    activeUsers: actives.map(rawKey),
    unsubscribes: unsubscribes.map(rawKey),
    newsWakesSent: newsSends.map((r) => ({
      key: r.bucket.toISOString().slice(0, slice),
      count: r.sends,
    })),
    newsWakesAnswered: newsSends.map((r) => ({
      key: r.bucket.toISOString().slice(0, slice),
      count: r.answered,
    })),
    errors: errors.map(rawKey),
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
    editorialCost,
    suppressed,
    newsSends,
    droppedWakes,
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
    db.notisProcessedEvent.aggregate({
      where: { processedAt: { gte: from, lt: to } },
      _sum: { briefCostUsd: true },
    }),
    db.notisMessage.groupBy({
      by: ["failureReason"],
      where: { ...createdInPeriod, direction: "outbound", status: "suppressed" },
      _count: { _all: true },
    }),
    db.$queryRaw<Array<{ sends: number; answered: number }>>(replyRateQuery(from, to)),
    db.notisWakeQueue.count({ where: { status: "failed", updatedAt: { gte: from, lt: to } } }),
  ]);

  const directionCount = (d: string) =>
    messagesByDirection.find((r) => r.direction === d)?._count._all ?? 0;
  const outboundByStatus = Object.fromEntries(
    outboundStatus.map((r) => [r.status as string, r._count._all]),
  );
  const outboundTotal = Object.values(outboundByStatus).reduce((a, b) => a + b, 0);
  const failed = outboundByStatus.failed ?? 0;
  // Suppressed rows were never given to Bird — counting them in the fail
  // rate's denominator dilutes it with sends that could not fail.
  const sendable = outboundTotal - (outboundByStatus.suppressed ?? 0);

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
    failRate: sendable > 0 ? failed / sendable : null,
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
    newsWakesSent: newsSends[0]?.sends ?? 0,
    newsWakesAnswered: newsSends[0]?.answered ?? 0,
    droppedWakes,
    costUsd: byEvent.reduce((a, r) => a + r.costUsd, 0),
    editorialCostUsd: editorialCost._sum.briefCostUsd ?? 0,
    suppressions: suppressed
      .map((r) => ({ reason: r.failureReason ?? "—", count: r._count._all }))
      .sort((a, b) => b.count - a.count),
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
        newsWakesSent: [],
        newsWakesAnswered: [],
        errors: [],
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
    // Ranged like everything else on the page, and DISTINCT ON the
    // subscription: one active reader must not fill all five rows with
    // their own back-and-forth — the list answers «ποιοι μιλάνε», not
    // «τι ειπώθηκε τελευταίο».
    db.$queryRaw<
      Array<{
        id: string;
        body: string;
        createdAt: Date;
        subscriptionId: string;
        userId: string;
        userName: string | null;
      }>
    >`
      SELECT m.id, m.body, m."createdAt", s.id AS "subscriptionId",
             s."userId", s."userName"
      FROM (
        SELECT DISTINCT ON ("subscriptionId") id, body, "createdAt", "subscriptionId"
        FROM "NotisMessage"
        WHERE direction = 'inbound'::"MessageDirection"
          AND "createdAt" >= ${currentFrom} AND "createdAt" <= ${now}
        ORDER BY "subscriptionId", "createdAt" DESC, id DESC
      ) m
      JOIN "NotisSubscription" s ON s.id = m."subscriptionId"
      ORDER BY m."createdAt" DESC
      LIMIT 5
    `,
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
      subscriptionId: m.subscriptionId,
      userId: m.userId,
      userName: m.userName ?? "—",
      body: m.body,
      at: m.createdAt.toISOString(),
    })),
    totals: { subscriptions, unsubscribed },
  };
}
