/**
 * Contracts for the Notis agent core. Everything in src/agent/ is pure over
 * `Deps`: no next/*, no env access, no direct network — the production shell,
 * the dry-run endpoint, the playground and the test suite all drive the same
 * code by injecting different Deps.
 */

export interface JournalEntry {
  at: string; // ISO timestamp, from deps.now() at wake time
  /** The wake trigger — or "enrollment" for the system-sent intro/transition template. */
  event: WakeEvent["type"] | "enrollment";
  decision: "silence" | "send";
  rationale: string;
  messages: string[]; // texts sent (empty on silence)
  /** What the user wrote, verbatim, on user_message wakes — the journal IS the conversation memory. */
  received?: string;
}

export interface CityPreference {
  cityId: string;
  cityName: string;
  topics: string[]; // Greek topic labels, as MCP search accepts them
  locations: string[]; // free-text streets/neighbourhoods
}

export interface WakeState {
  user: {
    name: string;
    cities: CityPreference[];
  };
  /** Free-text taste profile. Model-owned: rewritten wholesale via update_taste_profile. */
  profile: string;
  /** Append-only, oldest first. The prompt receives the most recent JOURNAL_WINDOW entries. */
  journal: JournalEntry[];
}

export interface EditorialSubject {
  subjectId: string;
  name: string;
  topicLabels: string[];
  discussionSeconds: number;
  scores: {
    hyperlocal: number; // 0-5
    citywide: number;
    contention: number;
    novelty: number;
    money: number;
  };
  note: string; // one Greek line: why this score profile
  locationHints: string[]; // streets/squares/neighbourhoods named in the record
}

export interface EditorialBrief {
  cityId: string;
  meetingId: string;
  generatedAt: string;
  headline: string; // 1-2 Greek sentences: what mattered in this meeting
  subjects: EditorialSubject[];
}

export type WakeEvent =
  | {
      type: "agenda_processed";
      at: string;
      cityId: string;
      meetingId: string;
      meetingName: string;
      meetingDate: string;
      brief: EditorialBrief;
    }
  | {
      type: "meeting_summarized";
      at: string;
      cityId: string;
      meetingId: string;
      meetingName: string;
      meetingDate: string;
      brief: EditorialBrief;
    }
  | { type: "user_message"; at: string; text: string }
  | { type: "scheduled"; at: string; reason: string }
  | { type: "heartbeat"; at: string };

export interface WakeOutcome {
  decision: "silence" | "send";
  /** Always present, including for silence and refusals. */
  rationale: string;
  messages: string[];
  /** Present iff the model called update_taste_profile (last call wins). */
  profileRewrite?: string;
  scheduledWakes: Array<{ at: string; reason: string }>;
  unsubscribe?: { reason: string };
  /** Built deterministically by the core (journal.ts), never by the model. */
  journalAppend: JournalEntry;
}

export interface Usage {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

/** One assistant turn as recorded for the trace and for golden replays. */
export interface RecordedTurn {
  content: unknown[]; // raw content blocks (text, tool_use, mcp_tool_use, mcp_tool_result, ...)
  stopReason: string;
  usage: Usage;
}

export interface WakeTrace {
  system: Array<{ text: string; cached: boolean }>;
  userTurn: string;
  turns: RecordedTurn[];
  usageTotal: Usage;
  costUsd: number;
  durationMs: number;
}

/* ------------------------------------------------------------------ */
/* Minimal structural types for the content blocks the core handles.   */

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export function isTextBlock(b: unknown): b is TextBlock {
  return typeof b === "object" && b !== null && (b as { type?: string }).type === "text";
}

export function isToolUseBlock(b: unknown): b is ToolUseBlock {
  return typeof b === "object" && b !== null && (b as { type?: string }).type === "tool_use";
}

/* ------------------------------------------------------------------ */
/* Injected dependencies.                                              */

export interface ModelResponse {
  content: unknown[];
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  };
}

export interface ModelRequest {
  model: string;
  max_tokens: number;
  system: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }>;
  messages: unknown[];
  tools?: unknown[];
  mcp_servers?: unknown[];
  output_config?: unknown;
}

/** The minimal Anthropic surface the core needs — trivially fakeable. */
export interface AnthropicLike {
  create(params: ModelRequest): Promise<ModelResponse>;
}

export interface McpLike {
  call(tool: string, args: Record<string, unknown>): Promise<unknown>;
}

export interface Prompts {
  system: string;
  contextPack: string;
  editorial: string;
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface DepsConfig {
  model: string;
  maxTurns: number;
  mcpUrl: string;
  /** Sonnet 5 punches well above its weight at low effort — the cost lever for wakes. */
  effort: Effort;
}

export interface Deps {
  anthropic: AnthropicLike;
  now(): Date;
  prompts: Prompts;
  config: DepsConfig;
  mcp: McpLike;
}

export const DEFAULT_CONFIG: DepsConfig = {
  // Sonnet 5: near-Opus quality on agentic work at ~40% of the cost and
  // noticeably lower latency — the right default for per-resident wakes.
  model: "claude-sonnet-5",
  maxTurns: 8,
  mcpUrl: "https://opencouncil.gr/mcp",
  effort: "low",
};

export const JOURNAL_WINDOW = 30;
