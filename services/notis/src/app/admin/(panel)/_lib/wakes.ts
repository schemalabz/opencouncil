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

export async function listRecentWakes(): Promise<WakeFeedEntry[]> {
  if (!hasNotisDb()) return [];
  const wakes = await notisDb().notisWake.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { subscription: { select: { userName: true } } },
  });
  return wakes.map((wake) => ({
    id: wake.id,
    at: wake.eventAt.toISOString(),
    userName: wake.subscription.userName ?? "—",
    conversationId: wake.subscriptionId,
    eventType: wake.eventType,
    decision: wake.decision,
    messageCount: (wake.outcome as unknown as WakeOutcome).messages.length,
    costUsd: wake.costUsd,
    durationMs: wake.durationMs,
  }));
}
