import { NextRequest, NextResponse } from "next/server";
import { hasNotisDb, notisDb } from "@/lib/db";
import { hasMainDb, mainDb } from "@/lib/main-db";
import { requireService } from "@/lib/service-auth";
import { computeSubscriptionStats } from "@/lib/subscription-stats";

/**
 * The main app's signups page reads its Notis numbers here: active
 * subscribers per municipality, and the weekly starts and stops. Service-token
 * auth (requireService), like the rest of /api/subscriptions. Aggregates only;
 * no reader is named.
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
  return NextResponse.json(computeSubscriptionStats(subs, targets));
}
