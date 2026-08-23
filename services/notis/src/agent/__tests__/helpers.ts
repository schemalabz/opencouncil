import {
  AnthropicLike,
  Deps,
  EditorialBrief,
  ModelRequest,
  ModelResponse,
  WakeEvent,
  WakeState,
} from "../types";

export const FIXED_NOW = new Date("2026-03-10T10:00:00.000Z");

export function makeState(overrides: Partial<WakeState> = {}): WakeState {
  return {
    user: {
      name: "Μαρία",
      cities: [
        {
          cityId: "athens",
          cityName: "Αθήνα",
          topics: ["Πολεοδομία", "Συγκοινωνίες"],
          locations: ["Κυψέλη"],
        },
      ],
    },
    profile: "Μένει στην Κυψέλη. Ενδιαφέρεται για αναπλάσεις και πάρκινγκ.",
    conversation: [],
    decisions: [],
    ...overrides,
  };
}

export function makeBrief(overrides: Partial<EditorialBrief> = {}): EditorialBrief {
  return {
    cityId: "athens",
    meetingId: "m1",
    generatedAt: FIXED_NOW.toISOString(),
    headline: "Πέρασε η ανάπλαση της πλατείας Κυψέλης.",
    subjects: [
      {
        subjectId: "s1",
        name: "Ανάπλαση πλατείας Κυψέλης",
        topicLabels: ["Πολεοδομία"],
        discussionSeconds: 1800,
        scores: { hyperlocal: 5, citywide: 2, contention: 1, novelty: 4, money: 4 },
        note: "Ομόφωνη έγκριση, 2,3 εκατ.",
        locationHints: ["Κυψέλη"],
      },
    ],
    ...overrides,
  };
}

export function meetingEvent(overrides: Partial<Extract<WakeEvent, { type: "meeting_summarized" }>> = {}): WakeEvent {
  return {
    type: "meeting_summarized",
    at: FIXED_NOW.toISOString(),
    cityId: "athens",
    meetingId: "m1",
    meetingName: "Συνεδρίαση ΔΣ Αθήνας",
    meetingDate: "2026-03-09",
    brief: makeBrief(),
    ...overrides,
  };
}

export interface ScriptedTurn {
  content: unknown[];
  stop_reason: string;
}

/** Scripted AnthropicLike: serves the given turns, records every request. */
export class FakeAnthropic implements AnthropicLike {
  public requests: ModelRequest[] = [];
  private cursor = 0;

  constructor(private turns: ScriptedTurn[]) {}

  async create(params: ModelRequest): Promise<ModelResponse> {
    this.requests.push(params);
    const turn = this.turns[this.cursor];
    if (!turn) throw new Error(`FakeAnthropic exhausted after ${this.turns.length} turns`);
    this.cursor++;
    return {
      content: turn.content,
      stop_reason: turn.stop_reason,
      usage: { input_tokens: 1000, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    };
  }
}

export function makeDeps(anthropic: AnthropicLike, overrides: Partial<Deps> = {}): Deps {
  return {
    anthropic,
    now: () => FIXED_NOW,
    prompts: {
      system: "SYSTEM PROMPT",
      contextPack: "CONTEXT PACK",
      editorial: "EDITORIAL PROMPT",
    },
    config: { model: "claude-sonnet-5", maxTurns: 8, mcpUrl: "https://example.test/mcp", effort: "low" as const },
    mcp: { call: async () => null },
    ...overrides,
  };
}

export const text = (t: string) => ({ type: "text", text: t });
export const toolUse = (id: string, name: string, input: Record<string, unknown>) => ({
  type: "tool_use",
  id,
  name,
  input,
});
