import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env.mjs";

/**
 * The guard of every cron route: the caller sends `Bearer ${CRON_SECRET}`.
 * Returns the response that refuses the request, or null when it may run.
 * Without a configured secret no cron runs (503), so a missing variable never
 * opens the routes.
 */
export function cronAuthFailure(request: NextRequest): NextResponse | null {
    if (!env.CRON_SECRET) {
        return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
    }
    if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return null;
}
