import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasNotisDb, notisDb } from "@/lib/db";
import { requeueFailedWakes } from "@/lib/requeue";
import { requireAdmin } from "@/lib/session-auth";

/**
 * Operator retry for terminally failed wakes: the way back after an outage
 * that burned every attempt. It re-opens failed rows only, inside the window
 * the caller names, and the next poller tick drains them.
 */

export const maxDuration = 60;

/** A week is the whole failure history the panel keeps; past that the
 *  events are stale news even if the row survives. */
const bodySchema = z.object({ hours: z.number().int().min(1).max(168) });

export async function POST(request: NextRequest) {
    const denied = await requireAdmin();
    if (denied) return denied;
    if (!hasNotisDb()) {
        return NextResponse.json({ error: "no notis database" }, { status: 503 });
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: "hours must be a whole number, 1 to 168" }, { status: 400 });
    }

    const since = new Date(Date.now() - parsed.data.hours * 60 * 60_000);
    return NextResponse.json(await requeueFailedWakes(notisDb(), { since }));
}
