import { Activity, Euro, MessagesSquare, Users } from "lucide-react";
import { PageHeader } from "./_components/PageHeader";
import { LIVE_DATA, getPanelMetrics } from "./_lib/metrics";

export const metadata = { title: "Νότης · admin" };

function fmt(n: number | null, unit = ""): string {
  return n === null ? "—" : `${n.toLocaleString("el-GR")}${unit}`;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-medium tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function EmptyPanel({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex min-h-[220px] flex-col rounded-lg border bg-background p-4">
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-3 flex flex-1 items-center justify-center rounded-md border border-dashed">
        <p className="max-w-[260px] text-center text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const m = getPanelMetrics();
  const silenceRate =
    m.wakes.total > 0 ? `${Math.round((m.wakes.silences / m.wakes.total) * 100)}%` : "—";

  return (
    <>
      <PageHeader title="Επισκόπηση">
        {!LIVE_DATA && (
          <span className="self-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            χωρίς βάση · μηδενικά
          </span>
        )}
      </PageHeader>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <MetricCard
            icon={Users}
            label="Χρήστες"
            value={fmt(m.users.total)}
            detail={`${fmt(m.users.active)} ενεργοί · ${fmt(m.users.unsubscribed)} σε ΣΤΟΠ`}
          />
          <MetricCard
            icon={MessagesSquare}
            label="Μηνύματα"
            value={fmt(m.messages.sent)}
            detail={`${fmt(m.messages.received)} εισερχόμενα · ${fmt(m.messages.templated)} με template`}
          />
          <MetricCard
            icon={Activity}
            label="Wakes"
            value={fmt(m.wakes.total)}
            detail={`σιωπή ${silenceRate} · ${fmt(m.wakes.errors)} σφάλματα · ${fmt(m.scheduledFollowups)} follow-ups`}
          />
          <MetricCard
            icon={Euro}
            label="Κόστος μήνα"
            value={`$${m.costUsd.month.toFixed(2)}`}
            detail={
              m.costUsd.perUserMonth === null
                ? "ανά χρήστη —"
                : `ανά χρήστη $${m.costUsd.perUserMonth.toFixed(2)}`
            }
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <EmptyPanel
            title="Μηνύματα ανά ημέρα"
            hint="Το γράφημα θα γεμίσει όταν συνδεθεί η βάση δεδομένων (PR 2)."
          />
          <EmptyPanel
            title="Πρόσφατα wakes"
            hint="Κάθε αφύπνιση του Νότη — απόφαση, κόστος, διάρκεια — θα εμφανίζεται εδώ ζωντανά."
          />
        </div>
      </div>
    </>
  );
}
