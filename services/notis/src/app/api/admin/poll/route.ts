import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runPollerTick } from "@/lib/poller";
import { requireAdmin } from "@/lib/session-auth";

/** Manual poller trigger; the five-minute loop lives in instrumentation.ts.
 *  {"seedOnly": true} marks the meeting-event backlog consumed without
 *  waking anyone — the quiet-start option. */

export const maxDuration = 300;

const bodySchema = z.object({ seedOnly: z.boolean().optional() }).default({});

export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = bodySchema.parse(await request.json().catch(() => ({})));
  return NextResponse.json(await runPollerTick({}, body));
}
