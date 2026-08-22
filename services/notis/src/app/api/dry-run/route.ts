import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyOutcome, runWake } from "@/agent/runWake";
import { effortSchema, wakeEventSchema, wakeStateSchema } from "@/agent/schemas";
import { errorResponse, parseJsonBody } from "@/lib/api";
import { buildDeps } from "@/lib/deps";
import { requireAdmin } from "@/lib/session-auth";

export const maxDuration = 120;

/** State and event validate against the agent's canonical schemas; only the
 *  playground-specific options are described here. */
const requestSchema = z.object({
  state: wakeStateSchema,
  event: wakeEventSchema,
  options: z
    .object({
      promptOverride: z.string().optional(),
      contextPackOverride: z.string().optional(),
      model: z.string().optional(),
      maxTurns: z.number().int().optional(),
      effort: effortSchema.optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { data, error } = await parseJsonBody(request, requestSchema);
  if (error) return error;

  const { state, event, options } = data;
  const deps = buildDeps(options ?? {});

  try {
    const { outcome, trace } = await runWake(state, [event], deps);
    return NextResponse.json({
      outcome,
      trace,
      appliedState: applyOutcome(state, outcome),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
