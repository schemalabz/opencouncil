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
  // <current_time> is the event's time, not the wall clock: a wake is the
  // processing of an event at its moment. In production the two coincide;
  // under simulation only the event's clock tells the truth.
  const userTurn = assembleUserTurn(state, event, new Date(event.at));

  // The user turn (with its multi-thousand-token brief) gets its own cache
  // breakpoint: the MCP connector's server-side research loop makes several
  // internal passes per request, and without this each pass re-reads the
  // whole turn at full input rate. Default 5m TTL — it's only re-read within
  // this wake.
  const messages: unknown[] = [
    {
      role: "user",
      content: [{ type: "text", text: userTurn, cache_control: { type: "ephemeral" } }],
    },
  ];
  const turns: RecordedTurn[] = [];
  let usageTotal = emptyUsage();

  const sent: string[] = [];
  let profileRewrite: string | undefined;
  const scheduledWakes: Array<{ at: string; reason: string }> = [];
  let unsubscribe: { reason: string } | undefined;
  let rationale = "";
  let refused = false;
  let repaired = false;

  for (let turn = 0; turn < deps.config.maxTurns; turn++) {
    const response = await deps.anthropic.create({
      model: deps.config.model,
      max_tokens: MAX_TOKENS,
      system,
      messages,
      tools: buildTools(),
      mcp_servers: buildMcpServers(deps.config.mcpUrl),
      output_config: { effort: deps.config.effort },
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

    // end_turn: if the person wrote to us and the model produced neither a
    // send_message nor an unsubscribe, it has (observed repeatedly at low
    // effort) written its answer into the final text instead of the tool.
    // One bounded repair pass: make it either actually send or own the
    // silence. Never repairs proactive wakes — silence is their default.
    if (
      response.stop_reason === "end_turn" &&
      event.type === "user_message" &&
      sent.length === 0 &&
      !unsubscribe &&
      !repaired
    ) {
      repaired = true;
      messages.push({ role: "assistant", content: response.content });
      messages.push({
        role: "user",
        content:
          "(system check) Your final text above is an operator rationale — it was NOT " +
          "delivered to the person, and they asked you something directly. If you meant " +
          "to answer them, call send_message with the message now. If you truly intend " +
          "to stay silent, restate a one-sentence rationale for the silence.",
      });
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

  const journalAppend = buildJournalEntry(event, decision, rationale, sent);

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
