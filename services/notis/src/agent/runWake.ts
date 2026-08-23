import { buildDecisionEntry } from "./decisions";
import { addUsage, emptyUsage, normalizeUsage, usageToCost } from "./pricing";
import { assembleSystem, assembleUserTurn, neutralizeFences } from "./prompt";
import { buildMcpServers, buildTools } from "./tools";
import {
  Deps,
  RecordedTurn,
  WakeEvent,
  WakeOutcome,
  WakeState,
  WakeTrace,
  isTextBlock,
  isToolUseBlock,
} from "./types";

const MAX_TOKENS = 16000;

function textOf(content: unknown[]): string {
  return content
    .filter(isTextBlock)
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/**
 * One agent invocation: (state, events, deps) → outcome + trace.
 *
 * Usually one event; a coalesced batch wake carries several (sorted here by
 * time, defensively), all consumed in a single invocation so the reader gets
 * one considered response instead of a burst.
 *
 * Pure over Deps: never mutates `state` — client tool calls are recorded
 * into the outcome and answered with synthetic tool_results; MCP research
 * runs server-side inside the API call. The one deliberate side-effect
 * channel is deps.deliver (incremental delivery): when present, each
 * send_message is handed to the shell the moment it is emitted.
 */
export async function runWake(
  state: WakeState,
  eventsInput: WakeEvent[],
  deps: Deps,
  opts: { now?: Date } = {},
): Promise<{ outcome: WakeOutcome; trace: WakeTrace; absorbed: WakeEvent[] }> {
  if (eventsInput.length === 0) throw new Error("runWake: no events");
  const events = [...eventsInput].sort((a, b) => a.at.localeCompare(b.at));
  const hasUserMessage = events.some((e) => e.type === "user_message");
  const started = deps.now().getTime();
  const system = assembleSystem(deps.prompts);
  // <current_time> is when this wake is being processed — the caller says
  // when that is. The shell passes the wall clock: a quiet-hours clamp or a
  // pause deferral can put hours or days between an event and its wake, and
  // a model reasoning from the event's timestamp writes «σήμερα» about
  // yesterday and schedules follow-ups a day early. Simulation (playground,
  // fixture replay) passes the simulated instant instead, which is why the
  // default — the last event's time — is the honest one for a replay.
  const now = opts.now ?? new Date(events[events.length - 1].at);
  const userTurn = assembleUserTurn(state, events, now);

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
  // Reader messages that arrived mid-run and were absorbed into this wake —
  // their own queued wakes are consumed by deps.absorb, so answering them
  // here is not optional: nobody else will.
  const absorbedAll: WakeEvent[] = [];
  const absorbNote = (events: WakeEvent[]): string => {
    const texts = events
      .filter((e): e is Extract<WakeEvent, { type: "user_message" }> => e.type === "user_message")
      .map((e) => `«${neutralizeFences(e.text)}»`);
    const count = texts.length === 1 ? "a new message" : `${texts.length} new messages`;
    return (
      `(reader update) The reader sent ${count} while you were working:\n` +
      texts.join("\n") +
      "\nThese are part of the conversation now. Respond to the reader's CURRENT " +
      "request: if the new message changes or cancels the earlier one, do not send " +
      "anything that no longer applies; if it adds a question, cover it too."
    );
  };
  const absorbAtTurnStart = async (): Promise<void> => {
    if (!deps.absorb) return;
    const news = await deps.absorb();
    if (news.length === 0) return;
    absorbedAll.push(...news);
    const note = absorbNote(news);
    recordInjected(note);
    // Merge into the trailing user message when one exists; the API's
    // message list stays well-formed either way.
    const last = messages[messages.length - 1] as { role?: string; content?: unknown };
    if (last?.role === "user" && Array.isArray(last.content)) {
      last.content.push({ type: "text", text: note });
    } else {
      messages.push({ role: "user", content: [{ type: "text", text: note }] });
    }
  };
  // How many times deps.deliver was invoked — attempted, not succeeded: a
  // transiently-failed row stays pending and the sweeper may still deliver
  // it, so any attempt at all makes a model re-run a duplicate risk.
  let deliveryAttempts = 0;
  let partialDeliveryError: string | undefined;
  let profileRewrite: string | undefined;
  const scheduledWakes: Array<{ at: string; reason: string }> = [];
  let unsubscribe: { reason: string } | undefined;
  let rationale = "";
  let refused = false;
  let repaired = false;
  let finished = false;
  // Instrument-panel truth: repairs that fired, and terminal anomalies. A
  // rescued or cut wake must never be indistinguishable from a healthy one —
  // the silence rate and the review queue read these records.
  const repairs: string[] = [];
  let truncated = false;
  // Nudges are recorded into the trace as injected turns so the inspector
  // shows the rescue; replay skips them.
  const recordInjected = (text: string) => {
    turns.push({
      role: "injected",
      content: [{ type: "text", text }],
      stopReason: "injected",
      usage: emptyUsage(),
    });
  };
  // Substantive prose written INSIDE a tool-calling turn — observed failure
  // mode: the model narrates part of its answer as a text block next to its
  // send_message calls, and that prose is never delivered.
  let strandedProse: string | undefined;
  // When a stranded-prose nudge fires, remember the genuine rationale of the
  // moment: if the nudged turn adds no new sends, the model's post-nudge
  // "rationale" is reliably meta chatter about the check itself.
  let preNudgeRationale: string | undefined;
  let sentAtNudge = -1;

  // Fail-forward fence: once a delivery attempt has been made, an error can
  // no longer roll this wake back — a retry would re-run the model after the
  // reader already received (or may yet receive) messages, and a duplicate
  // answer is worse than a truncated one. The loop finalizes with what it
  // has; before the first attempt, errors propagate and the queue retries.
  try {
  for (let turn = 0; turn < deps.config.maxTurns; turn++) {
    await absorbAtTurnStart();
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
      // Last look before bytes leave: if the reader wrote again while this
      // turn was streaming, hold its sends — the model re-decides with the
      // new message in hand instead of delivering a superseded answer.
      let holdNote: string | undefined;
      if (
        deps.absorb &&
        deps.deliver &&
        response.content.some((b) => isToolUseBlock(b) && b.name === "send_message")
      ) {
        const news = await deps.absorb();
        if (news.length > 0) {
          absorbedAll.push(...news);
          holdNote = absorbNote(news);
          repairs.push("reader-update/held-sends");
          recordInjected(holdNote);
        }
      }
      const results: unknown[] = [];
      for (const block of response.content) {
        if (!isToolUseBlock(block)) continue;
        let ack = "noted";
        switch (block.name) {
          case "send_message": {
            const t = String(block.input.text ?? "");
            if (holdNote) {
              ack =
                "held: the reader sent a new message before delivery (see the reader " +
                "update below) — nothing was sent; decide again what to send now";
              break;
            }
            if (t) {
              sent.push(t);
              if (deps.deliver) {
                deliveryAttempts++;
                const result = await deps.deliver(t);
                ack = result.ok
                  ? "delivered"
                  : `delivery failed: ${result.detail ?? "unknown error"} — the message ` +
                    "did not reach the reader now; do not repeat it verbatim";
              } else {
                ack = "delivered";
              }
            } else {
              ack = "delivered";
            }
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
            // Only the reader can unsubscribe the reader. On a wake without
            // a user_message there is no reader request to honor — prompt
            // guidance alone must not be the only thing standing between a
            // hallucinated call and a silent permanent opt-out.
            if (!hasUserMessage) {
              ack =
                "ignored: unsubscribe is only available while replying to the reader; " +
                "this wake has no reader message";
              break;
            }
            unsubscribe = { reason: String(block.input.reason ?? "") };
            break;
          case "finish_wake":
            if (holdNote) {
              ack = "not finished: address the reader's newest message first";
              break;
            }
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
        if (hasUserMessage && sent.length === 0 && !unsubscribe) {
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
          repairs.push(strandedProse ? "stranded-prose/finish" : "zero-send/finish");
          recordInjected(nudge);
          strandedProse = undefined;
        }
      }

      messages.push({ role: "assistant", content: response.content });
      // A tool_use stop with no client tool calls happens when the turn holds
      // only server-side (MCP) blocks. There is nothing for us to answer —
      // an empty user message is an API error — so continue like pause_turn.
      if (results.length > 0 || nudge || holdNote) {
        const extras = [
          ...(holdNote ? [{ type: "text", text: holdNote }] : []),
          ...(nudge ? [{ type: "text", text: nudge }] : []),
        ];
        const content = extras.length > 0 ? [...results, ...extras] : results;
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
      if (hasUserMessage && sent.length === 0 && !unsubscribe) {
        // Same rationale protection as the other three repair paths: if the
        // nudged turn adds no sends, post-nudge check-chatter must not become
        // the decision-log rationale the next thirty wakes read as memory.
        preNudgeRationale = rationale;
        sentAtNudge = sent.length;
        repaired = true;
        repairs.push("zero-send/end-turn");
        const nudge =
          "(system check) Your final text above is an operator rationale — it was NOT " +
          "delivered to the person, and they asked you something directly; they are " +
          "still waiting. If you meant to answer them, call send_message with the " +
          "message now. Either way, end with the wake's own rationale — about the " +
          "reader and this wake's decision, never about this check.";
        recordInjected(nudge);
        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: nudge });
        continue;
      }
      // (b) A tool-calling turn carried substantive prose next to its tool
      // calls: that prose was never delivered, and is often the missing half
      // of a multi-message answer.
      if (strandedProse) {
        preNudgeRationale = rationale;
        sentAtNudge = sent.length;
        repaired = true;
        repairs.push("stranded-prose/end-turn");
        const nudge =
          "(system check) In an earlier turn you wrote prose in the same turn as your " +
          "tool calls. That prose was NOT delivered — nothing reaches the person except " +
          "send_message content. The undelivered text was:\n«" +
          strandedProse.slice(0, 1200) +
          "»\nIf it was meant for the person, send it now with send_message, rephrased " +
          "if needed so the conversation still reads naturally. If it was only " +
          "reasoning, do not send it — give the wake's own rationale, about the reader " +
          "and this wake's decision, never about this check.";
        recordInjected(nudge);
        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: nudge });
        strandedProse = undefined;
        continue;
      }
    }

    // A turn cut at the token ceiling is not a decision: without the marker a
    // truncated wake records itself as a deliberate silence, inflating the
    // headline metric. The cut turn's tool calls are deliberately NOT
    // processed — a truncated tool_use block carries partial JSON.
    if (response.stop_reason === "max_tokens") {
      truncated = true;
    }

    // end_turn, max_tokens, or anything else: stop.
    break;
  }
  } catch (error) {
    if (deliveryAttempts === 0) throw error;
    partialDeliveryError = error instanceof Error ? error.message : String(error);
  }

  if (preNudgeRationale && sent.length === sentAtNudge) {
    rationale = preNudgeRationale;
  }

  const decision: "silence" | "send" = sent.length > 0 ? "send" : "silence";
  if (refused) {
    rationale = rationale || "refusal: the model declined to act on this wake.";
  }
  if (truncated && !rationale) {
    rationale = "(cut at the token ceiling — no decision was made)";
  }
  if (partialDeliveryError) {
    // The error is the story now — whatever rationale the model had written
    // describes a wake that did not finish the way it thought it would.
    rationale =
      `Το wake διακόπηκε από σφάλμα μετά από ${deliveryAttempts} απόπειρες παράδοσης: ` +
      partialDeliveryError;
  }
  if (!rationale) {
    rationale = "(no rationale emitted)";
  }

  // finish_wake is REQUIRED by the prompt; when the loop ends without it (and
  // without a terminal anomaly explaining why), record the contract breach.
  const finishWakeMissing = !finished && !refused && !truncated && !partialDeliveryError;

  const outcome: WakeOutcome = {
    decision,
    rationale,
    messages: sent,
    ...(repairs.length > 0 ? { repairs } : {}),
    ...(truncated ? { truncated: true as const } : {}),
    ...(finishWakeMissing ? { finishWakeMissing: true as const } : {}),
    ...(profileRewrite !== undefined ? { profileRewrite } : {}),
    scheduledWakes,
    ...(unsubscribe ? { unsubscribe } : {}),
    ...(partialDeliveryError !== undefined ? { partialDeliveryError } : {}),
  };

  const trace: WakeTrace = {
    system: system.map((s) => ({ text: s.text, cached: Boolean(s.cache_control) })),
    userTurn,
    turns,
    usageTotal,
    costUsd: usageToCost(usageTotal, deps.config.model),
    durationMs: deps.now().getTime() - started,
  };

  return { outcome, trace, absorbed: absorbedAll };
}

/**
 * Evolve a simulated state by one wake, the way the production shell's real
 * records would: the events' reader messages and the outcome's sent texts
 * join the conversation, and the derived decision entry joins the log. Used
 * by the simulation surfaces (dry-run, playground) — production reads both
 * from the database instead.
 */
export function applyOutcome(
  state: WakeState,
  events: WakeEvent[],
  outcome: WakeOutcome,
): WakeState {
  const ordered = [...events].sort((a, b) => a.at.localeCompare(b.at));
  const entry = buildDecisionEntry(ordered, outcome);
  return {
    ...state,
    profile: outcome.profileRewrite !== undefined ? outcome.profileRewrite : state.profile,
    conversation: [
      ...state.conversation,
      ...ordered
        .filter((e): e is Extract<WakeEvent, { type: "user_message" }> => e.type === "user_message")
        .map((e) => ({ at: e.at, from: "reader" as const, text: e.text })),
      ...outcome.messages.map((text) => ({ at: entry.at, from: "notis" as const, text })),
    ],
    decisions: [...state.decisions, entry],
  };
}
