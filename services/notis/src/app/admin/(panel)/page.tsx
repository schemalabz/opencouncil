import { getAdminSession } from "@/lib/session-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarClock, EyeOff, Gauge, Moon, OctagonAlert, Sun, TriangleAlert } from "lucide-react";
import { EVENT_LABELS } from "./_lib/records";
import { suppressionLabel } from "@/lib/queue";
import { getRailsNow } from "./_lib/system";
import { Countdown } from "./_components/Countdown";
import { DeltaChip } from "./_components/DeltaChip";
import { MetricCard, MetricPoint } from "./_components/MetricCard";
import { PageHeader } from "./_components/PageHeader";
import { TrendColumns, TrendLine, TrendPoint } from "./_components/TrendChart";
import { UserAvatar } from "./_components/UserAvatar";
import { CURRENT_PERIOD, PREVIOUS_PERIOD } from "./_lib/chart-colors";
import { fmtInt, fmtPct, fmtTimeAgo } from "./_lib/format";
import {
  BucketUnit,
  OverviewStats,
  PeriodStats,
  RANGES,
  RangeKey,
  SeriesPoint,
  getOverviewStats,
  periodBounds,
  liveData,
  parseRange,
  deltaFor,
  replierRate,
} from "./_lib/metrics";

export const metadata = { title: "Νότης · admin" };

/**
 * The overview: one window (default 7 days), every number beside its change
 * versus the period before it. Server-rendered; the range picker is links.
 */

const STATUS_LABELS: Record<string, string> = {
  pending: "σε αναμονή",
  sent: "εστάλησαν",
  delivered: "παραδόθηκαν",
  read: "διαβάστηκαν",
  failed: "απέτυχαν",
  suppressed: "κατεστάλησαν",
};

const STATUS_BAR: Record<string, string> = {
  pending: "bg-stone-200",
  sent: "bg-stone-300",
  delivered: "bg-stone-400",
  read: "bg-[#53bdeb]",
  failed: "bg-red-500",
  suppressed: "bg-stone-400/60",
};

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Chart tooltip label for an Athens-local bucket key. Buckets are floored,
 * so an hour bucket names its full interval — «13:00–14:00» is 13:00 up to
 * (not including) 14:00. Days read «Σαβ 16/8», minutes the exact «13:14».
 */
function fmtBucketLabel(key: string, bucket: BucketUnit): string {
  if (bucket === "day") {
    return new Intl.DateTimeFormat("el-GR", {
      weekday: "short",
      day: "numeric",
      month: "numeric",
    }).format(new Date(`${key}T12:00:00Z`));
  }
  const time = key.slice(11);
  if (bucket === "minute") return time;
  const hour = Number.parseInt(time.slice(0, 2), 10);
  return `${time}–${String((hour + 1) % 24).padStart(2, "0")}:00`;
}

function seriesFor(
  series: SeriesPoint[],
  key: "activeUsers" | "sent" | "received" | "errors",
  bucket: BucketUnit,
): MetricPoint[] {
  return series.map((point) => ({
    key: point.key,
    label: fmtBucketLabel(point.key, bucket),
    value: point[key],
  }));
}

/** «Κυρ» for a sub-day bucket key, whose date part is already Athens-local. */
function athensWeekday(key: string): string {
  return new Intl.DateTimeFormat("el-GR", { weekday: "short", timeZone: "UTC" }).format(
    new Date(`${key}:00Z`),
  );
}

/**
 * Tooltip label on the two-period trend chart. Like fmtBucketLabel, except
 * that an hour bucket also names its day: the chart holds every wall-clock
 * hour twice, and «13:00–14:00» alone cannot say which day the bar is.
 */
function fmtTrendLabel(key: string, bucket: BucketUnit): string {
  const label = fmtBucketLabel(key, bucket);
  return bucket === "hour" ? `${athensWeekday(key)} ${label}` : label;
}

/** Axis tick: the day for day buckets, the day and the hour for hour
 *  buckets, the minute alone for minute buckets. */
function fmtAxisLabel(key: string, bucket: BucketUnit): string {
  if (bucket === "day") return fmtBucketLabel(key, bucket);
  if (bucket === "minute") return key.slice(11);
  return `${athensWeekday(key)} ${key.slice(11)}`;
}

const BUCKET_NOUN: Record<BucketUnit, { per: string; end: string }> = {
  minute: { per: "λεπτό", end: "λεπτού" },
  hour: { per: "ώρα", end: "ώρας" },
  day: { per: "ημέρα", end: "ημέρας" },
};

function StackedBar({
  segments,
}: {
  segments: Array<{ value: number; className: string }>;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total === 0) return <div className="h-1.5 rounded-full bg-muted" />;
  return (
    <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
      {segments
        .filter((s) => s.value > 0)
        .map((s, i) => (
          <div key={i} className={s.className} style={{ width: `${(s.value / total) * 100}%` }} />
        ))}
    </div>
  );
}

function Legend({
  items,
}: {
  items: Array<{ label: string; value: number; dotClass: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${item.dotClass}`} />
          {item.label} <span className="tabular-nums text-foreground">{fmtInt(item.value)}</span>
        </span>
      ))}
    </div>
  );
}

/** Label · thin bar · count, scaled to the largest row in the group. */
function BreakdownRows({
  rows,
  barClass,
  format = fmtInt,
}: {
  rows: Array<{ label: string; value: number }>;
  barClass: string;
  format?: (n: number) => string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-1.5">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5">
          <span className="truncate text-xs text-muted-foreground">{row.label}</span>
          <span className="text-xs tabular-nums">{format(row.value)}</span>
          <div className="col-span-2 h-1 overflow-hidden rounded-full bg-muted">
            <div className={`h-full ${barClass}`} style={{ width: `${(row.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function RangePicker({ active }: { active: RangeKey }) {
  return (
    <nav className="ml-auto flex items-center gap-0.5 rounded-md border p-0.5">
      {(Object.keys(RANGES) as RangeKey[]).map((key) => (
        <Link
          key={key}
          href={key === "7d" ? "/admin" : `/admin?range=${key}`}
          title={RANGES[key].label}
          className={`rounded px-2 py-1 text-xs transition-colors ${
            key === active
              ? "bg-foreground font-medium text-background"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {RANGES[key].short}
        </Link>
      ))}
    </nav>
  );
}

function WakesPanel({ current, previous }: { current: PeriodStats; previous: PeriodStats }) {
  const { send, silence, error } = current.wakesByDecision;
  return (
    <section className="rounded-lg border bg-background p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Wakes</h2>
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tabular-nums">{fmtInt(current.wakesTotal)}</span>
          <DeltaChip current={current.wakesTotal} previous={previous.wakesTotal} />
        </div>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {current.wakesTotal > 0
          ? `απόφαση σιωπής ${fmtPct(silence / current.wakesTotal)} · απόφαση μηνύματος ${fmtPct(send / current.wakesTotal)}`
          : "καμία αφύπνιση στην περίοδο"}
      </p>
      <div className="mt-3 space-y-2">
        <StackedBar
          segments={[
            { value: silence, className: "bg-stone-300" },
            { value: send, className: "bg-orange" },
            { value: error, className: "bg-red-500" },
          ]}
        />
        <Legend
          items={[
            { label: "απόφαση σιωπής", value: silence, dotClass: "bg-stone-300" },
            { label: "απόφαση μηνύματος", value: send, dotClass: "bg-orange" },
            ...(error > 0 ? [{ label: "σφάλματα", value: error, dotClass: "bg-red-500" }] : []),
          ]}
        />
      </div>
      {current.wakesByEvent.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <BreakdownRows
            rows={current.wakesByEvent.map((r) => ({
              label: EVENT_LABELS[r.eventType] ?? r.eventType,
              value: r.count,
            }))}
            barClass="bg-orange/60"
          />
        </div>
      )}
    </section>
  );
}

function DeliveryPanel({ current, previous }: { current: PeriodStats; previous: PeriodStats }) {
  const statuses = Object.entries(current.outboundByStatus).sort(
    ([a], [b]) =>
      Object.keys(STATUS_LABELS).indexOf(a) - Object.keys(STATUS_LABELS).indexOf(b),
  );
  // The same decision the reply-rate chip makes, so two rates on one screen
  // agree about what a move is and about an absent baseline. The rendering
  // stays local: this chip falls back to a label, not to «=».
  const failDelta = deltaFor({
    current: current.failRate,
    previous: previous.failRate,
    unit: "percent",
    invert: true,
  });
  return (
    <section className="rounded-lg border bg-background p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Παραδόσεις</h2>
        <div className="flex items-baseline gap-2">
          <span
            className={`text-lg font-semibold tabular-nums ${
              (current.failRate ?? 0) > 0 ? "text-red-600" : ""
            }`}
          >
            {current.failRate === null ? "—" : fmtPct(current.failRate)}
          </span>
          {failDelta.kind === "move" ? (
            <span
              className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                failDelta.improving ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
              }`}
              title="μεταβολή σε ποσοστιαίες μονάδες"
            >
              {failDelta.up ? "↑" : "↓"}{" "}
              {failDelta.magnitude.toLocaleString("el-GR", { maximumFractionDigits: 1 })} μον.
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground/60">αποτυχίες</span>
          )}
        </div>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {statuses.length > 0
          ? `${fmtInt(current.messagesSent)} εξερχόμενα στην περίοδο`
          : "καμία αποστολή στην περίοδο"}
      </p>
      <div className="mt-3 space-y-2">
        <StackedBar
          segments={statuses.map(([status, value]) => ({
            value,
            className: STATUS_BAR[status] ?? "bg-stone-200",
          }))}
        />
        <Legend
          items={statuses.map(([status, value]) => ({
            label: STATUS_LABELS[status] ?? status,
            value,
            dotClass: STATUS_BAR[status] ?? "bg-stone-200",
          }))}
        />
      </div>
      {current.failureReasons.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Λόγοι αποτυχίας
          </p>
          <BreakdownRows
            rows={current.failureReasons.map((r) => ({ label: r.reason, value: r.count }))}
            barClass="bg-red-400"
          />
        </div>
      )}
    </section>
  );
}

function CostPanel({ current, previous }: { current: PeriodStats; previous: PeriodStats }) {
  const totalCost = current.costUsd + current.editorialCostUsd;
  const previousTotal = previous.costUsd + previous.editorialCostUsd;
  const perUser = current.subscribers > 0 ? totalCost / current.subscribers : null;
  return (
    <section className="rounded-lg border bg-background p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Κόστος</h2>
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tabular-nums">{fmtUsd(totalCost)}</span>
          <DeltaChip current={totalCost} previous={previousTotal} invert />
        </div>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {perUser === null ? "ανά συνδρομητή —" : `${fmtUsd(perUser)} ανά συνδρομητή`}
      </p>
      {current.wakesByEvent.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <BreakdownRows
            rows={current.wakesByEvent
              .slice()
              .sort((a, b) => b.costUsd - a.costUsd)
              .map((r) => ({
                label: EVENT_LABELS[r.eventType] ?? r.eventType,
                value: r.costUsd,
              }))
              .concat(
                current.editorialCostUsd > 0
                  ? [{ label: "editorial pass", value: current.editorialCostUsd }]
                  : [],
              )}
            barClass="bg-orange/60"
            format={fmtUsd}
          />
        </div>
      )}
    </section>
  );
}

function fmtPerReader(messages: number, readers: number): string {
  return (messages / readers).toLocaleString("el-GR", { maximumFractionDigits: 1 });
}

function UsageTile({
  label,
  value,
  current,
  previous,
  invert = false,
  share,
  barClass,
  lines,
}: {
  label: string;
  value: string;
  current: number;
  previous: number;
  invert?: boolean;
  /** The bar under the number: this count as a share of the subscribers. */
  share: number;
  barClass: string;
  lines: React.ReactNode[];
}) {
  return (
    <div className="px-5 py-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-3xl font-semibold">{value}</span>
        <DeltaChip current={current} previous={previous} invert={invert} />
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${share * 100}%` }} />
      </div>
      <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
        {lines.map((line, index) => (
          <p key={index} className="truncate">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

/**
 * Four counts of people, each a share of the subscribers: on the list, wrote
 * to, wrote back, left. Messages are the second line of each, never the
 * headline — 900 messages to 375 readers and 900 to 90 are different weeks,
 * and only the reader count tells them apart.
 */
function UsagePanel({
  current,
  previous,
  totals,
}: {
  current: PeriodStats;
  previous: PeriodStats;
  totals: OverviewStats["totals"];
}) {
  // Everyone who was on the list at some point in the period: the level at
  // its start plus the signups. The level at its END would leave out a
  // reader who got a message and then said ΣΤΟΠ, and a blast followed by
  // many stops would read as «more readers reached than subscribers».
  const base = previous.subscribers + current.newSubscriptions;
  const share = (n: number) => (base > 0 ? Math.min(n / base, 1) : 0);
  // Readers who had something to reply to: the ones Νότης actually wrote to
  // in the period, not everyone on the list. He is quiet by design, so most
  // of the list hears nothing in any given week, and dividing by all of them
  // measures how often he writes rather than how well.
  const currentReplierRate = replierRate(current.repliers, current.recipients);
  const previousReplierRate = replierRate(previous.repliers, previous.recipients);
  return (
    <section className="rounded-lg border bg-background">
      <div className="flex items-baseline gap-2 px-5 pt-4">
        <h2 className="text-sm font-medium">Χρήση</h2>
        <span className="text-xs text-muted-foreground">
          αναγνώστες στην περίοδο, ο καθένας μία φορά
        </span>
      </div>
      <div className="grid divide-y sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4 xl:divide-x">
        <UsageTile
          label="Συνδρομητές"
          value={fmtInt(current.subscribers)}
          current={current.subscribers}
          previous={previous.subscribers}
          share={share(current.subscribers)}
          barClass="bg-[#fb923c]"
          lines={[
            "ενεργοί στο τέλος της περιόδου",
            `+${fmtInt(current.newSubscriptions)} νέοι · ${fmtInt(current.unsubscribes)} ΣΤΟΠ`,
          ]}
        />
        <UsageTile
          label="Έλαβαν μήνυμα"
          value={fmtInt(current.recipients)}
          current={current.recipients}
          previous={previous.recipients}
          share={share(current.recipients)}
          barClass="bg-[#ea580c]"
          lines={
            current.recipients === 0
              ? ["ο Νότης δεν έγραψε σε κανέναν στην περίοδο"]
              : [
                  `${fmtPct(share(current.recipients))} των συνδρομητών`,
                  `${fmtInt(current.messagesDelivered)} μηνύματα · ${fmtPerReader(current.messagesDelivered, current.recipients)} ανά αναγνώστη`,
                ]
          }
        />
        <UsageTile
          label="Έγραψαν στον Νότη"
          value={fmtInt(current.repliers)}
          current={current.repliers}
          previous={previous.repliers}
          share={share(current.repliers)}
          barClass="bg-[#c2410c]"
          lines={[
            currentReplierRate === null ? (
              "—"
            ) : (
              <>
                {fmtPct(currentReplierRate, true)} όσων έλαβαν μήνυμα{" "}
                <DeltaChip
                  current={currentReplierRate}
                  previous={previousReplierRate}
                  unit="percent"
                />
              </>
            ),
            current.repliers === 0
              ? "κανένα εισερχόμενο στην περίοδο"
              : `${fmtInt(current.messagesReceived)} μηνύματα · ${fmtPerReader(current.messagesReceived, current.repliers)} ανά αναγνώστη`,
          ]}
        />
        <UsageTile
          label="Απεγγραφές"
          value={fmtInt(current.unsubscribes)}
          current={current.unsubscribes}
          previous={previous.unsubscribes}
          invert
          share={share(current.unsubscribes)}
          barClass="bg-stone-500"
          lines={[
            base === 0 ? "—" : `${fmtPct(share(current.unsubscribes))} των συνδρομητών`,
            `${fmtInt(totals.unsubscribed)} συνολικά σε ΣΤΟΠ`,
          ]}
        />
      </div>
    </section>
  );
}

/** The label beside its chart, and above it once the row is too narrow to
 *  give both a readable width — the panel's sidebar never collapses, so the
 *  squeeze lands entirely on this column. */
const TREND_COLUMNS = "grid grid-cols-1 gap-x-5 md:grid-cols-[11rem_1fr]";
/** The label column's share of a row, held open beside the charts only. */
const TREND_SPACER = "hidden md:block";

function TrendRow({
  label,
  sub,
  boundaryPct,
  children,
}: {
  label: string;
  sub: string;
  /** Where the current period starts, as a share of the chart's width. */
  boundaryPct: number;
  children: React.ReactNode;
}) {
  return (
    <div className={`${TREND_COLUMNS} border-t py-3`}>
      <div className="pt-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{sub}</p>
      </div>
      {/* The svg may overflow: an end label sits half a band from the edge. */}
      <div className="relative h-20 [&_svg]:overflow-visible">
        <div
          className="pointer-events-none absolute inset-y-0 z-10 w-px bg-stone-300"
          style={{ left: `${boundaryPct}%` }}
        />
        {children}
      </div>
    </div>
  );
}

/**
 * The same three counts over time, previous period beside current, so «is
 * it growing» is seen and not only read off a chip: the audience as a
 * level, then the readers written to and the readers who wrote back, per
 * bucket. Spikes are the product — Νότης writes when a council met.
 */
function TrendPanel({ stats, range }: { stats: OverviewStats; range: RangeKey }) {
  const { bucket, legend } = RANGES[range];
  const { series, boundaryIndex, current, previous } = stats;
  const boundaryPct = (boundaryIndex / series.length) * 100;
  const points = (key: "subscribers" | "recipients" | "repliers"): TrendPoint[] =>
    series.map((point) => ({
      key: point.key,
      label: fmtTrendLabel(point.key, bucket),
      value: point[key],
    }));
  const readers = (now: number, then: number) =>
    `${fmtInt(now)} αναγνώστες · πριν ${fmtInt(then)}`;
  // One scale for both reader rows: the writers are a subset of the readers
  // written to, and the chart should look like it.
  const readersMax = Math.max(...series.map((point) => Math.max(point.recipients, point.repliers)));
  const first = series[0];
  const boundary = series[boundaryIndex];
  const last = series[series.length - 1];
  return (
    <section className="rounded-lg border bg-background px-4 pb-3 pt-4">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-medium">Πορεία</h2>
        <span className="text-xs text-muted-foreground">
          ανά {BUCKET_NOUN[bucket].per}, οι δύο περίοδοι δίπλα-δίπλα
        </span>
      </div>
      <div className={`${TREND_COLUMNS} mt-3 pb-1`}>
        <div className={TREND_SPACER} />
        <div className="flex text-[11px] font-medium uppercase tracking-wider">
          <span
            className="inline-flex shrink-0 items-center gap-1.5 text-muted-foreground"
            style={{ width: `${boundaryPct}%` }}
          >
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: PREVIOUS_PERIOD }} />
            {legend.previous}
          </span>
          <span className="inline-flex items-center gap-1.5 pl-3">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CURRENT_PERIOD }} />
            {legend.current}
          </span>
        </div>
      </div>
      <TrendRow
        label="Συνδρομητές"
        sub={`ενεργοί στο τέλος κάθε ${BUCKET_NOUN[bucket].end}`}
        boundaryPct={boundaryPct}
      >
        <TrendLine points={points("subscribers")} boundaryIndex={boundaryIndex} unit="συνδρομητές" />
      </TrendRow>
      <TrendRow
        label="Έλαβαν μήνυμα"
        sub={readers(current.recipients, previous.recipients)}
        boundaryPct={boundaryPct}
      >
        <TrendColumns
          points={points("recipients")}
          boundaryIndex={boundaryIndex}
          unit="αναγνώστες"
          max={readersMax}
        />
      </TrendRow>
      <TrendRow
        label="Έγραψαν στον Νότη"
        sub={readers(current.repliers, previous.repliers)}
        boundaryPct={boundaryPct}
      >
        <TrendColumns
          points={points("repliers")}
          boundaryIndex={boundaryIndex}
          unit="αναγνώστες"
          max={readersMax}
        />
      </TrendRow>
      <div className={`${TREND_COLUMNS} pt-1`}>
        <div className={TREND_SPACER} />
        <div className="relative h-4 text-[11px] tabular-nums text-muted-foreground">
          {first && <span className="absolute left-0">{fmtAxisLabel(first.key, bucket)}</span>}
          {boundary && (
            <span className="absolute -translate-x-1/2" style={{ left: `${boundaryPct}%` }}>
              {fmtAxisLabel(boundary.key, bucket)}
            </span>
          )}
          {last && <span className="absolute right-0">{fmtAxisLabel(last.key, bucket)}</span>}
        </div>
      </div>
    </section>
  );
}

function RecentInboundList({ stats }: { stats: OverviewStats }) {
  return (
    <section className="rounded-lg border bg-background">
      <div className="flex items-baseline gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-medium">Τι λένε οι χρήστες</h2>
        <span className="text-xs text-muted-foreground">τα 5 τελευταία εισερχόμενα</span>
      </div>
      {stats.recentInbound.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-muted-foreground">
          Κανένα εισερχόμενο μήνυμα ακόμα — μόλις κάποιος γράψει στον Νότη, θα φαίνεται εδώ.
        </p>
      ) : (
        <ul className="divide-y">
          {stats.recentInbound.map((m) => (
            <li key={m.id}>
              <Link
                href={`/admin/conversations/${m.subscriptionId}`}
                className="group flex gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <span className="mt-0.5 shrink-0">
                  <UserAvatar seed={m.userId} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium">{m.userName}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {fmtTimeAgo(m.at)}
                      <span className="ml-1 inline-block transition-transform group-hover:translate-x-0.5">
                        ›
                      </span>
                    </span>
                  </span>
                  <span className="mt-1 inline-block max-w-full rounded-lg rounded-tl-none bg-muted px-3 py-1.5">
                    <span className="line-clamp-2 break-words text-sm">{m.body.trim()}</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function RailsStrip({
  suppressions,
  range,
}: {
  suppressions: Array<{ reason: string; count: number }>;
  range: RangeKey;
}) {
  const rails = await getRailsNow(periodBounds(range, new Date()).current);
  if (!rails) return null;
  const suppressedTotal = suppressions.reduce((a, r) => a + r.count, 0);
  const cell = "flex items-center gap-2.5 px-4";
  return (
    <div className="flex items-stretch overflow-x-auto rounded-lg border bg-background py-2.5 text-xs [&>*+*]:border-l">
      <div className={cell}>
        {rails.settings.paused ? (
          <span className="flex items-center gap-1 rounded bg-destructive/10 px-2 py-1 font-semibold uppercase tracking-wider text-destructive">
            <OctagonAlert className="h-3 w-3" /> παύση
          </span>
        ) : (
          <span className="rounded bg-green-600/10 px-2 py-1 font-semibold uppercase tracking-wider text-green-700">
            ενεργό
          </span>
        )}
      </div>

      <div className={cell}>
        {rails.phase.kind === "active" ? (
          <Sun className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <Moon className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="leading-tight">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {rails.phase.kind === "active" ? "ησυχία" : "απελευθέρωση"}
          </p>
          <Countdown
            prefix="σε"
            target={rails.phase.until}
            start={rails.phase.since}
            className="mt-0.5 w-24"
          />
        </div>
      </div>

      {(rails.queueTrouble.failed > 0 || rails.queueTrouble.retrying > 0) && (
        <div className={cell}>
          <TriangleAlert className="h-4 w-4 shrink-0 text-destructive" />
          <div className="leading-tight">
            <p className="text-sm font-semibold tabular-nums text-destructive">
              {rails.queueTrouble.failed + rails.queueTrouble.retrying}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {[
                rails.queueTrouble.failed > 0
                  ? `απέτυχαν ${rails.queueTrouble.failed} (${RANGES[range].short})`
                  : "",
                rails.queueTrouble.retrying > 0
                  ? `ξαναδοκιμάζει ${rails.queueTrouble.retrying}`
                  : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
      )}

      {rails.heldUntilRelease > 0 && (
        <div className={cell}>
          <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="leading-tight">
            <p className="text-sm font-semibold tabular-nums">{rails.heldUntilRelease}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              σε αναμονή
            </p>
          </div>
        </div>
      )}

      {rails.atCapCount > 0 && (
        <div className={cell}>
          <Gauge className="h-4 w-4 shrink-0 text-amber-600" />
          <div className="leading-tight">
            <p className="text-sm font-semibold tabular-nums text-amber-700">
              {rails.atCapCount}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              στο όριο
            </p>
          </div>
        </div>
      )}

      {suppressedTotal > 0 && (
        <div className={cell}>
          <EyeOff className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="leading-tight">
            <p className="text-sm font-semibold tabular-nums">{suppressedTotal}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {suppressions
                .map((r) => `${suppressionLabel(r.reason)} ${r.count}`)
                .join(" · ")}
            </p>
          </div>
        </div>
      )}

      <div className="ml-auto flex items-center pl-4 pr-2">
        <Link
          href="/admin/system"
          className="rounded-md border px-2.5 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Σύστημα →
        </Link>
      </div>
    </div>
  );
}

export default async function DashboardPage(props: {
  searchParams: Promise<{ range?: string }>;
}) {
  // Re-assert auth in the page body: the (panel) layout guard does not
  // re-run on an RSC soft-navigation, so a segment request can reach this
  // page without it (enforced by the admin-auth-guard test).
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const range = parseRange((await props.searchParams).range);
  const stats = await getOverviewStats(range);
  const { current, previous, totals } = stats;
  const { bucket } = RANGES[range];
  // The sparklines keep to the current period, as the cards always have; the
  // trend block above them is where the previous period is drawn.
  const currentSeries = stats.series.slice(stats.boundaryIndex);
  // Both shapes in one number: the wake that erred and the wake that never
  // ran. A model outage produces only the second, so a chart of the first
  // alone stays flat through it.
  const currentErrors = current.wakesByDecision.error + current.droppedWakes;
  const previousErrors = previous.wakesByDecision.error + previous.droppedWakes;

  return (
    <>
      <PageHeader title="Επισκόπηση">
        <span className="text-xs text-muted-foreground">
          {RANGES[range].label}, σε σύγκριση με {RANGES[range].since}
        </span>
        {!liveData() && (
          <span className="self-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            χωρίς βάση · μηδενικά
          </span>
        )}
        <RangePicker active={range} />
      </PageHeader>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <RailsStrip suppressions={current.suppressions} range={range} />
        <UsagePanel current={current} previous={previous} totals={totals} />
        <TrendPanel stats={stats} range={range} />

        <div className="grid divide-y rounded-lg border bg-background sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4 xl:divide-x">
          <MetricCard
            label="Απεστάλησαν"
            value={fmtInt(current.messagesSent)}
            current={current.messagesSent}
            previous={previous.messagesSent}
            points={seriesFor(currentSeries, "sent", bucket)}
            detail="μηνύματα του Νότη προς χρήστες"
          />
          <MetricCard
            label="Ελήφθησαν"
            value={fmtInt(current.messagesReceived)}
            current={current.messagesReceived}
            previous={previous.messagesReceived}
            points={seriesFor(currentSeries, "received", bucket)}
            detail="μηνύματα χρηστών προς τον Νότη"
          />
          <MetricCard
            label="Ενεργοί χρήστες"
            value={fmtInt(current.activeUsers)}
            current={current.activeUsers}
            previous={previous.activeUsers}
            points={seriesFor(currentSeries, "activeUsers", bucket)}
            detail="έλαβαν ή έστειλαν μήνυμα στην περίοδο"
          />
          <MetricCard
            label="Σφάλματα"
            value={fmtInt(currentErrors)}
            current={currentErrors}
            previous={previousErrors}
            points={seriesFor(currentSeries, "errors", bucket)}
            invert
            tone="red"
            detail={`${fmtInt(current.wakesByDecision.error)} σε wake · ${fmtInt(current.droppedWakes)} χάθηκαν πριν φτάσουν στο μοντέλο`}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <WakesPanel current={current} previous={previous} />
          <DeliveryPanel current={current} previous={previous} />
          <CostPanel current={current} previous={previous} />
        </div>

        <RecentInboundList stats={stats} />
      </div>
    </>
  );
}
