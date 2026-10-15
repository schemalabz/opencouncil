import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { closeSupportRequest } from "@/app/admin/(panel)/_lib/support-requests";
import { hasNotisDb } from "@/lib/db";
import { requireAdmin } from "@/lib/session-auth";

/** Close a support request after the team has contacted the reader. */

const patchSchema = z.object({ status: z.literal("closed") });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!hasNotisDb()) return NextResponse.json({ error: "no database" }, { status: 503 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { id } = await params;
  if (!(await closeSupportRequest(id))) {
    return NextResponse.json({ error: "no open support request with that id" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
