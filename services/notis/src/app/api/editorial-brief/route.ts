import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { editorialPass } from "@/agent/editorialPass";
import { errorResponse, parseJsonBody } from "@/lib/api";
import { buildDeps } from "@/lib/deps";
import { requireAdmin } from "@/lib/session-auth";

export const maxDuration = 120;

const requestSchema = z.object({
  cityId: z.string().min(1),
  meetingId: z.string().min(1),
  phase: z.enum(["agenda", "summary"]).default("summary"),
});

export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { data, error } = await parseJsonBody(request, requestSchema);
  if (error) return error;

  try {
    const { brief, usage, costUsd } = await editorialPass(
      data.cityId,
      data.meetingId,
      buildDeps(),
      data.phase,
    );
    return NextResponse.json({ brief, usage, costUsd });
  } catch (e) {
    return errorResponse(e);
  }
}
