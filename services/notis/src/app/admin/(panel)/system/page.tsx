import Link from "next/link";
import {
  AlarmClock,
  CalendarClock,
  ChevronRight,
  CircleDot,
  ExternalLink,
  FileSearch,
  Moon,
  OctagonAlert,
  Sun,
} from "lucide-react";
import { env } from "@/env.mjs";
import { EVENT_LABELS } from "../_lib/records";
import { getSystemSnapshot } from "../_lib/system";
import { AutoRefresh } from "../_components/AutoRefresh";
import { Countdown } from "../_components/Countdown";
import { PageHeader } from "../_components/PageHeader";
import { UserAvatar } from "../_components/UserAvatar";

export const metadata = { title: "Σύστημα · Νότης admin" };
export const dynamic = "force-dynamic";

/**
 * The machinery, live: poller heartbeat, the wake queue with per-item
 * deadlines, the agent's upcoming scheduled wakes, and the editorial
 * ledger. Aggregates first, worst first, capped lists — built to stay
 * readable at a thousand users.
 */

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtMeetingDate(iso: string): string {
  return new Intl.DateTimeFormat("el-GR", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
    timeZone: "Europe/Athens",
  }).format(new Date(iso));
}

function timeAgo(iso: string, now: Date): string {
  const s = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `πριν ${s}″`;
  if (s < 3600) return `πριν ${Math.floor(s / 60)}′`;
  if (s < 86_400) return `πριν ${Math.floor(s / 3600)}ω`;
  return `πριν ${Math.floor(s / 86_400)}ημ`;
}

const STATUS_DOT: Record<string, string> = {
  running: "bg-orange animate-pulse",
  pending: "bg-stone-400",
  failed: "bg-destructive",
};

const STATUS_LABEL: Record<string, string> = {
  running: "τρέχει",
  pending: "σε αναμονή",
  failed: "απέτυχε",
};

function LaneBadge({ lane }: { lane: "live" | "batch" }) {
  return (
    <span
      className={`inline-flex w-14 shrink-0 justify-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
        lane === "live" ? "bg-orange/10 text-orange" : "bg-muted text-muted-foreground"
      }`}
    >
      {lane}
    </span>
  );
}

function OriginBadge({ origin }: { origin: "reply" | "proactive" }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
        origin === "reply" ? "bg-sky-600/10 text-sky-700" : "bg-muted text-muted-foreground"
      }`}
    >
      {origin === "reply" ? "follow-up" : "προγραμματισμένο"}
    </span>
  );
}

const SCORE_DIMENSIONS = [
  ["hyperlocal", "Τ", "τοπικό"],
  ["citywide", "Π", "πόλη"],
  ["contention", "Ε", "ένταση"],
  ["novelty", "Ν", "νέο"],
  ["money", "Χ", "χρήμα"],
] as const;

/** A subject's five editorial scores as a bar profile: each dimension is a
 *  bar on a faint track with its initial beneath; the full name and value
 *  live in the hover tooltip. Profiles compare down the list, which is
 *  what the ranking is about. */
function ScoreBars({ scores }: { scores: Record<string, number> }) {
  return (
    <span className="flex items-end gap-1.5">
      {SCORE_DIMENSIONS.map(([key, letter, label]) => {
        const value = scores[key] ?? 0;
        return (
          <span
            key={key}
            className="group/bar relative flex cursor-default flex-col items-center gap-0.5"
          >
            <span className="pointer-events-none absolute -top-6 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background opacity-0 shadow-sm transition-opacity duration-100 group-hover/bar:opacity-100">
              {label} {value}/5
            </span>
            <span className="relative h-10 w-2 overflow-hidden rounded-sm bg-muted/60">
              {value > 0 && (
                <span
                  className={`absolute inset-x-0 bottom-0 rounded-sm ${
                    value >= 4 ? "bg-orange" : value >= 2 ? "bg-stone-400" : "bg-stone-300"
                  }`}
                  style={{ height: `${(value / 5) * 100}%` }}
                />
              )}
            </span>
            <span className="text-[9px] leading-none text-muted-foreground/70">{letter}</span>
          </span>
        );
      })}
    </span>
  );
}

export default async function SystemPage() {
  const snap = await getSystemSnapshot();
  const now = new Date(snap.now);
  const queueActive =
    (snap.queue.counts.pending ?? 0) + (snap.queue.counts.running ?? 0);

  return (
    <>
      <AutoRefresh />
      <PageHeader title="Σύστημα" />

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto grid max-w-5xl gap-4">
          {/* ---- heartbeat strip ---- */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <section className="rounded-lg border bg-background p-4">
              <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <AlarmClock className="h-3.5 w-3.5" /> Επόμενο tick poller
              </p>
              {snap.poller.nextTickAt ? (
                <div className="mt-2.5">
                  <Countdown
                    prefix="σε"
                    target={snap.poller.nextTickAt}
                    start={snap.poller.lastTickAt ?? undefined}
                    overdueLabel="τρέχει τώρα…"
                    className="w-full"
                  />
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    τελευταίο {timeAgo(snap.poller.lastTickAt!, now)} · κάθε 5′
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">κανένα tick ακόμη</p>
              )}
            </section>

            <section className="rounded-lg border bg-background p-4">
              <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                {snap.phase.kind === "active" ? (
                  <Sun className="h-3.5 w-3.5" />
                ) : (
                  <Moon className="h-3.5 w-3.5" />
                )}
                {snap.phase.kind === "active" ? "Ενεργές ώρες" : "Ώρες ησυχίας"}
              </p>
              <div className="mt-2.5">
                <Countdown
                  prefix={snap.phase.kind === "active" ? "ησυχία σε" : "απελευθέρωση σε"}
                  target={snap.phase.until}
                  start={snap.phase.since}
                  className="w-full"
                />
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {snap.phase.kind === "active"
                    ? "proactive αποστολές επιτρέπονται ως τις 23:00"
                    : `${snap.queue.heldUntilRelease} σε αναμονή ως τις 09:00`}
                </p>
              </div>
            </section>

            <section className="rounded-lg border bg-background p-4">
              <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <CircleDot className="h-3.5 w-3.5" /> Λειτουργία
              </p>
              <div className="mt-2 flex items-center gap-2">
                {snap.settings.paused ? (
                  <span className="flex items-center gap-1 rounded bg-destructive/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-destructive">
                    <OctagonAlert className="h-3 w-3" /> παύση
                  </span>
                ) : (
                  <span className="rounded bg-green-600/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-green-700">
                    ενεργό
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {snap.settings.paused
                  ? "proactive σε παύση — οι απαντήσεις συνεχίζουν"
                  : "πραγματικές αποστολές ενεργές"}
              </p>
            </section>

            <section className="rounded-lg border bg-background p-4">
              <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" /> Ουρά
              </p>
              <p className="mt-1.5 text-2xl font-semibold tabular-nums">{queueActive}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {snap.queue.counts.running ?? 0} τρέχουν · {snap.queue.counts.pending ?? 0} σε
                αναμονή
                {snap.queue.counts.failed ? (
                  <span className="text-destructive"> · {snap.queue.counts.failed} απέτυχαν</span>
                ) : null}
              </p>
            </section>
          </div>

          {/* ---- at-cap warning ---- */}
          {snap.atCap.length > 0 && (
            <section className="rounded-lg border border-amber-500/40 bg-background p-4">
              <p className="text-sm font-medium">Στο εβδομαδιαίο όριο</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Οι χρήστες αυτοί δεν λαμβάνουν άλλα αυθόρμητα μηνύματα μέχρι να κυλήσει η
                εβδομάδα· οι απαντήσεις δεν περιορίζονται.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {snap.atCap.map((u) => (
                  <Link
                    key={u.subscriptionId}
                    href={`/admin/conversations/${u.subscriptionId}`}
                    className="flex items-center gap-2 rounded-full border bg-muted/40 py-1 pl-1 pr-3 text-xs hover:bg-muted"
                  >
                    <UserAvatar seed={u.userId} size={20} />
                    {u.userName}
                    <span className="tabular-nums text-muted-foreground">{u.count}/3</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* ---- queue ---- */}
          <section className="rounded-lg border bg-background">
            <div className="flex items-baseline justify-between border-b px-4 py-3">
              <h2 className="text-sm font-medium">Ουρά wakes</h2>
              <p className="text-xs text-muted-foreground">
                ενεργά ανά lane: {snap.queue.laneCounts.live ?? 0} live ·{" "}
                {snap.queue.laneCounts.batch ?? 0} batch
                {snap.queue.more > 0 ? ` · +${snap.queue.more} ακόμη` : ""}
              </p>
            </div>
            {snap.queue.items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                Άδεια — κάθε εισερχόμενο και κάθε γεγονός συνεδρίασης περνά από εδώ.
              </p>
            ) : (
              <ul className="divide-y">
                {snap.queue.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[item.status] ?? "bg-muted"}`}
                    />
                    <LaneBadge lane={item.lane} />
                    <Link
                      href={`/admin/conversations/${item.subscriptionId}`}
                      className="flex w-56 shrink-0 items-center gap-2 hover:underline"
                    >
                      <UserAvatar seed={item.userId} size={22} />
                      <span className="truncate text-sm">{item.userName}</span>
                    </Link>
                    <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground sm:block">
                      {item.eventTypes
                        .map((t) => EVENT_LABELS[t as keyof typeof EVENT_LABELS] ?? t)
                        .join(" + ")}
                      {item.attempts > 1 ? ` · ${item.attempts}η προσπάθεια` : ""}
                      {item.status === "failed" && item.lastError ? (
                        <span className="text-destructive"> · {item.lastError}</span>
                      ) : null}
                    </span>
                    <span className="ml-auto w-28 shrink-0 text-right">
                      {item.status === "pending" ? (
                        <Countdown
                          prefix="σε"
                          target={item.runAfter}
                          start={item.createdAt}
                          overdueLabel="έτοιμο — στο επόμενο sweep"
                          className="w-full"
                        />
                      ) : item.status === "running" ? (
                        <span className="text-xs text-muted-foreground">
                          ξεκίνησε {item.claimedAt ? timeAgo(item.claimedAt, now) : "—"}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {STATUS_LABEL[item.status]}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---- scheduled ledger ---- */}
          <section className="rounded-lg border bg-background">
            <div className="flex items-baseline justify-between border-b px-4 py-3">
              <h2 className="text-sm font-medium">Τι σκοπεύει να κάνει</h2>
              <p className="text-xs text-muted-foreground">
                {snap.scheduled.total} προγραμματισμένα
              </p>
            </div>
            {snap.scheduled.items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                Τίποτα — όταν ο Νότης υπόσχεται να επανέλθει ή σημειώνει κάτι για αργότερα,
                εμφανίζεται εδώ.
              </p>
            ) : (
              <ul className="divide-y">
                {snap.scheduled.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Link
                      href={`/admin/conversations/${item.subscriptionId}`}
                      className="flex w-56 shrink-0 items-center gap-2 hover:underline"
                    >
                      <UserAvatar seed={item.userId} size={22} />
                      <span className="truncate text-sm">{item.userName}</span>
                    </Link>
                    <OriginBadge origin={item.origin} />
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      «{item.reason}»
                    </span>
                    <span className="ml-auto w-32 shrink-0 text-right">
                      <Countdown
                        prefix="σε"
                        target={item.firesAt}
                        start={item.createdAt}
                        overdueLabel="στο επόμενο tick"
                        className="w-full"
                      />
                      {item.firesAt !== item.runAfter && (
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">
                          κρατείται ως τις 09:00
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---- editorial ledger ---- */}
          <section className="rounded-lg border bg-background">
            <div className="flex items-baseline justify-between border-b px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <FileSearch className="h-4 w-4 text-muted-foreground" /> Συνεδριάσεις που διάβασε
              </h2>
              <p className="text-xs text-muted-foreground">{snap.digested.total} συνολικά</p>
            </div>
            {snap.digested.items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                Καμία ακόμη — κάθε ολοκληρωμένη συνεδρίαση περνά ένα editorial pass πριν
                ξυπνήσει συνδρομητές.
              </p>
            ) : (
              <ul className="divide-y">
                {snap.digested.items.map((item) => (
                  <li key={item.taskId}>
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 hover:bg-muted/30">
                        <ChevronRight
                          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform group-open:rotate-90 ${
                            item.brief ? "" : "invisible"
                          }`}
                        />
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                            item.type === "processAgenda"
                              ? "bg-sky-600/10 text-sky-700"
                              : "bg-orange/10 text-orange"
                          }`}
                        >
                          {item.type === "processAgenda" ? "ατζέντα" : "σύνοψη"}
                        </span>
                        <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {item.cityId}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">
                            {item.headline ?? (
                              <span className="text-muted-foreground">
                                χωρίς editorial pass — κανένας συνδρομητής
                              </span>
                            )}
                          </span>
                          {(item.adminBodyName || item.meetingDate || item.meetingName) && (
                            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                              {[
                                item.adminBodyName,
                                item.meetingDate ? fmtMeetingDate(item.meetingDate) : null,
                                item.meetingName,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          )}
                        </span>
                        <a
                          href={
                            item.brief?.meetingUrl ??
                            `${env.OPENCOUNCIL_BASE_URL}/${item.cityId}/${item.meetingId}`
                          }
                          target="_blank"
                          rel="noreferrer"
                          title="Άνοιγμα στο OpenCouncil"
                          className="shrink-0 text-muted-foreground/50 hover:text-orange"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {item.subjectCount !== null ? `${item.subjectCount} θέματα · ` : ""}
                          {item.wakes > 0 ? `${item.wakes} wakes · ` : ""}
                          {item.briefCostUsd ? `${fmtUsd(item.briefCostUsd)} · ` : ""}
                          {timeAgo(item.processedAt, now)}
                        </span>
                      </summary>
                      {item.brief && (
                        <div className="border-t bg-muted/20 pb-1 pt-0.5">
                          <ol className="divide-y divide-border/60">
                            {item.brief.subjects.map((s, rank) => (
                              <li
                                key={s.subjectId}
                                className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 px-4 py-2"
                              >
                                <span className="w-4 text-right text-[11px] tabular-nums text-muted-foreground/60">
                                  {rank + 1}
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate text-xs font-medium">
                                    {s.url ? (
                                      <a
                                        href={s.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="hover:text-orange hover:underline"
                                      >
                                        {s.name}
                                      </a>
                                    ) : (
                                      s.name
                                    )}
                                    {s.discussionSeconds > 0 && (
                                      <span className="ml-1.5 font-normal text-muted-foreground">
                                        {Math.round(s.discussionSeconds / 60)}′
                                      </span>
                                    )}
                                  </span>
                                  {s.note && (
                                    <span className="mt-0.5 block truncate text-[11px] leading-snug text-muted-foreground">
                                      {s.note}
                                    </span>
                                  )}
                                </span>
                                <ScoreBars scores={s.scores as unknown as Record<string, number>} />
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
