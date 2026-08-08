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
    const { outcome, trace } = await runWake(makeState(), meetingEvent(), makeDeps(fake));

    expect(outcome.decision).toBe("silence");
    expect(outcome.messages).toEqual([]);
    expect(outcome.rationale).toContain("Staying quiet");
    expect(outcome.journalAppend.decision).toBe("silence");
    expect(outcome.journalAppend.at).toBe(FIXED_NOW.toISOString());
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
    const { outcome, trace } = await runWake(makeState(), meetingEvent(), makeDeps(fake));

    expect(outcome.decision).toBe("silence");
    expect(trace.turns).toHaveLength(2);
    // The follow-up request carries the assistant turn but NO empty user
    // message — the API rejects user messages with empty content.
    const followup = fake.requests[1].messages as Array<{ role: string; content: unknown }>;
    expect(followup).toHaveLength(2);
    expect(followup[1].role).toBe("assistant");
  });

  it("repair: a user question answered only in final text gets one nudge to send", async () => {
    const fake = new FakeAnthropic([
      { content: [text("Η απάντηση, γραμμένη κατά λάθος μόνο στο rationale.")], stop_reason: "end_turn" },
      { content: [toolUse("t1", "send_message", { text: "Η πραγματική απάντηση." })], stop_reason: "tool_use" },
      { content: [text("Απάντησα γιατί ρώτησε ευθέως.")], stop_reason: "end_turn" },
    ]);
    const { outcome, trace } = await runWake(
      makeState(),
      { type: "user_message", at: FIXED_NOW.toISOString(), text: "τι έγινε τελικά;" },
      makeDeps(fake),
    );

    expect(outcome.decision).toBe("send");
    expect(outcome.messages).toEqual(["Η πραγματική απάντηση."]);
    expect(trace.turns).toHaveLength(3);
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
      { type: "user_message", at: FIXED_NOW.toISOString(), text: "τίποτα άλλο;" },
      makeDeps(fake),
    );

    expect(outcome.decision).toBe("send");
    expect(outcome.messages).toEqual(["Δεύτερο μήνυμα", "Πρώτο μήνυμα, ξανασταλμένο"]);
    expect(trace.turns).toHaveLength(4);
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
      { type: "user_message", at: FIXED_NOW.toISOString(), text: "ok" },
      makeDeps(fake),
    );

    expect(outcome.decision).toBe("silence");
    expect(outcome.rationale).toContain("Σιωπή");
    expect(trace.turns).toHaveLength(2);
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
    const { outcome } = await runWake(makeState(), meetingEvent(), makeDeps(fake));

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
    const { outcome } = await runWake(makeState(), meetingEvent(), makeDeps(fake));
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
    const { outcome } = await runWake(makeState(), meetingEvent(), makeDeps(fake));
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
    const { outcome } = await runWake(makeState(), meetingEvent(), makeDeps(fake));
    expect(outcome.unsubscribe).toEqual({ reason: "asked to stop" });
    expect(outcome.messages).toHaveLength(1);
  });

  it("refusal: outcome is silence with a rationale that always exists", async () => {
    const fake = new FakeAnthropic([{ content: [], stop_reason: "refusal" }]);
    const { outcome } = await runWake(makeState(), meetingEvent(), makeDeps(fake));
    expect(outcome.decision).toBe("silence");
    expect(outcome.rationale.length).toBeGreaterThan(0);
  });

  it("pause_turn: assistant content is appended and the loop continues", async () => {
    const fake = new FakeAnthropic([
      { content: [text("looking things up...")], stop_reason: "pause_turn" },
      { content: [text("Nothing worth their attention.")], stop_reason: "end_turn" },
    ]);
    const { outcome } = await runWake(makeState(), meetingEvent(), makeDeps(fake));
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
    const { outcome, trace } = await runWake(makeState(), meetingEvent(), deps);
    expect(trace.turns).toHaveLength(3);
    expect(outcome.rationale.length).toBeGreaterThan(0);
  });

  it("usage sums across turns and prices at opus-5 rates", async () => {
    const fake = new FakeAnthropic([
      { content: [toolUse("t1", "send_message", { text: "μήνυμα" })], stop_reason: "tool_use" },
      { content: [text("done")], stop_reason: "end_turn" },
    ]);
    const { trace } = await runWake(makeState(), meetingEvent(), makeDeps(fake));
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
    await runWake(state, meetingEvent(), makeDeps(fake));
    expect(state).toEqual(snapshot);
  });

  it("applyOutcome appends the journal entry and applies profile rewrites", async () => {
    const fake = new FakeAnthropic([
      { content: [toolUse("t1", "update_taste_profile", { profile: "νέο προφίλ" })], stop_reason: "tool_use" },
      { content: [text("learned something")], stop_reason: "end_turn" },
    ]);
    const state = makeState();
    const { outcome } = await runWake(state, meetingEvent(), makeDeps(fake));
    const next = applyOutcome(state, outcome);
    expect(next.profile).toBe("νέο προφίλ");
    expect(next.journal).toHaveLength(1);
    expect(state.journal).toHaveLength(0);
  });
});
