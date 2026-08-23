import { NextRequest, NextResponse } from "next/server";
import { hasNotisDb, notisDb } from "@/lib/db";
import { requireAdmin } from "@/lib/session-auth";

/**
 * Everything notis knows about one conversation, as a single JSON file — the
 * subscription, every message, every wake with its full trace, live queue
 * rows, and scheduled wakes. Built for offline evaluation: an operator
 * downloads it from the conversation view and hands it to a person or a
 * model to judge what the agent did and why. Raw rows on purpose — an
 * evaluation wants the stored truth, not the panel's view model.
 */
export async function GET(
  _request: NextRequest,
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

  const [messages, wakes, queue, scheduledWakes] = await Promise.all([
    db.notisMessage.findMany({
      where: { subscriptionId: id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    db.notisWake.findMany({
      where: { subscriptionId: id },
      orderBy: { createdAt: "asc" },
    }),
    // Live rows only: done rows duplicate the wakes above, and failed rows
    // older than the janitor window are gone anyway.
    db.notisWakeQueue.findMany({
      where: { subscriptionId: id, status: { in: ["pending", "running", "failed"] } },
      orderBy: { createdAt: "asc" },
    }),
    db.notisScheduledWake.findMany({
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
  };

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="notis-conversation-${id}-${date}.json"`,
    },
  });
}
