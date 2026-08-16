import { Activity } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "../_components/EmptyState";
import { PageHeader } from "../_components/PageHeader";
import { fmtDateTime, fmtInt, fmtTimeAgo } from "../_lib/format";
import {
  DecisionFilter,
  EventFilter,
  WakeFeedEntry,
  WakeFilter,
  listRecentWakes,
  parseDecisionFilter,
  parseEventFilter,
} from "../_lib/wakes";

export const metadata = { title: "Wakes · Νότης admin" };

/**
 * The cross-user wake feed: every invocation with its decision AND its
 * rationale — the rationale is what an admin actually reviews. Rows link
 * into the conversation; the full trace lives in its inspector.
 */

const EVENT_LABELS: Record<string, string> = {
  user_message: "μήνυμα χρήστη",
  agenda_processed: "ατζέντα",
  meeting_summarized: "απολογισμός",
  scheduled: "προγραμματισμένο",
  heartbeat: "heartbeat",
};

const DECISION_FILTERS: Array<{ key: DecisionFilter; label: string }> = [
  { key: "all", label: "Όλα" },
  { key: "send", label: "Απαντήσεις" },
  { key: "silence", label: "Σιωπές" },
  { key: "error", label: "Σφάλματα" },
];

/** ?decision=…&event=…, omitting defaults so the bare URL stays canonical. */
function feedHref(filter: WakeFilter): string {
  const params = new URLSearchParams();
  if (filter.decision !== "all") params.set("decision", filter.decision);
  if (filter.event !== "all") params.set("event", filter.event);
  const query = params.toString();
  return query ? `/admin/wakes?${query}` : "/admin/wakes";
}

function FilterChip({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      className={`rounded px-2 py-1 text-xs transition-colors ${
        active
          ? "bg-foreground font-medium text-background"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      <span className="ml-1 tabular-nums opacity-60">{fmtInt(count)}</span>
    </Link>
  );
}

function DecisionBadge({ wake }: { wake: WakeFeedEntry }) {
  if (wake.decision === "error") {
    return (
      <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
        σφάλμα
      </span>
    );
  }
  if (wake.decision === "send") {
    return (
      <span className="rounded bg-orange/10 px-1.5 py-0.5 text-[11px] font-medium text-orange">
        απάντησε{wake.messageCount > 1 ? ` ×${wake.messageCount}` : ""}
      </span>
    );
  }
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
      σιωπή
    </span>
  );
}

/** Repair nudges, token-ceiling cuts, missing finish — amber marks only
 *  when something needs a look; a healthy wake shows nothing. */
function HealthMarks({ wake }: { wake: WakeFeedEntry }) {
  const marks: string[] = [];
  if (wake.repairs > 0) marks.push(wake.repairs === 1 ? "1 nudge" : `${wake.repairs} nudges`);
  if (wake.truncated) marks.push("κομμένο");
  if (wake.finishWakeMissing) marks.push("χωρίς finish");
  if (marks.length === 0) return null;
  return (
    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
      {marks.join(" · ")}
    </span>
  );
}

export default async function WakesPage(props: {
  searchParams: Promise<{ decision?: string; event?: string }>;
}) {
  const searchParams = await props.searchParams;
  const filter: WakeFilter = {
    decision: parseDecisionFilter(searchParams.decision),
    event: parseEventFilter(searchParams.event),
  };
  const { entries, decisionCounts, eventCounts } = await listRecentWakes(filter);
  const eventTotal = eventCounts.reduce((a, r) => a + r.count, 0);
  // Only event types that exist (or the active one) get a chip — no noise
  // from types that arrive with PR 4.
  const eventChips: Array<{ key: EventFilter; label: string; count: number }> = [
    { key: "all" as const, label: "Όλα τα γεγονότα", count: eventTotal },
    ...eventCounts
      .filter((r) => r.count > 0 || r.eventType === filter.event)
      .map((r) => ({
        key: r.eventType as EventFilter,
        label: EVENT_LABELS[r.eventType] ?? r.eventType,
        count: r.count,
      })),
  ];

  return (
    <>
      <PageHeader title="Wakes">
        <nav className="flex items-center gap-0.5 rounded-md border p-0.5">
          {DECISION_FILTERS.map(({ key, label }) => (
            <FilterChip
              key={key}
              href={feedHref({ ...filter, decision: key })}
              active={key === filter.decision}
              label={label}
              count={decisionCounts[key]}
            />
          ))}
        </nav>
        {eventChips.length > 1 && (
          <nav className="flex items-center gap-0.5 rounded-md border p-0.5">
            {eventChips.map(({ key, label, count }) => (
              <FilterChip
                key={key}
                href={feedHref({ ...filter, event: key })}
                active={key === filter.event}
                label={label}
                count={count}
              />
            ))}
          </nav>
        )}
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {entries.length === 0 ? (
          <EmptyState icon={Activity}>
            {filter.decision === "all" && filter.event === "all"
              ? "Κανένα wake ακόμα. Εδώ κυλάει κάθε αφύπνιση του Νότη — γεγονός, απόφαση, σκεπτικό, κόστος — με σύνδεσμο στη συνομιλία της."
              : "Κανένα wake δεν ταιριάζει σε αυτά τα φίλτρα."}
          </EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Πότε</th>
                <th className="pb-2 pr-4 font-medium">Χρήστης</th>
                <th className="pb-2 pr-4 font-medium">Γεγονός</th>
                <th className="pb-2 pr-4 font-medium">Απόφαση</th>
                <th className="w-full pb-2 pr-4 font-medium">Σκεπτικό</th>
                <th className="pb-2 pr-4 text-right font-medium">Κόστος</th>
                <th className="pb-2 text-right font-medium">Διάρκεια</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((w) => (
                <tr key={w.id} className="border-b align-top hover:bg-muted/40">
                  <td
                    className="whitespace-nowrap py-2.5 pr-4 text-xs tabular-nums text-muted-foreground"
                    title={fmtDateTime(w.at)}
                  >
                    {fmtTimeAgo(w.at)}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4">
                    <Link
                      href={`/admin/conversations/${w.conversationId}`}
                      className="font-medium hover:underline"
                    >
                      {w.userName}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-xs text-muted-foreground">
                    {EVENT_LABELS[w.eventType] ?? w.eventType}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4">
                    <DecisionBadge wake={w} />
                  </td>
                  <td className="py-2.5 pr-4">
                    <Link href={`/admin/conversations/${w.conversationId}`} className="block">
                      <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {w.rationale}
                      </span>
                    </Link>
                    <div className="mt-1 empty:hidden">
                      <HealthMarks wake={w} />
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right text-xs tabular-nums">
                    ${w.costUsd.toFixed(3)}
                  </td>
                  <td className="whitespace-nowrap py-2.5 text-right text-xs tabular-nums">
                    {(w.durationMs / 1000).toFixed(1)}s
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
