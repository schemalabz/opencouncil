import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasNotisDb, notisDb } from "@/lib/db";
import {
  PROACTIVE_MODE_KEY,
  PROACTIVE_PAUSED_KEY,
  getProactiveSettings,
  putSetting,
} from "@/lib/settings";
import { requireAdmin } from "@/lib/session-auth";

/** Read and flip the proactive rails: shadow/live mode and the kill switch. */

const putSchema = z.object({
  mode: z.enum(["shadow", "live"]).optional(),
  paused: z.boolean().optional(),
});

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!hasNotisDb()) return NextResponse.json({ error: "no database" }, { status: 503 });

  return NextResponse.json(await getProactiveSettings(notisDb()));
}

export async function PUT(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!hasNotisDb()) return NextResponse.json({ error: "no database" }, { status: 503 });

  const parsed = putSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const db = notisDb();
  if (parsed.data.mode !== undefined) await putSetting(db, PROACTIVE_MODE_KEY, parsed.data.mode);
  if (parsed.data.paused !== undefined) {
    await putSetting(db, PROACTIVE_PAUSED_KEY, parsed.data.paused);
  }
  return NextResponse.json(await getProactiveSettings(db));
}
