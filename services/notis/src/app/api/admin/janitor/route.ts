import { NextResponse } from "next/server";
import { runJanitor } from "@/lib/janitor";
import { requireAdmin } from "@/lib/session-auth";

/** Manual janitor trigger; the daily run lives in instrumentation.ts. */
export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;

  return NextResponse.json(await runJanitor());
}
