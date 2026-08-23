import "server-only";
import { WAKE_EVENT_TYPES } from "@/agent/schemas";
import { WakeOutcome } from "@/agent/types";
import { hasNotisDb, notisDb } from "@/lib/db";

/** The cross-user wake feed. Empty without NOTIS_DATABASE_URL. */

export type DecisionFilter = "all" | "send" | "silence" | "error";
export type EventFilter = "all" | (typeof WAKE_EVENT_TYPES)[number];

export function parseDecisionFilter(value: string | undefined): DecisionFilter {
  return value === "send" || value === "silence" || value === "error" ? value : "all";
}

export function parseEventFilter(value: string | undefined): EventFilter {
  return value && (WAKE_EVENT_TYPES as readonly string[]).includes(value)
    ? (value as EventFilter)
    : "all";
}

export interface WakeFilter {
  decision: DecisionFilter;
  event: EventFilter;
}

export interface WakeFeedEntry {
  id: string;
  at: string;
  userName: string;
  conversationId: string;
  eventType: string;
  decision: "send" | "silence" | "error";
  rationale: string;
  messageCount: number;
  /** Health marks: repair nudges fired, token-ceiling cut, missing finish. */
  repairs: number;
  truncated: boolean;
  finishWakeMissing: boolean;
  costUsd: number;
  durationMs: number;
}

/** How many messages a wake produced. The column is Json and an `error`
 *  wake has no messages array at all, so this never assumes a shape: one
 *  malformed row must not take the whole feed down.  */
function messageCount(outcome: unknown): number {
  const messages = (outcome as Partial<WakeOutcome> | null)?.messages;
  return Array.isArray(messages) ? messages.length : 0;
}

export interface WakeFeed {
  entries: WakeFeedEntry[];
  /** Chip counts, each cross-filtered by the OTHER active dimension. */
  decisionCounts: Record<DecisionFilter, number>;
  eventCounts: Array<{ eventType: string; count: number }>;
  total: number;
  page: number;
  pages: number;
}

export const WAKES_PAGE_SIZE = 100;

export async function listRecentWakes(filter: WakeFilter, page = 1): Promise<WakeFeed> {
  if (!hasNotisDb()) {
    return {
      entries: [],
      decisionCounts: { all: 0, send: 0, silence: 0, error: 0 },
      eventCounts: [],
      total: 0,
      page: 1,
      pages: 1,
    };
  }
  const db = notisDb();
  const decisionWhere = filter.decision === "all" ? {} : { decision: filter.decision };
  const eventWhere = filter.event === "all" ? {} : { eventType: filter.event };

  const [byDecision, byEvent] = await Promise.all([
    db.notisWake.groupBy({ by: ["decision"], where: eventWhere, _count: { _all: true } }),
    db.notisWake.groupBy({ by: ["eventType"], where: decisionWhere, _count: { _all: true } }),
  ]);
  const count = (d: string) => byDecision.find((r) => r.decision === d)?._count._all ?? 0;

  // The paging total for the active filter combination falls out of the
  // cross-filtered decision counts — no extra count query.
  const total =
    filter.decision === "all"
      ? count("send") + count("silence") + count("error")
      : count(filter.decision);
  const pages = Math.max(1, Math.ceil(total / WAKES_PAGE_SIZE));
  const current = Math.min(page, pages);

  const wakes = await db.notisWake.findMany({
    where: { ...decisionWhere, ...eventWhere },
    orderBy: { createdAt: "desc" },
    skip: (current - 1) * WAKES_PAGE_SIZE,
    take: WAKES_PAGE_SIZE,
    // Explicit select: without it every row drags its full trace/event/
    // usage Json along — hundreds of KB per wake, ×100 per page — to
    // render a dozen scalars. `outcome` stays: the feed needs its
    // message count.
    select: {
      id: true,
      subscriptionId: true,
      eventType: true,
      eventAt: true,
      decision: true,
      rationale: true,
      outcome: true,
      repairs: true,
      truncated: true,
      finishWakeMissing: true,
      costUsd: true,
      durationMs: true,
      subscription: { select: { userName: true } },
    },
  });
  return {
    entries: wakes.map((wake) => ({
      id: wake.id,
      at: wake.eventAt.toISOString(),
      userName: wake.subscription.userName ?? "—",
      conversationId: wake.subscriptionId,
      eventType: wake.eventType,
      decision: wake.decision,
      rationale: wake.rationale,
      messageCount: messageCount(wake.outcome),
      repairs: wake.repairs.length,
      truncated: wake.truncated,
      finishWakeMissing: wake.finishWakeMissing,
      costUsd: wake.costUsd,
      durationMs: wake.durationMs,
    })),
    decisionCounts: {
      all: count("send") + count("silence") + count("error"),
      send: count("send"),
      silence: count("silence"),
      error: count("error"),
    },
    eventCounts: byEvent
      .map((r) => ({ eventType: r.eventType, count: r._count._all }))
      .sort((a, b) => b.count - a.count),
    total,
    page: current,
    pages,
  };
}
