import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { editorialPass } from "@/agent/editorialPass";
import { buildDeps } from "@/lib/deps";

export const maxDuration = 120;

const requestSchema = z.object({
  cityId: z.string().min(1),
  meetingId: z.string().min(1),
  phase: z.enum(["agenda", "summary"]).default("summary"),
});

export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const { brief, usage, costUsd } = await editorialPass(
      parsed.data.cityId,
      parsed.data.meetingId,
      buildDeps(),
      parsed.data.phase,
    );
    return NextResponse.json({ brief, usage, costUsd });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "editorial pass failed" },
      { status: 502 },
    );
  }
}
