import { NextResponse } from "next/server";
import { env } from "@/env.mjs";

// Answer from the running process on each request, never from a copy made at
// build time.
export const dynamic = "force-dynamic";

/**
 * The health check of the App Platform component. `commit` is
 * `NEXT_PUBLIC_BUILD_COMMIT_SHA`, as on the main app's route, or null when the
 * deployment does not set it.
 */
export function GET() {
  return NextResponse.json(
    { ok: true, service: "notis", commit: env.NEXT_PUBLIC_BUILD_COMMIT_SHA || null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
