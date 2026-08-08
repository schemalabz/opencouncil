import { addUsage, emptyUsage, usageToCost } from "./pricing";
import { Deps, EditorialBrief, EditorialSubject, Usage } from "./types";

const TOP_SUBJECTS_FOR_DETAIL = 8;
const MAX_TOKENS = 8192;

interface McpMeetingSubject {
  id?: string;
  subjectId?: string;
  name?: string;
  topic?: { name?: string } | string | null;
  topicLabels?: string[];
  discussionSeconds?: number;
  description?: string | null;
}

interface McpMeeting {
  id?: string;
  name?: string;
  dateTime?: string;
  date?: string;
  subjects?: McpMeetingSubject[];
}

/** JSON schema for the model's structured output (scores + notes per subject). */
function briefSchema(subjectIds: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["headline", "subjects"],
    properties: {
      headline: { type: "string" },
      subjects: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["subjectId", "scores", "note", "locationHints"],
          properties: {
            subjectId: { type: "string", enum: subjectIds },
            scores: {
              type: "object",
              additionalProperties: false,
              required: ["hyperlocal", "citywide", "contention", "novelty", "money"],
              properties: {
                hyperlocal: { type: "integer" },
                citywide: { type: "integer" },
                contention: { type: "integer" },
                novelty: { type: "integer" },
                money: { type: "integer" },
              },
            },
            note: { type: "string" },
            locationHints: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  };
}

const clamp = (n: unknown): number => Math.max(0, Math.min(5, Math.round(Number(n) || 0)));

function subjectTopicLabels(s: McpMeetingSubject): string[] {
  if (Array.isArray(s.topicLabels)) return s.topicLabels;
  if (typeof s.topic === "string") return [s.topic];
  if (s.topic && typeof s.topic === "object" && s.topic.name) return [s.topic.name];
  return [];
}

/**
 * The shared per-meeting editorial pass: fetch the meeting record over MCP
 * (direct tools/call, no model mediation), then one non-agentic model call
 * with structured output to score every subject. Runs once per meeting;
 * per-user wakes read the resulting brief instead of 60 raw subjects.
 */
export async function editorialPass(
  cityId: string,
  meetingId: string,
  deps: Deps,
): Promise<{ brief: EditorialBrief; usage: Usage; costUsd: number }> {
  const raw = (await deps.mcp.call("get_meeting", { cityId, meetingId })) as
    | McpMeeting
    | { meeting?: McpMeeting };
  const meeting: McpMeeting = ("meeting" in raw && raw.meeting ? raw.meeting : raw) as McpMeeting;

  const subjects = (meeting.subjects ?? [])
    .map((s) => ({
      id: String(s.id ?? s.subjectId ?? ""),
      name: String(s.name ?? ""),
      topicLabels: subjectTopicLabels(s),
      discussionSeconds: Number(s.discussionSeconds ?? 0),
      description: s.description ?? null,
    }))
    .filter((s) => s.id)
    .sort((a, b) => b.discussionSeconds - a.discussionSeconds);

  // Enrich the most-discussed subjects with their full record.
  const detailed = new Map<string, unknown>();
  for (const s of subjects.slice(0, TOP_SUBJECTS_FOR_DETAIL)) {
    if (s.discussionSeconds <= 0) break;
    const detail = await deps.mcp.call("get_subject", { subjectId: s.id }).catch(() => null);
    if (detail) detailed.set(s.id, detail);
  }

  const modelInput = {
    meeting: { id: meetingId, cityId, name: meeting.name, date: meeting.dateTime ?? meeting.date },
    subjects: subjects.map((s) => ({
      subjectId: s.id,
      name: s.name,
      topicLabels: s.topicLabels,
      discussionSeconds: s.discussionSeconds,
      description: s.description,
      detail: detailed.get(s.id) ?? undefined,
    })),
  };

  const response = await deps.anthropic.create({
    model: deps.config.model,
    max_tokens: MAX_TOKENS,
    system: [{ type: "text", text: deps.prompts.editorial }],
    messages: [{ role: "user", content: JSON.stringify(modelInput) }],
    output_config: {
      effort: deps.config.effort,
      format: { type: "json_schema", schema: briefSchema(subjects.map((s) => s.id)) },
    },
  });

  const usage = addUsage(emptyUsage(), {
    input: response.usage.input_tokens ?? 0,
    output: response.usage.output_tokens ?? 0,
    cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
    cacheRead: response.usage.cache_read_input_tokens ?? 0,
  });

  const textBlock = response.content.find(
    (b): b is { type: "text"; text: string } =>
      typeof b === "object" && b !== null && (b as { type?: string }).type === "text",
  );
  if (!textBlock) {
    throw new Error(`editorialPass: model returned no text content (stop: ${response.stop_reason})`);
  }
  const parsed = JSON.parse(textBlock.text) as {
    headline: string;
    subjects: Array<{
      subjectId: string;
      scores: Record<string, unknown>;
      note: string;
      locationHints: string[];
    }>;
  };

  const bySubject = new Map(parsed.subjects.map((p) => [p.subjectId, p]));
  const briefSubjects: EditorialSubject[] = subjects.map((s) => {
    const p = bySubject.get(s.id);
    return {
      subjectId: s.id,
      name: s.name,
      topicLabels: s.topicLabels,
      discussionSeconds: s.discussionSeconds,
      scores: {
        hyperlocal: clamp(p?.scores.hyperlocal),
        citywide: clamp(p?.scores.citywide),
        contention: clamp(p?.scores.contention),
        novelty: clamp(p?.scores.novelty),
        money: clamp(p?.scores.money),
      },
      note: p?.note ?? "",
      locationHints: p?.locationHints ?? [],
    };
  });

  const brief: EditorialBrief = {
    cityId,
    meetingId,
    generatedAt: deps.now().toISOString(),
    headline: parsed.headline,
    subjects: briefSubjects,
  };

  return { brief, usage, costUsd: usageToCost(usage) };
}
