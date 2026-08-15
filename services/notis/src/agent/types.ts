import { z } from "zod";
import {
  cityPreferenceSchema,
  editorialBriefSchema,
  editorialSubjectSchema,
  effortSchema,
  journalEntrySchema,
  wakeEventSchema,
  wakeStateSchema,
} from "./schemas";

/**
 * Contracts for the Notis agent core. Everything in src/agent/ is pure over
 * `Deps`: no next/*, no env access, no direct network — the production shell,
 * the dry-run endpoint, the playground and the test suite all drive the same
 * code by injecting different Deps.
 *
 * Wire shapes (state, events, briefs, journal) have ONE source of truth: the
 * zod schemas in ./schemas. The types below are derived from them.
 */

export type JournalEntry = z.infer<typeof journalEntrySchema>;
export type CityPreference = z.infer<typeof cityPreferenceSchema>;
export type WakeState = z.infer<typeof wakeStateSchema>;
export type EditorialSubject = z.infer<typeof editorialSubjectSchema>;
export type EditorialBrief = z.infer<typeof editorialBriefSchema>;
export type WakeEvent = z.infer<typeof wakeEventSchema>;

export interface WakeOutcome {
  decision: "silence" | "send";
  /** Always present, including for silence and refusals. */
  rationale: string;
  messages: string[];
  /** Repair nudges that fired (kind per entry). Absent = healthy wake. */
  repairs?: string[];
  /** The final turn hit the max_tokens ceiling: this record is a cut, not a decision. */
  truncated?: true;
  /** The wake ended without the REQUIRED finish_wake call. */
  finishWakeMissing?: true;
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
  /** Total cache-write tokens across both TTLs. */
  cacheWrite: number;
  /** The 1h-TTL share of cacheWrite (bills at 2× vs 1.25×); absent = unknown split. */
  cacheWrite1h?: number;
  cacheRead: number;
}

/** One turn as recorded for the trace and for golden replays. */
export interface RecordedTurn {
  content: unknown[]; // raw content blocks (text, tool_use, mcp_tool_use, mcp_tool_result, ...)
  stopReason: string;
  usage: Usage;
  /**
   * "injected" marks harness turns (repair nudges) recorded for the trace —
   * a rescued wake must be distinguishable from a healthy one. Replay skips
   * them; absent means a model turn.
   */
  role?: "injected";
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
    /** TTL-split cache writes (the SDK reports both; billing rates differ 1.25× vs 2×). */
    cache_creation?: {
      ephemeral_5m_input_tokens?: number | null;
      ephemeral_1h_input_tokens?: number | null;
    } | null;
  };
}

export interface ModelRequest {
  model: string;
  max_tokens: number;
  system: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral"; ttl?: "5m" | "1h" } }>;
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

export type Effort = z.infer<typeof effortSchema>;

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
