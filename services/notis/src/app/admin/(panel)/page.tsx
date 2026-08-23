import { getAdminSession } from "@/lib/session-auth";
import { redirect } from "next/navigation";
import { Activity, Euro, MessagesSquare, Users } from "lucide-react";
import { StatsCard } from "@opencouncil/ui/stats-card";
import { PageHeader } from "./_components/PageHeader";
import { fmtInt } from "./_lib/format";
import { getPanelMetrics, liveData } from "./_lib/metrics";

export const metadata = { title: "Νότης · admin" };

function fmt(n: number | null, unit = ""): string {
  return n === null ? "—" : `${fmtInt(n)}${unit}`;
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

export default async function DashboardPage() {
  // Re-assert auth in the page body: the (panel) layout guard does not
  // re-run on an RSC soft-navigation, so a segment request can reach this
  // page without it (enforced by the admin-auth-guard test).
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const m = await getPanelMetrics();
  const silenceRate =
    m.wakes.total > 0 ? `${Math.round((m.wakes.silences / m.wakes.total) * 100)}%` : "—";

  return (
    <>
      <PageHeader title="Επισκόπηση">
        {!liveData() && (
          <span className="self-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            χωρίς βάση · μηδενικά
          </span>
        )}
      </PageHeader>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <StatsCard
          columns={4}
          items={[
            {
              title: "Χρήστες",
              value: fmt(m.users.total),
              icon: <Users className="h-4 w-4" />,
              description: `${fmt(m.users.active)} ενεργοί · ${fmt(m.users.unsubscribed)} σε ΣΤΟΠ`,
            },
            {
              title: "Μηνύματα",
              value: fmt(m.messages.sent),
              icon: <MessagesSquare className="h-4 w-4" />,
              description: `${fmt(m.messages.received)} εισερχόμενα · ${fmt(m.messages.templated)} με template`,
            },
            {
              title: "Wakes",
              value: fmt(m.wakes.total),
              icon: <Activity className="h-4 w-4" />,
              description: `σιωπή ${silenceRate} · ${fmt(m.wakes.errors)} σφάλματα · ${fmt(m.scheduledFollowups)} follow-ups`,
            },
            {
              title: "Κόστος μήνα",
              value: `$${m.costUsd.month.toFixed(2)}`,
              icon: <Euro className="h-4 w-4" />,
              description:
                m.costUsd.perUserMonth === null
                  ? "ανά χρήστη —"
                  : `ανά χρήστη $${m.costUsd.perUserMonth.toFixed(2)}`,
            },
          ]}
        />

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
