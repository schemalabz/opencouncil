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
