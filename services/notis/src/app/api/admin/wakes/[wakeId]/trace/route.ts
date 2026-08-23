import { NextRequest, NextResponse } from "next/server";
import { getWakeTrace } from "@/app/admin/(panel)/_lib/conversations";
import { requireAdmin } from "@/lib/session-auth";

/** One wake's full trace, fetched lazily by the conversation inspector. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ wakeId: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { wakeId } = await params;
  const trace = await getWakeTrace(wakeId);
  if (!trace) {
    return NextResponse.json({ error: "trace not found" }, { status: 404 });
  }
  return NextResponse.json({ trace });
}
