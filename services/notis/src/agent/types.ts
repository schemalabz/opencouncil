import { z } from "zod";
import {
  cityPreferenceSchema,
  conversationMessageSchema,
  editorialBriefSchema,
  editorialSubjectSchema,
  effortSchema,
  decisionEntrySchema,
  wakeEventSchema,
  wakeStateSchema,
} from "./schemas";

/**
 * Contracts for the Notis agent core. Everything in src/agent/ is pure over
 * `Deps`: no next/*, no env access, no direct network — the production shell,
 * the dry-run endpoint, the playground and the test suite all drive the same
 * code by injecting different Deps.
 *
 * Wire shapes (state, events, briefs, decisions) have ONE source of truth: the
 * zod schemas in ./schemas. The types below are derived from them.
 */

export type DecisionEntry = z.infer<typeof decisionEntrySchema>;
export type CityPreference = z.infer<typeof cityPreferenceSchema>;
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;
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
  /** Commitments the wake opened and closed; applied by the shell, which owns
   *  every side effect. Absent when the wake touched none. */
  commitments?: {
    record?: Array<{ slug: string; what: string }>;
    resolve?: string[];
  };
  unsubscribe?: { reason: string };
  /**
   * The wake errored AFTER at least one incremental delivery reached (or
   * may still reach) the reader. The loop was finalized instead of retried:
   * re-running the model after real delivery risks duplicate messages,
   * which is worse than a truncated answer.
   */
  partialDeliveryError?: string;
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
  /** The summariser that folds aged-out history into a reader's memory. */
  compaction: string;
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
  /**
   * Incremental delivery: hand each send_message to the reader the moment
   * the model emits it, instead of batching at wake persistence. The shell
   * injects this for reactive wakes only (someone is waiting; no rail
   * applies to a reply). Absent — playground, dry-run, batch lane — the
   * loop only records sends, exactly as before.
   *
   * `ok: false` means the text did not reach the reader NOW (the row may
   * still be swept later); the tool_result tells the model so it can react.
   * Once called at all, the wake becomes fail-forward: see
   * WakeOutcome.partialDeliveryError.
   */
  deliver?(text: string): Promise<{ ok: boolean; detail?: string }>;
  /**
   * Mid-run absorption: return (and consume) reader messages that arrived
   * AFTER this wake started, so the model answers the reader's CURRENT
   * request instead of a superseded one. The loop calls it at each turn
   * start and again before delivering a turn's sends; returned events are
   * injected into the conversation and become part of this wake. The shell
   * wires it for reactive wakes only, backed by consumePendingLiveEvents —
   * consuming closes the messages' own queued wakes, so one message never
   * draws two answers.
   */
  absorb?(): Promise<WakeEvent[]>;
  /**
   * Claim heartbeat, called once per model turn. Returns false when the
   * queue item's claim is no longer this worker's (stale reclaim) — the
   * loop must stop instead of racing the reclaimer's second run.
   */
  heartbeat?(): Promise<boolean>;
}

export const DEFAULT_CONFIG: DepsConfig = {
  // Sonnet 5: near-Opus quality on agentic work at ~40% of the cost and
  // noticeably lower latency — the right default for per-resident wakes.
  model: "claude-sonnet-5",
  maxTurns: 8,
  mcpUrl: "https://opencouncil.gr/mcp",
  effort: "low",
};

/** The most recent decision entries the prompt renders. */
export const DECISION_WINDOW = 30;
/** The most recent conversation turns the prompt renders. Messages outnumber
 *  wakes, so this window is wider than the decision log's. */
export const CONVERSATION_WINDOW = 40;

/** How much history past the watermark accumulates before compaction folds the
 *  excess. The gap above each window is what the summariser gets to read. */
export const COMPACT_WAKES_AT = 50;
export const COMPACT_MESSAGES_AT = 60;
/** Nothing younger than this is ever folded. Delivery statuses settle slowly
 *  and unevenly — Bird redelivers hours-old events and a read receipt can
 *  arrive long after the send — and the conversation only renders messages
 *  that reached the reader. Folding a row whose status has not settled would
 *  drop it from the summary AND from the window behind the watermark, losing
 *  it for good. */
export const COMPACT_SETTLE_MS = 12 * 60 * 60_000;
/** A summary that keeps growing is not a summary. */
export const MEMORY_MAX_CHARS = 4000;
