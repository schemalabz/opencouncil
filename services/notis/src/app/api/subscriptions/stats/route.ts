import { NextRequest, NextResponse } from "next/server";
import { hasNotisDb, notisDb } from "@/lib/db";
import { hasMainDb, mainDb } from "@/lib/main-db";
import { requireService } from "@/lib/service-auth";
import { subscriptionRoster } from "@/lib/subscription-roster";

/**
 * The main app's signups page reads its phone numbers here: every subscription
 * Notis knows about, with the municipalities it fans out to and the dates it
 * started and stopped. The main app does the arithmetic, because it alone also
 * holds the email half. Service-token auth (requireService), like the rest of
 * /api/subscriptions.
 */
export async function GET(request: NextRequest) {
  const denied = requireService(request);
  if (denied) return denied;
  if (!hasNotisDb() || !hasMainDb()) return NextResponse.json({ error: "no database" }, { status: 503 });

  const [subs, targets] = await Promise.all([
    notisDb().notisSubscription.findMany({
      select: { userId: true, status: true, createdAt: true, unsubscribedAt: true },
    }),
    mainDb().fanoutTargetRow.findMany({ select: { userId: true, cityId: true } }),
  ]);
  return NextResponse.json({ subscribers: subscriptionRoster(subs, targets) });
}
