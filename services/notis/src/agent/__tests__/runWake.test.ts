import { applyOutcome, runWake } from "../runWake";
import {
  FIXED_NOW,
  FakeAnthropic,
  makeDeps,
  makeState,
  meetingEvent,
  text,
  toolUse,
} from "./helpers";

describe("runWake", () => {
  it("silence: a single end_turn text yields silence with the text as rationale", async () => {
    const fake = new FakeAnthropic([
      { content: [text("Routine budget items only; nothing touching Κυψέλη. Staying quiet.")], stop_reason: "end_turn" },
    ]);
    const { outcome, trace } = await runWake(makeState(), [meetingEvent()], makeDeps(fake));

    expect(outcome.decision).toBe("silence");
    expect(outcome.messages).toEqual([]);
    expect(outcome.rationale).toContain("Staying quiet");
    expect(outcome.decision).toBe("silence");
    expect(trace.turns).toHaveLength(1);
  });

  it("a tool_use stop with only server-side MCP blocks continues without an empty tool_result message", async () => {
    const fake = new FakeAnthropic([
      {
        content: [
          {
            type: "mcp_tool_use",
            id: "mcp1",
            name: "get_subject",
            input: { subjectId: "s1" },
            server_name: "opencouncil",
          },
        ],
        stop_reason: "tool_use",
      },
      { content: [text("Τίποτα που να αξίζει μήνυμα.")], stop_reason: "end_turn" },
    ]);
    const { outcome, trace } = await runWake(makeState(), [meetingEvent()], makeDeps(fake));

    expect(outcome.decision).toBe("silence");
    expect(trace.turns).toHaveLength(2);
    // The follow-up request carries the assistant turn but NO empty user
    // message — the API rejects user messages with empty content.
    const followup = fake.requests[1].messages as Array<{ role: string; content: unknown }>;
    expect(followup).toHaveLength(2);
    expect(followup[1].role).toBe("assistant");
  });

  it("finish_wake in the send turn ends the wake in a single pass", async () => {
    const fake = new FakeAnthropic([
      {
        content: [
          toolUse("t1", "send_message", { text: "Ένα μήνυμα" }),
          toolUse("t2", "finish_wake", { rationale: "Άξιζε γιατί το ζήτησε." }),
        ],
        stop_reason: "tool_use",
      },
    ]);
    const { outcome, trace } = await runWake(
      makeState(),
      [{ type: "user_message", at: FIXED_NOW.toISOString(), text: "πες μου" }],
      makeDeps(fake),
    );

    expect(outcome.decision).toBe("send");
    expect(outcome.messages).toEqual(["Ένα μήνυμα"]);
    expect(outcome.rationale).toBe("Άξιζε γιατί το ζήτησε.");
    expect(trace.turns).toHaveLength(1);
    expect(fake.requests).toHaveLength(1);
  });

  it("finish_wake with no sends on a user message still gets the one repair nudge", async () => {
    const fake = new FakeAnthropic([
      {
        content: [toolUse("t1", "finish_wake", { rationale: "Της απάντησα ήδη νοερά." })],
        stop_reason: "tool_use",
      },
      {
        content: [
          toolUse("t2", "send_message", { text: "Η απάντηση." }),
          toolUse("t3", "finish_wake", { rationale: "Απάντησα μετά το nudge." }),
        ],
        stop_reason: "tool_use",
      },
    ]);
    const { outcome, trace } = await runWake(
      makeState(),
      [{ type: "user_message", at: FIXED_NOW.toISOString(), text: "λοιπόν;" }],
      makeDeps(fake),
    );

    expect(outcome.decision).toBe("send");
    expect(outcome.messages).toEqual(["Η απάντηση."]);
    expect(outcome.rationale).toBe("Απάντησα μετά το nudge.");
    // Two model turns plus the injected nudge, recorded for the inspector.
    expect(trace.turns).toHaveLength(3);
    expect(trace.turns[1].role).toBe("injected");
    expect(outcome.repairs).toEqual(["zero-send/finish"]);
  });

  it("repair: a user question answered only in final text gets one nudge to send", async () => {
    const fake = new FakeAnthropic([
      { content: [text("Η απάντηση, γραμμένη κατά λάθος μόνο στο rationale.")], stop_reason: "end_turn" },
      { content: [toolUse("t1", "send_message", { text: "Η πραγματική απάντηση." })], stop_reason: "tool_use" },
      { content: [text("Απάντησα γιατί ρώτησε ευθέως.")], stop_reason: "end_turn" },
    ]);
    const { outcome, trace } = await runWake(
      makeState(),
      [{ type: "user_message", at: FIXED_NOW.toISOString(), text: "τι έγινε τελικά;" }],
      makeDeps(fake),
    );

    expect(outcome.decision).toBe("send");
    expect(outcome.messages).toEqual(["Η πραγματική απάντηση."]);
    expect(trace.turns).toHaveLength(4);
    expect(trace.turns[1].role).toBe("injected");
    expect(outcome.repairs).toEqual(["zero-send/end-turn"]);
    // The nudge rides as a user turn on the second request…
    const secondReq = fake.requests[1].messages as Array<{ role: string; content: unknown }>;
    expect(String(secondReq[2].content)).toContain("system check");
  });

  it("repair: prose stranded next to send_message calls gets one nudge to deliver it", async () => {
    const stranded =
      "Ναι, υπήρξαν ακόμα δύο θέματα με συζήτηση — αυτό το κείμενο γράφτηκε δίπλα στα tool calls και δεν παραδόθηκε ποτέ.";
    const fake = new FakeAnthropic([
      {
        content: [text(stranded), toolUse("t1", "send_message", { text: "Δεύτερο μήνυμα" })],
        stop_reason: "tool_use",
      },
      { content: [text("Της έστειλα δύο θέματα.")], stop_reason: "end_turn" },
      { content: [toolUse("t2", "send_message", { text: "Πρώτο μήνυμα, ξανασταλμένο" })], stop_reason: "tool_use" },
      { content: [text("Έστειλα και τα δύο θέματα τελικά.")], stop_reason: "end_turn" },
    ]);
    const { outcome, trace } = await runWake(
      makeState(),
      [{ type: "user_message", at: FIXED_NOW.toISOString(), text: "τίποτα άλλο;" }],
      makeDeps(fake),
    );

    expect(outcome.decision).toBe("send");
    expect(outcome.messages).toEqual(["Δεύτερο μήνυμα", "Πρώτο μήνυμα, ξανασταλμένο"]);
    expect(trace.turns).toHaveLength(5);
    expect(outcome.repairs).toEqual(["stranded-prose/end-turn"]);
    // The nudge quotes the stranded prose back to the model.
    const contents = (fake.requests[2].messages as Array<{ content: unknown }>).map(
      (m) => m.content,
    );
    const nudge = contents.find(
      (c): c is string => typeof c === "string" && c.includes("NOT delivered"),
    );
    expect(nudge).toBeDefined();
    expect(nudge).toContain("δύο θέματα με συζήτηση");
  });

  it("repair never fires twice, and confirmed silence on a user message stands", async () => {
    const fake = new FakeAnthropic([
      { content: [text("Δεν χρειάζεται απάντηση.")], stop_reason: "end_turn" },
      { content: [text("Σιωπή: ήταν απλό «ok», δεν απαιτεί μήνυμα.")], stop_reason: "end_turn" },
    ]);
    const { outcome, trace } = await runWake(
      makeState(),
      [{ type: "user_message", at: FIXED_NOW.toISOString(), text: "ok" }],
      makeDeps(fake),
    );

    expect(outcome.decision).toBe("silence");
    // A nudged turn that adds no sends keeps the pre-nudge rationale: the
    // post-nudge text is reliably about the check, not the reader (the same
    // protection the other three repair paths carry).
    expect(outcome.rationale).toBe("Δεν χρειάζεται απάντηση.");
    expect(outcome.repairs).toEqual(["zero-send/end-turn"]);
    expect(trace.turns).toHaveLength(3);
  });

  it("send: send_message tool calls become ordered messages and tool_results echo back", async () => {
    const fake = new FakeAnthropic([
      {
        content: [
          toolUse("t1", "send_message", { text: "Πρώτο μήνυμα" }),
          toolUse("t2", "send_message", { text: "Δεύτερο μήνυμα" }),
        ],
        stop_reason: "tool_use",
      },
      { content: [text("Sent because the plaza affects her street.")], stop_reason: "end_turn" },
    ]);
    const { outcome } = await runWake(makeState(), [meetingEvent()], makeDeps(fake));

    expect(outcome.decision).toBe("send");
    expect(outcome.messages).toEqual(["Πρώτο μήνυμα", "Δεύτερο μήνυμα"]);
    expect(outcome.rationale).toBe("Sent because the plaza affects her street.");

    // Second request must carry the assistant turn + tool_results.
    const followup = fake.requests[1].messages as Array<{ role: string; content: unknown }>;
    expect(followup).toHaveLength(3);
    expect(followup[1].role).toBe("assistant");
    const results = followup[2].content as Array<{ type: string; tool_use_id: string; content: string }>;
    expect(results.map((r) => r.tool_use_id)).toEqual(["t1", "t2"]);
    expect(results[0].content).toBe("delivered");
  });

  it("profile rewrite: last update_taste_profile call wins", async () => {
    const fake = new FakeAnthropic([
      { content: [toolUse("t1", "update_taste_profile", { profile: "v1" })], stop_reason: "tool_use" },
      { content: [toolUse("t2", "update_taste_profile", { profile: "v2" })], stop_reason: "tool_use" },
      { content: [text("Updated what I know.")], stop_reason: "end_turn" },
    ]);
    const { outcome } = await runWake(makeState(), [meetingEvent()], makeDeps(fake));
    expect(outcome.profileRewrite).toBe("v2");
    expect(outcome.decision).toBe("silence");
  });

  it("schedule_wakeup calls accumulate", async () => {
    const fake = new FakeAnthropic([
      {
        content: [
          toolUse("t1", "schedule_wakeup", { at: "2026-04-01", reason: "check the tender" }),
          toolUse("t2", "schedule_wakeup", { at: "2026-05-01", reason: "follow the vote" }),
        ],
        stop_reason: "tool_use",
      },
      { content: [text("Will come back to it.")], stop_reason: "end_turn" },
    ]);
    const { outcome } = await runWake(makeState(), [meetingEvent()], makeDeps(fake));
    expect(outcome.scheduledWakes).toEqual([
      { at: "2026-04-01", reason: "check the tender" },
      { at: "2026-05-01", reason: "follow the vote" },
    ]);
  });

  it("unsubscribe_user sets unsubscribe and allows a goodbye message", async () => {
    const fake = new FakeAnthropic([
      {
        content: [
          toolUse("t1", "send_message", { text: "Να 'σαι καλά. Όποτε θες, εδώ είμαι." }),
          toolUse("t2", "unsubscribe_user", { reason: "asked to stop" }),
        ],
        stop_reason: "tool_use",
      },
      { content: [text("They wanted out; let them go warmly.")], stop_reason: "end_turn" },
    ]);
    const { outcome } = await runWake(makeState(), [meetingEvent()], makeDeps(fake));
    expect(outcome.unsubscribe).toEqual({ reason: "asked to stop" });
    expect(outcome.messages).toHaveLength(1);
  });

  it("refusal: outcome is silence with a rationale that always exists", async () => {
    const fake = new FakeAnthropic([{ content: [], stop_reason: "refusal" }]);
    const { outcome } = await runWake(makeState(), [meetingEvent()], makeDeps(fake));
    expect(outcome.decision).toBe("silence");
    expect(outcome.rationale.length).toBeGreaterThan(0);
  });

  it("pause_turn: assistant content is appended and the loop continues", async () => {
    const fake = new FakeAnthropic([
      { content: [text("looking things up...")], stop_reason: "pause_turn" },
      { content: [text("Nothing worth their attention.")], stop_reason: "end_turn" },
    ]);
    const { outcome } = await runWake(makeState(), [meetingEvent()], makeDeps(fake));
    expect(outcome.decision).toBe("silence");
    expect(fake.requests).toHaveLength(2);
    const second = fake.requests[1].messages as Array<{ role: string }>;
    expect(second[1].role).toBe("assistant");
  });

  it("maxTurns cap: loop stops and rationale still exists", async () => {
    const turns = Array.from({ length: 10 }, (_, i) => ({
      content: [toolUse(`t${i}`, "update_taste_profile", { profile: `v${i}` })],
      stop_reason: "tool_use",
    }));
    const fake = new FakeAnthropic(turns);
    const deps = makeDeps(fake);
    deps.config = { ...deps.config, maxTurns: 3 };
    const { outcome, trace } = await runWake(makeState(), [meetingEvent()], deps);
    expect(trace.turns).toHaveLength(3);
    expect(outcome.rationale.length).toBeGreaterThan(0);
  });

  it("usage sums across turns and prices at opus-5 rates", async () => {
    const fake = new FakeAnthropic([
      { content: [toolUse("t1", "send_message", { text: "μήνυμα" })], stop_reason: "tool_use" },
      { content: [text("done")], stop_reason: "end_turn" },
    ]);
    const { trace } = await runWake(makeState(), [meetingEvent()], makeDeps(fake));
    expect(trace.usageTotal).toEqual({ input: 2000, output: 200, cacheWrite: 0, cacheRead: 0 });
    // 2000/1M * $3 + 200/1M * $15 = 0.006 + 0.003
    expect(trace.costUsd).toBeCloseTo(0.009, 10);
  });

  it("purity: the input state is never mutated", async () => {
    const state = makeState();
    const snapshot = JSON.parse(JSON.stringify(state));
    const fake = new FakeAnthropic([
      { content: [toolUse("t1", "update_taste_profile", { profile: "new" })], stop_reason: "tool_use" },
      { content: [text("noted")], stop_reason: "end_turn" },
    ]);
    await runWake(state, [meetingEvent()], makeDeps(fake));
    expect(state).toEqual(snapshot);
  });

  it("applyOutcome appends the decision, evolves the conversation, applies rewrites", async () => {
    const fake = new FakeAnthropic([
      {
        content: [
          toolUse("t1", "update_taste_profile", { profile: "νέο προφίλ" }),
          toolUse("t2", "send_message", { text: "Η απάντηση." }),
          toolUse("t3", "finish_wake", { rationale: "απάντησα" }),
        ],
        stop_reason: "tool_use",
      },
    ]);
    const state = makeState();
    const events = [
      { type: "user_message" as const, at: FIXED_NOW.toISOString(), text: "Τι έγινε;" },
    ];
    const { outcome } = await runWake(state, events, makeDeps(fake));
    const next = applyOutcome(state, events, outcome);
    expect(next.profile).toBe("νέο προφίλ");
    expect(next.decisions).toHaveLength(1);
    expect(next.decisions[0]).toMatchObject({ event: "user_message", decision: "send" });
    // The conversation evolves the way production's real records would:
    // their message, then what the agent sent.
    expect(next.conversation.map((m) => m.text)).toEqual(["Τι έγινε;", "Η απάντηση."]);
    expect(state.decisions).toHaveLength(0);
    expect(state.conversation).toHaveLength(0);
  });
  it("a turn cut at max_tokens records truncation, not a decision", async () => {
    const fake = new FakeAnthropic([
      {
        // The cut turn even carries a send_message — its partial JSON must
        // not be processed, and the wake must not read as chosen silence.
        content: [toolUse("t1", "send_message", { text: "μισό μήνυ" })],
        stop_reason: "max_tokens",
      },
    ]);
    const { outcome } = await runWake(
      makeState(),
      [{ type: "user_message", at: FIXED_NOW.toISOString(), text: "τι έγινε;" }],
      makeDeps(fake),
    );

    expect(outcome.truncated).toBe(true);
    expect(outcome.decision).toBe("silence");
    expect(outcome.messages).toEqual([]);
    expect(outcome.truncated).toBe(true);
  });

  it("exactly one moving cache breakpoint survives across tool turns", async () => {
    const fake = new FakeAnthropic([
      { content: [toolUse("t1", "schedule_wakeup", { at: "2026-07-01", reason: "α" })], stop_reason: "tool_use" },
      { content: [toolUse("t2", "schedule_wakeup", { at: "2026-08-01", reason: "β" })], stop_reason: "tool_use" },
      { content: [toolUse("t3", "finish_wake", { rationale: "Τέλος." })], stop_reason: "tool_use" },
    ]);
    await runWake(
      makeState(),
      [{ type: "heartbeat", at: FIXED_NOW.toISOString() }],
      makeDeps(fake),
    );

    // The captured requests hold live references, so after the run they show
    // the final marker state. The API allows 4 breakpoints per request; the
    // fixed budget is one on the user turn plus ONE moving marker — a stale
    // marker left behind (markLatest failing to unmark) would accumulate and
    // 400 any wake with three or more tool turns in production.
    const lastRequest = fake.requests[fake.requests.length - 1];
    const messages = lastRequest.messages as Array<{ content: unknown }>;
    let markers = 0;
    for (const message of messages) {
      if (!Array.isArray(message.content)) continue;
      for (const block of message.content as Array<{ cache_control?: unknown }>) {
        if (block.cache_control) markers += 1;
      }
    }
    expect(markers).toBe(2);
  });

});
