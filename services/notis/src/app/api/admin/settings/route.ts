import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasNotisDb, notisDb } from "@/lib/db";
import { PROACTIVE_PAUSED_KEY, getProactiveSettings, putSetting } from "@/lib/settings";
import { requireAdmin } from "@/lib/session-auth";

/** Read and flip the kill switch — the single proactive on/off. */

const putSchema = z.object({ paused: z.boolean() });

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
  await putSetting(db, PROACTIVE_PAUSED_KEY, parsed.data.paused);
  return NextResponse.json(await getProactiveSettings(db));
}
