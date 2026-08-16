import { WakeOutcome } from "@/agent/types";
import { hasNotisDb, notisDb } from "@/lib/db";

/** The cross-user wake feed. Empty without NOTIS_DATABASE_URL. */

export type DecisionFilter = "all" | "send" | "silence" | "error";

export function parseDecisionFilter(value: string | undefined): DecisionFilter {
  return value === "send" || value === "silence" || value === "error" ? value : "all";
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
  /** Decision counts over the same window, for the filter chips. */
  counts: Record<"all" | "send" | "silence" | "error", number>;
}

const FEED_LIMIT = 200;

export async function listRecentWakes(filter: DecisionFilter = "all"): Promise<WakeFeed> {
  if (!hasNotisDb()) {
    return { entries: [], counts: { all: 0, send: 0, silence: 0, error: 0 } };
  }
  const db = notisDb();
  const [wakes, decisionCounts] = await Promise.all([
    db.notisWake.findMany({
      where: filter === "all" ? undefined : { decision: filter },
      orderBy: { createdAt: "desc" },
      take: FEED_LIMIT,
      // An explicit select, NOT include: `include` leaves the parent's
      // columns untouched, which pulls `trace` — hundreds of KB per wake —
      // for 200 rows to render a dozen scalars.
      select: {
        id: true,
        eventAt: true,
        subscriptionId: true,
        eventType: true,
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
    }),
    db.notisWake.groupBy({ by: ["decision"], _count: { _all: true } }),
  ]);

  const count = (d: string) =>
    decisionCounts.find((r) => r.decision === d)?._count._all ?? 0;
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
    counts: {
      all: count("send") + count("silence") + count("error"),
      send: count("send"),
      silence: count("silence"),
      error: count("error"),
    },
  };
}
