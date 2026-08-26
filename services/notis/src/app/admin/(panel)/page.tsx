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
import { UserAvatar } from "./_components/UserAvatar";
import { fmtInt, fmtTimeAgo } from "./_lib/format";
import {
  BucketUnit,
  OverviewStats,
  PeriodStats,
  RANGES,
  RangeKey,
  SeriesPoint,
  getOverviewStats,
  liveData,
  parseRange,
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

function fmtPct(fraction: number): string {
  return `${(fraction * 100).toLocaleString("el-GR", { maximumFractionDigits: 1 })}%`;
}

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
  key: "activeUsers" | "sent" | "received" | "unsubscribes",
  bucket: BucketUnit,
): MetricPoint[] {
  return series.map((point) => ({
    key: point.key,
    label: fmtBucketLabel(point.key, bucket),
    value: point[key],
  }));
}

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
  const pointsDiff =
    current.failRate !== null && previous.failRate !== null
      ? (current.failRate - previous.failRate) * 100
      : null;
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
          {pointsDiff !== null && Math.abs(pointsDiff) >= 0.5 ? (
            <span
              className={`rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${
                pointsDiff < 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
              }`}
              title="μεταβολή σε ποσοστιαίες μονάδες"
            >
              {pointsDiff > 0 ? "↑" : "↓"}{" "}
              {Math.abs(pointsDiff).toLocaleString("el-GR", { maximumFractionDigits: 1 })} μον.
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
  const perUser = current.activeUsers > 0 ? totalCost / current.activeUsers : null;
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
        {perUser === null
          ? "ανά ενεργό χρήστη —"
          : `${fmtUsd(perUser)} ανά ενεργό χρήστη`}
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

async function RailsStrip({ suppressions }: { suppressions: Array<{ reason: string; count: number }> }) {
  const rails = await getRailsNow();
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
                  ? `απέτυχαν ${rails.queueTrouble.failed} (7ημ)`
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
        <RailsStrip suppressions={current.suppressions} />
        <div className="grid divide-y rounded-lg border bg-background sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4 xl:divide-x">
          <MetricCard
            label="Ενεργοί χρήστες"
            value={fmtInt(current.activeUsers)}
            current={current.activeUsers}
            previous={previous.activeUsers}
            points={seriesFor(stats.series, "activeUsers", RANGES[range].bucket)}
            detail={`+${fmtInt(current.newSubscriptions)} νέες εγγραφές · ${fmtInt(totals.subscriptions)} συνολικά`}
          />
          <MetricCard
            label="Απεστάλησαν"
            value={fmtInt(current.messagesSent)}
            current={current.messagesSent}
            previous={previous.messagesSent}
            points={seriesFor(stats.series, "sent", RANGES[range].bucket)}
            detail="μηνύματα του Νότη προς χρήστες"
          />
          <MetricCard
            label="Ελήφθησαν"
            value={fmtInt(current.messagesReceived)}
            current={current.messagesReceived}
            previous={previous.messagesReceived}
            points={seriesFor(stats.series, "received", RANGES[range].bucket)}
            detail="μηνύματα χρηστών προς τον Νότη"
          />
          <MetricCard
            label="Απεγγραφές"
            value={fmtInt(current.unsubscribes)}
            current={current.unsubscribes}
            previous={previous.unsubscribes}
            points={seriesFor(stats.series, "unsubscribes", RANGES[range].bucket)}
            invert
            tone="red"
            detail={`${fmtInt(totals.unsubscribed)} συνολικά σε ΣΤΟΠ`}
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
