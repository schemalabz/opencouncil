import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyOutcome, runWake } from "@/agent/runWake";
import { WakeEvent, WakeState } from "@/agent/types";
import { buildDeps } from "@/lib/deps";

export const maxDuration = 120;

const journalEntrySchema = z.object({
  at: z.string(),
  event: z.enum(["agenda_processed", "meeting_summarized", "user_message", "scheduled", "heartbeat"]),
  decision: z.enum(["silence", "send"]),
  rationale: z.string(),
  messages: z.array(z.string()),
});

const stateSchema = z.object({
  user: z.object({
    name: z.string(),
    cities: z.array(
      z.object({
        cityId: z.string(),
        cityName: z.string(),
        topics: z.array(z.string()),
        locations: z.array(z.string()),
      }),
    ),
  }),
  profile: z.string(),
  journal: z.array(journalEntrySchema),
});

const briefSchema = z.object({
  cityId: z.string(),
  meetingId: z.string(),
  generatedAt: z.string(),
  headline: z.string(),
  subjects: z.array(
    z.object({
      subjectId: z.string(),
      name: z.string(),
      topicLabels: z.array(z.string()),
      discussionSeconds: z.number(),
      scores: z.object({
        hyperlocal: z.number(),
        citywide: z.number(),
        contention: z.number(),
        novelty: z.number(),
        money: z.number(),
      }),
      note: z.string(),
      locationHints: z.array(z.string()),
    }),
  ),
});

const meetingEventFields = {
  at: z.string(),
  cityId: z.string(),
  meetingId: z.string(),
  meetingName: z.string(),
  meetingDate: z.string(),
  brief: briefSchema,
};

const eventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("agenda_processed"), ...meetingEventFields }),
  z.object({ type: z.literal("meeting_summarized"), ...meetingEventFields }),
  z.object({ type: z.literal("user_message"), at: z.string(), text: z.string() }),
  z.object({ type: z.literal("scheduled"), at: z.string(), reason: z.string() }),
  z.object({ type: z.literal("heartbeat"), at: z.string() }),
]);

const requestSchema = z.object({
  state: stateSchema,
  event: eventSchema,
  options: z
    .object({
      promptOverride: z.string().optional(),
      contextPackOverride: z.string().optional(),
      model: z.string().optional(),
      maxTurns: z.number().int().optional(),
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
    const { outcome, trace } = await runWake(state as WakeState, event as WakeEvent, deps);
    return NextResponse.json({
      outcome,
      trace,
      appliedState: applyOutcome(state as WakeState, outcome),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "wake failed" },
      { status: 502 },
    );
  }
}
