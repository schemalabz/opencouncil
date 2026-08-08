import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyOutcome, runWake } from "@/agent/runWake";
import { effortSchema, wakeEventSchema, wakeStateSchema } from "@/agent/schemas";
import { buildDeps } from "@/lib/deps";

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
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request", issues: parsed.error.issues }, { status: 400 });
  }

  const { state, event, options } = parsed.data;
  const deps = buildDeps(options ?? {});

  try {
    const { outcome, trace } = await runWake(state, event, deps);
    return NextResponse.json({
      outcome,
      trace,
      appliedState: applyOutcome(state, outcome),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "wake failed" },
      { status: 502 },
    );
  }
}
