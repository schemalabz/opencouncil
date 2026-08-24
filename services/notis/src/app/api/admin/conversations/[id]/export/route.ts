import { NextRequest, NextResponse } from "next/server";
import { hasNotisDb, notisDb } from "@/lib/db";
import { requireAdmin } from "@/lib/session-auth";
import { LIVE_QUEUE_STATUSES } from "@/lib/queue-core";

/**
 * Everything notis knows about one conversation, as a single JSON file — the
 * subscription, every message, every wake with its full trace, live queue
 * rows, and scheduled wakes. Built for offline evaluation: an operator
 * downloads it from the conversation view and hands it to a person or a
 * model to judge what the agent did and why. Raw rows on purpose — an
 * evaluation wants the stored truth, not the panel's view model.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!hasNotisDb()) {
    return NextResponse.json({ error: "no notis database" }, { status: 503 });
  }

  const { id } = await params;
  const db = notisDb();

  const subscription = await db.notisSubscription.findUnique({ where: { id } });
  if (!subscription) {
    return NextResponse.json({ error: "conversation not found" }, { status: 404 });
  }

  const [messages, wakes, queue, scheduledWakes, commitments] = await Promise.all([
    db.notisMessage.findMany({
      where: { subscriptionId: id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    // Traces are the evaluation payload but also the weight — each embeds
    // the full system prompt and every MCP turn. ?traces=0 exports the
    // light version for big conversations.
    request.nextUrl.searchParams.get("traces") === "0"
      ? db.notisWake.findMany({
          where: { subscriptionId: id },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            subscriptionId: true,
            eventType: true,
            eventAt: true,
            event: true,
            events: true,
            decision: true,
            rationale: true,
            outcome: true,
            deliveryMode: true,
            deliveryTemplate: true,
            repairs: true,
            truncated: true,
            finishWakeMissing: true,
            model: true,
            inputTokens: true,
            outputTokens: true,
            cacheReadTokens: true,
            cacheWriteTokens: true,
            cacheWrite1hTokens: true,
            costUsd: true,
            durationMs: true,
            createdAt: true,
          },
        })
      : db.notisWake.findMany({
          where: { subscriptionId: id },
          orderBy: { createdAt: "asc" },
        }),
    // Live rows only: done rows duplicate the wakes above, and failed rows
    // older than the janitor window are gone anyway.
    db.notisWakeQueue.findMany({
      where: { subscriptionId: id, status: { in: [...LIVE_QUEUE_STATUSES] } },
      orderBy: { createdAt: "asc" },
    }),
    db.notisScheduledWake.findMany({
      where: { subscriptionId: id },
      orderBy: { createdAt: "asc" },
    }),
    // A child table, so it does not ride along with the subscription row —
    // and the one piece of the agent's memory that never ages out.
    db.notisCommitment.findMany({
      where: { subscriptionId: id },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const body = {
    exportedAt: new Date().toISOString(),
    subscription,
    messages,
    wakes,
    queue,
    scheduledWakes,
    commitments,
  };

  const date = new Date().toISOString().slice(0, 10);
  // Compact on purpose: pretty-printing a trace-bearing export makes a
  // second, ~30% larger copy of tens of MB for a machine-consumed file.
  return new NextResponse(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="notis-conversation-${id}-${date}.json"`,
    },
  });
}
