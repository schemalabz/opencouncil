import { buildJournalEntry } from "./journal";
import { addUsage, emptyUsage, usageToCost } from "./pricing";
import { assembleSystem, assembleUserTurn } from "./prompt";
import { buildMcpServers, buildTools } from "./tools";
import {
  Deps,
  ModelResponse,
  RecordedTurn,
  Usage,
  WakeEvent,
  WakeOutcome,
  WakeState,
  WakeTrace,
  isTextBlock,
  isToolUseBlock,
} from "./types";

const MAX_TOKENS = 16000;

function normalizeUsage(u: ModelResponse["usage"]): Usage {
  return {
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
  };
}

function textOf(content: unknown[]): string {
  return content
    .filter(isTextBlock)
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/**
 * One agent invocation: (state, event, deps) → outcome + trace.
 *
 * Pure over Deps: never mutates `state`, performs no side effects — client
 * tool calls are recorded into the outcome and answered with synthetic
 * tool_results; MCP research runs server-side inside the API call.
 */
export async function runWake(
  state: WakeState,
  event: WakeEvent,
  deps: Deps,
): Promise<{ outcome: WakeOutcome; trace: WakeTrace }> {
  const started = deps.now().getTime();
  const system = assembleSystem(deps.prompts);
  const userTurn = assembleUserTurn(state, event, deps.now());

  const messages: unknown[] = [{ role: "user", content: userTurn }];
  const turns: RecordedTurn[] = [];
  let usageTotal = emptyUsage();

  const sent: string[] = [];
  let profileRewrite: string | undefined;
  const scheduledWakes: Array<{ at: string; reason: string }> = [];
  let unsubscribe: { reason: string } | undefined;
  let rationale = "";
  let refused = false;

  for (let turn = 0; turn < deps.config.maxTurns; turn++) {
    const response = await deps.anthropic.create({
      model: deps.config.model,
      max_tokens: MAX_TOKENS,
      system,
      messages,
      tools: buildTools(),
      mcp_servers: buildMcpServers(deps.config.mcpUrl),
    });

    const usage = normalizeUsage(response.usage);
    usageTotal = addUsage(usageTotal, usage);
    turns.push({ content: response.content, stopReason: response.stop_reason ?? "unknown", usage });

    const text = textOf(response.content);
    if (text) rationale = text;

    if (response.stop_reason === "refusal") {
      refused = true;
      break;
    }

    if (response.stop_reason === "pause_turn") {
      // Server-side (MCP) loop paused mid-turn; append and continue as-is.
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    if (response.stop_reason === "tool_use") {
      const results: unknown[] = [];
      for (const block of response.content) {
        if (!isToolUseBlock(block)) continue;
        let ack = "noted";
        switch (block.name) {
          case "send_message": {
            const t = String(block.input.text ?? "");
            if (t) sent.push(t);
            ack = "delivered";
            break;
          }
          case "update_taste_profile":
            profileRewrite = String(block.input.profile ?? "");
            break;
          case "schedule_wakeup":
            scheduledWakes.push({
              at: String(block.input.at ?? ""),
              reason: String(block.input.reason ?? ""),
            });
            break;
          case "unsubscribe_user":
            unsubscribe = { reason: String(block.input.reason ?? "") };
            break;
          default:
            ack = "unknown tool";
        }
        results.push({ type: "tool_result", tool_use_id: block.id, content: ack });
      }
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: results });
      continue;
    }

    // end_turn, max_tokens, or anything else: stop.
    break;
  }

  const decision: "silence" | "send" = sent.length > 0 ? "send" : "silence";
  if (refused) {
    rationale = rationale || "refusal: the model declined to act on this wake.";
  }
  if (!rationale) {
    rationale = "(no rationale emitted)";
  }

  const journalAppend = buildJournalEntry(event, decision, rationale, sent, deps.now());

  const outcome: WakeOutcome = {
    decision,
    rationale,
    messages: sent,
    ...(profileRewrite !== undefined ? { profileRewrite } : {}),
    scheduledWakes,
    ...(unsubscribe ? { unsubscribe } : {}),
    journalAppend,
  };

  const trace: WakeTrace = {
    system: system.map((s) => ({ text: s.text, cached: Boolean(s.cache_control) })),
    userTurn,
    turns,
    usageTotal,
    costUsd: usageToCost(usageTotal),
    durationMs: deps.now().getTime() - started,
  };

  return { outcome, trace };
}

/** Apply an outcome to a state, returning the next state. Callers own persistence. */
export function applyOutcome(state: WakeState, outcome: WakeOutcome): WakeState {
  return {
    ...state,
    profile: outcome.profileRewrite !== undefined ? outcome.profileRewrite : state.profile,
    journal: [...state.journal, outcome.journalAppend],
  };
}
