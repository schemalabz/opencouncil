import "server-only";
import { WakeOutcome } from "@/agent/types";
import { hasNotisDb, notisDb } from "@/lib/db";

/** The cross-user wake feed. Empty without NOTIS_DATABASE_URL. */

export interface WakeFeedEntry {
  id: string;
  at: string;
  userName: string;
  conversationId: string;
  eventType: string;
  decision: "send" | "silence" | "error";
  messageCount: number;
  costUsd: number;
  durationMs: number;
}

/** How many messages a wake produced. The column is Json and an `error`
 *  wake has no messages array at all, so this never assumes a shape: one
 *  malformed row must not take the whole feed down. */
function messageCount(outcome: unknown): number {
  const messages = (outcome as Partial<WakeOutcome> | null)?.messages;
  return Array.isArray(messages) ? messages.length : 0;
}

export async function listRecentWakes(): Promise<WakeFeedEntry[]> {
  if (!hasNotisDb()) return [];
  const wakes = await notisDb().notisWake.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    // An explicit select, NOT include: `include` leaves the parent's columns
    // untouched, which pulls `trace` — hundreds of KB per wake — for 200
    // rows to render eight scalars.
    select: {
      id: true,
      eventAt: true,
      subscriptionId: true,
      eventType: true,
      decision: true,
      outcome: true,
      costUsd: true,
      durationMs: true,
      subscription: { select: { userName: true } },
    },
  });
  return wakes.map((wake) => ({
    id: wake.id,
    at: wake.eventAt.toISOString(),
    userName: wake.subscription.userName ?? "—",
    conversationId: wake.subscriptionId,
    eventType: wake.eventType,
    decision: wake.decision,
    messageCount: messageCount(wake.outcome),
    costUsd: wake.costUsd,
    durationMs: wake.durationMs,
  }));
}
