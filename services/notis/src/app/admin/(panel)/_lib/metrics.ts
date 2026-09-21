// Not "server-only": pctChange and the metric types are imported by client
// components (DeltaChip, rendered inside the client MetricCard). The data
// readers here are guarded at their server-page call sites; see the
// (panel) auth-guard test.
import type { MessageStatus } from "../../../../../generated/client";
import { Prisma, hasNotisDb, notisDb } from "@/lib/db";

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
 * "compared with the previous …". `legend` names the two halves of the
 * trend chart, in the nominative and without the article.
 *
 * `buckets` is the length of the period, counted in whole Athens-local
 * buckets — 7 days, 24 hours, 60 minutes. The window is built from it (see
 * periodBounds), so a period is never a rolling duration that starts in the
 * middle of a bucket.
 */
export const RANGES = {
  "1h": {
    label: "την τελευταία ώρα",
    since: "την προηγούμενη ώρα",
    short: "1ω",
    buckets: 60,
    legend: {
      current: "τελευταία ώρα",
      previous: "προηγούμενη ώρα",
    },
    bucket: "minute" as BucketUnit,
  },
  "24h": {
    label: "τις τελευταίες 24 ώρες",
    since: "τις προηγούμενες 24 ώρες",
    short: "24ω",
    buckets: 24,
    legend: {
      current: "τελευταίες 24 ώρες",
      previous: "προηγούμενες 24 ώρες",
    },
    bucket: "hour" as BucketUnit,
  },
  "7d": {
    label: "τις τελευταίες 7 ημέρες",
    since: "τις προηγούμενες 7 ημέρες",
    short: "7ημ",
    buckets: 7,
    legend: {
      current: "τελευταίες 7 ημέρες",
      previous: "προηγούμενες 7 ημέρες",
    },
    bucket: "day" as BucketUnit,
  },
  "14d": {
    label: "τις τελευταίες 14 ημέρες",
    since: "τις προηγούμενες 14 ημέρες",
    short: "14ημ",
    buckets: 14,
    legend: {
      current: "τελευταίες 14 ημέρες",
      previous: "προηγούμενες 14 ημέρες",
    },
    bucket: "day" as BucketUnit,
  },
  "30d": {
    label: "τις τελευταίες 30 ημέρες",
    since: "τις προηγούμενες 30 ημέρες",
    short: "30ημ",
    buckets: 30,
    legend: {
      current: "τελευταίες 30 ημέρες",
      previous: "προηγούμενες 30 ημέρες",
    },
    bucket: "day" as BucketUnit,
  },
  "90d": {
    label: "τους τελευταίους 3 μήνες",
    since: "τους προηγούμενους 3 μήνες",
    short: "3μ",
    buckets: 90,
    legend: {
      current: "τελευταίοι 3 μήνες",
      previous: "προηγούμενοι 3 μήνες",
    },
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
 * Delivery states that mean an outbound row reached the reader. `failed` and
 * `suppressed` never arrived, and `pending` has not arrived yet: a reader
 * whose only message in the period is still held by a rail has had nothing
 * to reply to. Narrower than REACHED_STATUSES in queue.ts on purpose — the
 * cap there asks whether a push will land, the counts here whether it did.
 */
const DELIVERED = ["sent", "delivered", "read"] as const satisfies readonly MessageStatus[];

/**
 * The share of the readers Νότης WROTE TO who wrote back; null when he wrote
 * to nobody, so the card can say so instead of showing a confident 0%.
 *
 * One reader who answers five times counts once. A per-message rate cannot
 * tell five replies from one enthusiast apart from five replies from five
 * people, and those are opposite answers to "is this worth reading".
 *
 * The denominator is the readers who received something, not every reader on
 * the list. Νότης is quiet by design — three wakes in four end in silence —
 * so most of the list had nothing to reply to in any given period, and
 * counting them measures how often he writes rather than how well.
 *
 * The coupling runs both ways, and the second direction is easy to misread:
 * a wider send reaches more readers who were never going to answer, so the
 * rate FALLS when Νότης writes to more people. A quiet week of 30 recipients
 * and 9 repliers reads higher than a busy one of 400 and 60, though seven
 * times as many readers wrote back. Read it beside «ΕΛΗΦΘΗΣΑΝ», not alone.
 *
 * A reader who answers this week a message from last week lands in the
 * numerator without being in this window's denominator. That cannot push the
 * rate over 100% at any volume this service has seen, and intersecting the
 * two sets would drop genuinely engaged readers for the accident of when
 * they were last written to.
 */
export function replierRate(repliers: number, recipients: number): number | null {
  if (recipients <= 0) return null;
  // Clamped, because of the leak above: in a quiet period four readers can
  // answer while three were written to, and 133% is not a rate.
  return Math.min(repliers / recipients, 1);
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
 * Below this the movement is finer than the data can express. At ~200
 * recipients one reply is worth half a point, so a tenth of a point is not a move,
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
  // Nothing to compare, and «νέο» would say the opposite of what happened —
  // it means the PREVIOUS period had no baseline. The headline already reads
  // «—» here, and the chip says the same.
  if (current === null) return { kind: "none" };
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



export interface WakeEventStats {
  eventType: string;
  count: number;
  costUsd: number;
}

export interface PeriodStats {
  /** Subscriptions on at the end of the period — the audience, as a level.
   *  Not «readers with a message or a wake»: a wake is Νότης deciding
   *  whether to write, and most end in silence, so that count named nearly
   *  the whole list as active in any given week. */
  subscribers: number;
  /** Distinct subscriptions with a real exchange in the period: a message
   *  that reached them (see DELIVERED) or one they wrote. Not a wake — a
   *  wake is Νότης considering a reader, which the reader never sees. */
  activeUsers: number;
  newSubscriptions: number;
  /** Outbound rows in the period, whatever became of them. */
  messagesSent: number;
  /** The outbound rows that reached a reader (see DELIVERED). */
  messagesDelivered: number;
  messagesReceived: number;
  unsubscribes: number;
  outboundByStatus: Record<string, number>;
  /** failed / all outbound carrying a status; null when nothing was sent. */
  failRate: number | null;
  failureReasons: Array<{ reason: string; count: number }>;
  wakesTotal: number;
  wakesByDecision: { send: number; silence: number; error: number };
  /** Distinct subscriptions that sent at least one message in the period.
   *  The reader-level counterpart of `messagesReceived`. */
  repliers: number;
  /** Distinct subscriptions that received at least one message in the period
   *  (see DELIVERED) — the readers who had something to reply to. */
  recipients: number;
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

/** One Athens-local bucket (minute / hour / day). The series runs over the
 *  previous period and the current one, so the chart shows the change
 *  instead of only naming it. */
export interface SeriesPoint {
  /** Athens-local key: YYYY-MM-DD for days, YYYY-MM-DDTHH:MM below that. */
  key: string;
  /** Subscriptions on at the end of this bucket — a level, not a count. */
  subscribers: number;
  /** Distinct subscriptions with a real exchange in this bucket — see
   *  PeriodStats. */
  activeUsers: number;
  sent: number;
  received: number;
  /** Distinct subscriptions that wrote in this bucket. */
  repliers: number;
  /** Distinct subscriptions Νότης wrote to in this bucket. */
  recipients: number;
  /** Wake errors and dropped wakes together — see PeriodStats. */
  errors: number;
}

export interface OverviewStats {
  range: RangeKey;
  current: PeriodStats;
  previous: PeriodStats;
  /** Both periods, oldest bucket first. */
  series: SeriesPoint[];
  /** Index of the first bucket of the current period in `series`. The
   *  window is bucket-aligned, so every bucket before it belongs to the
   *  previous period and every bucket from it on to the current one. */
  boundaryIndex: number;
  recentInbound: RecentInbound[];
  totals: { unsubscribed: number };
}

const EMPTY_PERIOD: PeriodStats = {
  subscribers: 0,
  activeUsers: 0,
  newSubscriptions: 0,
  messagesSent: 0,
  messagesDelivered: 0,
  messagesReceived: 0,
  unsubscribes: 0,
  outboundByStatus: {},
  failRate: null,
  failureReasons: [],
  wakesTotal: 0,
  wakesByDecision: { send: 0, silence: 0, error: 0 },
  repliers: 0,
  recipients: 0,
  droppedWakes: 0,
  wakesByEvent: [],
  costUsd: 0,
  editorialCostUsd: 0,
  suppressions: [],
};

type Db = ReturnType<typeof notisDb>;

const BUCKET_STEP_MS: Record<BucketUnit, number> = {
  minute: 60 * 1000,
  hour: HOUR_MS,
  day: DAY_MS,
};

/** Key length: YYYY-MM-DD for days, YYYY-MM-DDTHH:MM below that. */
const keySlice = (bucket: BucketUnit) => (bucket === "day" ? 10 : 16);

/** Built once: every bucket of every chart reads the clock through it. */
const ATHENS_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Athens",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Athens wall-clock time of an instant, as `YYYY-MM-DDTHH:MM:SS`. */
function athensWallClock(date: Date): string {
  const parts = ATHENS_PARTS.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

/** The Athens-local bucket key of an instant, truncated TO the bucket —
 *  an hour key is always :00, matching what date_trunc emits. */
export function athensBucketKey(date: Date, bucket: BucketUnit): string {
  const wall = athensWallClock(date);
  const minutes = bucket === "minute" ? wall.slice(14, 16) : "00";
  return `${wall.slice(0, 14)}${minutes}`.slice(0, keySlice(bucket));
}

/** How far Athens runs ahead of UTC at an instant: +2h, or +3h in summer. */
function athensOffsetMs(date: Date): number {
  return Date.parse(`${athensWallClock(date)}Z`) - date.getTime();
}

/**
 * The instant an Athens-local bucket begins — the start of the day, hour or
 * minute that contains `date`. Read as UTC, the local wall clock is off by
 * the offset in force, so the offset is applied and then taken again at the
 * result: within an hour of a DST change the first guess can land on the
 * wrong side of it. A local time a spring-forward skips has no instant at
 * all, and the second pass lands on the hour beside it, which is where
 * date_trunc puts that bucket's rows too.
 */
export function athensBucketStart(date: Date, bucket: BucketUnit): Date {
  const key = athensBucketKey(date, bucket);
  const wallMs = Date.parse(bucket === "day" ? `${key}T00:00:00Z` : `${key}:00Z`);
  const guess = new Date(wallMs - athensOffsetMs(date));
  return new Date(wallMs - athensOffsetMs(guess));
}

/**
 * The two windows a range covers, aligned to Athens-local bucket edges: the
 * current period is the bucket `now` falls in plus the whole buckets before
 * it, and the previous period is the same number of buckets before that.
 *
 * Aligning is what lets a bucket belong to one period. A rolling window
 * starts mid-bucket, so the bucket holding its start carries rows from both
 * periods — and a chart drawn from it colours yesterday's traffic as today's
 * and stops adding up to the totals beside it. The cost is the last bucket,
 * which is only as old as `now`: a period is «7 days» the way a calendar
 * means it, six whole days and the one in progress.
 */
export function periodBounds(range: RangeKey, now: Date): { current: Date; previous: Date } {
  const { bucket, buckets } = RANGES[range];
  const current = athensBucketsBefore(athensBucketStart(now, bucket), bucket, buckets - 1);
  return { current, previous: athensBucketsBefore(current, bucket, buckets) };
}

/** The start of the bucket `count` buckets before `start`, itself a bucket
 *  start. An hour and a minute are fixed lengths, so the subtraction lands
 *  in the target bucket by itself; a day is 23 or 25 hours across a DST
 *  change, which leaves it an hour to either side of midnight, so the aim
 *  is the middle of the day and the truncation finds its start. */
function athensBucketsBefore(start: Date, bucket: BucketUnit, count: number): Date {
  const aim = bucket === "day" ? 12 * HOUR_MS : 0;
  return athensBucketStart(
    new Date(start.getTime() - count * BUCKET_STEP_MS[bucket] + aim),
    bucket,
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

/**
 * Zero-fill sparse per-bucket counts — charts need every bucket. The
 * subscriber level is run forward from the count at `from`: each bucket adds
 * its signups and takes away its stops, so the last bucket ends at the count
 * at `to`.
 */
export function fillSeries(
  from: Date,
  to: Date,
  bucket: BucketUnit,
  rows: {
    sent: BucketCount[];
    received: BucketCount[];
    activeUsers: BucketCount[];
    repliers: BucketCount[];
    recipients: BucketCount[];
    signups: BucketCount[];
    unsubscribes: BucketCount[];
    errors: BucketCount[];
  },
  subscribersAtStart: number,
): SeriesPoint[] {
  const lookup = (list: BucketCount[], key: string) =>
    list.find((r) => r.key === key)?.count ?? 0;
  let subscribers = subscribersAtStart;
  return listBuckets(from, to, bucket).map((key) => {
    subscribers += lookup(rows.signups, key) - lookup(rows.unsubscribes, key);
    return {
      key,
      subscribers,
      sent: lookup(rows.sent, key),
      received: lookup(rows.received, key),
      activeUsers: lookup(rows.activeUsers, key),
      repliers: lookup(rows.repliers, key),
      recipients: lookup(rows.recipients, key),
      errors: lookup(rows.errors, key),
    };
  });
}

/**
 * Index of the first bucket of the current period in a two-period series.
 * Keys are ISO-ordered text, so the comparison needs no parsing.
 */
export function boundaryIndexOf(series: Array<{ key: string }>, boundaryKey: string): number {
  const index = series.findIndex((point) => point.key >= boundaryKey);
  return index < 0 ? series.length : index;
}

/**
 * Subscriptions on at an instant: created before it and not stopped before
 * it. A reactivated subscription loses its `unsubscribedAt` and reads as on
 * throughout (see subscription-roster.ts); a stopped one without a date has
 * no instant it was on, so it never counts.
 */
function activeSubscribersAt(db: Db, at: Date): Promise<number> {
  return db.notisSubscription.count({
    where: {
      createdAt: { lt: at },
      OR: [{ status: "active" }, { unsubscribedAt: { gte: at } }],
    },
  });
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

  const [messages, readers, signups, unsubscribes, errors, startLevel] = await Promise.all([
    db.$queryRaw<Array<{ bucket: Date; direction: string; count: number }>>`
      SELECT date_trunc(${bucket}, "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Athens') AS bucket,
             direction::text AS direction, COUNT(*)::int AS count
      FROM "NotisMessage"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      GROUP BY 1, 2
    `,
    // Distinct readers per bucket, per direction and — the grouping set
    // without it, where direction reads NULL — both directions folded into
    // one: a reader written to and writing back in the same bucket is one
    // active reader. One scan; the rate the two halves feed divides one by
    // the other, so they must agree on what counts — see DELIVERED.
    //
    // `status::text`, not a bare `status`: the column is the MessageStatus
    // enum, and Postgres has no `"MessageStatus" = text` operator, so the
    // bare form does not fail on odd data — it fails always, with «operator
    // does not exist», and takes the whole overview page down.
    db.$queryRaw<Array<{ bucket: Date; direction: string | null; count: number }>>`
      SELECT bucket, direction, COUNT(DISTINCT sid)::int AS count FROM (
        SELECT date_trunc(${bucket}, "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Athens') AS bucket,
               direction::text AS direction, "subscriptionId" AS sid
        FROM "NotisMessage"
        WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
          AND (direction = 'inbound'::"MessageDirection" OR status::text = ANY(${[...DELIVERED]}::text[]))
      ) t GROUP BY GROUPING SETS ((bucket, direction), (bucket))
    `,
    // A stopped subscription without a date has no stop to take away later,
    // so it never joins the running level either — the rule
    // activeSubscribersAt applies at an instant, applied per bucket.
    db.$queryRaw<Array<{ bucket: Date; count: number }>>`
      SELECT date_trunc(${bucket}, "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Athens') AS bucket,
             COUNT(*)::int AS count
      FROM "NotisSubscription"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
        AND (status = 'active'::"SubscriptionStatus" OR "unsubscribedAt" IS NOT NULL)
      GROUP BY 1
    `,
    db.$queryRaw<Array<{ bucket: Date; count: number }>>`
      SELECT date_trunc(${bucket}, "unsubscribedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Athens') AS bucket,
             COUNT(*)::int AS count
      FROM "NotisSubscription"
      WHERE "unsubscribedAt" >= ${from} AND "unsubscribedAt" < ${to}
      GROUP BY 1
    `,
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
    activeSubscribersAt(db, from),
  ]);

  return fillSeries(
    from,
    to,
    bucket,
    {
      sent: messages.filter((r) => r.direction === "outbound").map(rawKey),
      received: messages.filter((r) => r.direction === "inbound").map(rawKey),
      activeUsers: readers.filter((r) => r.direction === null).map(rawKey),
      repliers: readers.filter((r) => r.direction === "inbound").map(rawKey),
      recipients: readers.filter((r) => r.direction === "outbound").map(rawKey),
      signups: signups.map(rawKey),
      unsubscribes: unsubscribes.map(rawKey),
      errors: errors.map(rawKey),
    },
    startLevel,
  );
}

async function periodStats(db: Db, from: Date, to: Date): Promise<PeriodStats> {
  const createdInPeriod = { createdAt: { gte: from, lt: to } };
  const [
    messagesByDirection,
    repliersByMessage,
    recipientsByMessage,
    outboundStatus,
    failures,
    newSubscriptions,
    unsubscribes,
    wakesByDecision,
    wakesByEvent,
    editorialCost,
    suppressed,
    droppedWakes,
    subscribers,
  ] = await Promise.all([
    db.notisMessage.groupBy({ by: ["direction"], where: createdInPeriod, _count: { _all: true } }),
    db.notisMessage.groupBy({
      by: ["subscriptionId"],
      where: { ...createdInPeriod, direction: "inbound" },
    }),
    db.notisMessage.groupBy({
      by: ["subscriptionId"],
      // A suppressed, failed or still-pending send has reached nobody, so
      // its reader has had nothing to reply to and does not belong in the
      // denominator — see DELIVERED.
      where: { ...createdInPeriod, direction: "outbound", status: { in: [...DELIVERED] } },
    }),
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
    db.notisWakeQueue.count({ where: { status: "failed", updatedAt: { gte: from, lt: to } } }),
    activeSubscribersAt(db, to),
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
    subscribers,
    activeUsers: new Set([
      ...recipientsByMessage.map((r) => r.subscriptionId),
      ...repliersByMessage.map((r) => r.subscriptionId),
    ]).size,
    newSubscriptions,
    messagesSent: directionCount("outbound"),
    messagesDelivered: DELIVERED.reduce((a, status) => a + (outboundByStatus[status] ?? 0), 0),
    messagesReceived: directionCount("inbound"),
    repliers: repliersByMessage.length,
    recipients: recipientsByMessage.length,
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
  const { bucket } = RANGES[range];
  const { current: currentFrom, previous: previousFrom } = periodBounds(range, now);

  if (!hasNotisDb()) {
    return {
      range,
      current: EMPTY_PERIOD,
      previous: EMPTY_PERIOD,
      series: fillSeries(
        previousFrom,
        now,
        bucket,
        {
          sent: [],
          received: [],
          activeUsers: [],
          repliers: [],
          recipients: [],
          signups: [],
          unsubscribes: [],
          errors: [],
        },
        0,
      ),
      // Resolved the same way as the live path: without it the chart draws
      // the whole two-period window as current, divider hard left.
      boundaryIndex: boundaryIndexOf(
        listBuckets(previousFrom, now, bucket).map((key) => ({ key })),
        athensBucketKey(currentFrom, bucket),
      ),
      recentInbound: [],
      totals: { unsubscribed: 0 },
    };
  }

  const db = notisDb();

  const [current, previous, series, recent, unsubscribed] = await Promise.all([
    periodStats(db, currentFrom, now),
    periodStats(db, previousFrom, currentFrom),
    bucketedSeries(db, previousFrom, now, bucket),
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
    db.notisSubscription.count({ where: { status: "unsubscribed" } }),
  ]);

  return {
    range,
    current,
    previous,
    series,
    boundaryIndex: boundaryIndexOf(series, athensBucketKey(currentFrom, bucket)),
    recentInbound: recent.map((m) => ({
      id: m.id,
      subscriptionId: m.subscriptionId,
      userId: m.userId,
      userName: m.userName ?? "—",
      body: m.body,
      at: m.createdAt.toISOString(),
    })),
    totals: { unsubscribed },
  };
}
