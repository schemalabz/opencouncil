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

  // Moving cache breakpoint: mark the newest appended tool_results message so
  // each follow-up turn re-reads the conversation so far from cache instead
  // of at full input price — MCP transcript results are the bulk of it. Only
  // the latest message carries the marker (requests allow at most 4
  // breakpoints: system, user turn, and this one).
  let lastMarked: { cache_control?: unknown } | undefined;
  const markLatest = (blocks: unknown[]) => {
    const last = blocks[blocks.length - 1] as { cache_control?: unknown } | undefined;
    if (!last) return;
    if (lastMarked) delete lastMarked.cache_control;
    last.cache_control = { type: "ephemeral" };
    lastMarked = last;
  };

  const sent: string[] = [];
  let profileRewrite: string | undefined;
  const scheduledWakes: Array<{ at: string; reason: string }> = [];
  let unsubscribe: { reason: string } | undefined;
  let rationale = "";
  let refused = false;
  let repaired = false;
  let finished = false;
  // Substantive prose written INSIDE a tool-calling turn — observed failure
  // mode: the model narrates part of its answer as a text block next to its
  // send_message calls, and that prose is never delivered.
  let strandedProse: string | undefined;
  // When a stranded-prose nudge fires, remember the genuine rationale of the
  // moment: if the nudged turn adds no new sends, the model's post-nudge
  // "rationale" is reliably meta chatter about the check itself.
  let preNudgeRationale: string | undefined;
  let sentAtNudge = -1;

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
          case "finish_wake":
            rationale = String(block.input.rationale ?? "") || rationale;
            finished = true;
            ack = "wake recorded";
            break;
          default:
            ack = "unknown tool";
        }
        results.push({ type: "tool_result", tool_use_id: block.id, content: ack });
      }
      if (text && text.length >= 80) {
        strandedProse = text;
      }

      // finish_wake ends the wake in the same turn as the sends — no extra
      // model pass — unless a repair is owed, in which case the nudge rides
      // along with the tool_results and the loop continues once.
      let nudge: string | undefined;
      if (finished && !repaired) {
        if (event.type === "user_message" && sent.length === 0 && !unsubscribe) {
          preNudgeRationale = rationale;
          sentAtNudge = sent.length;
          // When the answer sits stranded as prose, quote it back. Without the
          // quote the model rereads its own text above and concludes it already
          // answered ("message already sent") — observed failure.
          nudge = strandedProse
            ? "(system check) The person asked you something directly and NOTHING has " +
              "been delivered to them — they are still waiting. The text you wrote next " +
              "to your tool calls was NOT delivered; nothing reaches the person except " +
              "send_message content. The undelivered text was:\n«" +
              strandedProse.slice(0, 1200) +
              "»\nIf it was meant for them, send it now with send_message, then " +
              "finish_wake again with the wake's own rationale — about the reader and " +
              "this wake's decision, never about this check. If you truly intend to stay " +
              "silent, call finish_wake again to confirm."
            : "(system check) You finished the wake without sending anything, but the " +
              "person asked you something directly. Nothing has been delivered to them — " +
              "they are still waiting. If you meant to answer them, call send_message " +
              "with the message now, then finish_wake again with the wake's own " +
              "rationale — about the reader and this wake's decision, never about this " +
              "check. If you truly intend to stay silent, call finish_wake again to " +
              "confirm.";
        } else if (strandedProse) {
          preNudgeRationale = rationale;
          sentAtNudge = sent.length;
          nudge =
            "(system check) You wrote prose in the same turn as your tool calls. That " +
            "prose was NOT delivered — nothing reaches the person except send_message " +
            "content. The undelivered text was:\n«" +
            strandedProse.slice(0, 1200) +
            "»\nIf it was meant for the person, send it now with send_message, rephrased " +
            "so the conversation reads naturally, then finish_wake again. If it was only " +
            "reasoning, call finish_wake again with the wake's own rationale — about the " +
            "reader and this wake's decision, never about this check.";
        }
        if (nudge) {
          repaired = true;
          finished = false;
          strandedProse = undefined;
        }
      }

      messages.push({ role: "assistant", content: response.content });
      // A tool_use stop with no client tool calls happens when the turn holds
      // only server-side (MCP) blocks. There is nothing for us to answer —
      // an empty user message is an API error — so continue like pause_turn.
      if (results.length > 0 || nudge) {
        const content = nudge ? [...results, { type: "text", text: nudge }] : results;
        if (!finished) markLatest(content);
        messages.push({ role: "user", content });
      }
      if (finished) break;
      continue;
    }

    // end_turn: two observed low-effort failure modes get ONE bounded repair
    // pass between them, so a broken wake self-corrects instead of shipping.
    if (response.stop_reason === "end_turn" && !repaired) {
      // (a) The person wrote to us and the model produced neither a send nor
      // an unsubscribe: it wrote its answer into the final text instead of
      // the tool. Never fires on proactive wakes — silence is their default.
      if (event.type === "user_message" && sent.length === 0 && !unsubscribe) {
        repaired = true;
        messages.push({ role: "assistant", content: response.content });
        messages.push({
          role: "user",
          content:
            "(system check) Your final text above is an operator rationale — it was NOT " +
            "delivered to the person, and they asked you something directly; they are " +
            "still waiting. If you meant to answer them, call send_message with the " +
            "message now. Either way, end with the wake's own rationale — about the " +
            "reader and this wake's decision, never about this check.",
        });
        continue;
      }
      // (b) A tool-calling turn carried substantive prose next to its tool
      // calls: that prose was never delivered, and is often the missing half
      // of a multi-message answer.
      if (strandedProse) {
        preNudgeRationale = rationale;
        sentAtNudge = sent.length;
        repaired = true;
        messages.push({ role: "assistant", content: response.content });
        messages.push({
          role: "user",
          content:
            "(system check) In an earlier turn you wrote prose in the same turn as your " +
            "tool calls. That prose was NOT delivered — nothing reaches the person except " +
            "send_message content. The undelivered text was:\n«" +
            strandedProse.slice(0, 1200) +
            "»\nIf it was meant for the person, send it now with send_message, rephrased " +
            "if needed so the conversation still reads naturally. If it was only " +
            "reasoning, do not send it — give the wake's own rationale, about the reader " +
            "and this wake's decision, never about this check.",
        });
        strandedProse = undefined;
        continue;
      }
    }

    // end_turn, max_tokens, or anything else: stop.
    break;
  }

  if (preNudgeRationale && sent.length === sentAtNudge) {
    rationale = preNudgeRationale;
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
