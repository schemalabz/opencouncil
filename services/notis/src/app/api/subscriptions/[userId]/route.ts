import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasNotisDb, notisDb } from "@/lib/db";
import { hasMainDb, mainDb } from "@/lib/main-db";
import { requireService } from "@/lib/service-auth";
import { readSubscription, setSubscriptionStatus } from "@/lib/subscriptions-api";

/**
 * The main app's view of one reader's subscription, behind the profile
 * switch. Service-token auth (requireService), never the session cookie:
 * the main app calls this server-side on the reader's behalf. GET reads;
 * PATCH asks for a state and reports what the row is now.
 */

const patchSchema = z.object({ status: z.enum(["active", "unsubscribed"]) });

type Context = { params: Promise<{ userId: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const denied = requireService(request);
  if (denied) return denied;
  if (!hasNotisDb()) return NextResponse.json({ error: "no database" }, { status: 503 });

  const { userId } = await params;
  return NextResponse.json({ subscription: await readSubscription(notisDb(), userId) });
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const denied = requireService(request);
  if (denied) return denied;
  if (!hasNotisDb()) return NextResponse.json({ error: "no database" }, { status: 503 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { userId } = await params;
  const result = await setSubscriptionStatus(
    notisDb(),
    hasMainDb() ? mainDb() : null,
    userId,
    parsed.data.status,
  );
  if (result.kind === "rejected") {
    return NextResponse.json({ error: result.code }, { status: result.status });
  }
  return NextResponse.json({ subscription: result.subscription, ...(result.next ? { next: result.next } : {}) });
}
