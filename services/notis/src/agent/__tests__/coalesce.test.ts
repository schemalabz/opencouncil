import { buildDecisionEntry } from "../decisions";
import { assembleUserTurn } from "../prompt";
import { primaryEvent } from "../schemas";
import { runWake } from "../runWake";
import { WakeEvent } from "../types";
import { FakeAnthropic, makeDeps, makeState, meetingEvent, toolUse } from "./helpers";

/** Coalesced (multi-event) wakes: ordering, priority, decision shape. */

const T1 = "2026-03-09T10:00:00.000Z";
const T2 = "2026-03-10T10:00:00.000Z";

const userMsg: WakeEvent = { type: "user_message", at: T1, text: "τι έγινε;" };
const scheduled: WakeEvent = { type: "scheduled", at: T2, reason: "check back" };

describe("primaryEvent", () => {
  it("user_message beats meetings beats scheduled", () => {
    const summarized = meetingEvent();
    expect(primaryEvent([scheduled, summarized]).type).toBe("meeting_summarized");
    expect(primaryEvent([summarized, userMsg]).type).toBe("user_message");
    expect(primaryEvent([scheduled])).toBe(scheduled);
  });

  it("throws on an empty array", () => {
    expect(() => primaryEvent([])).toThrow("empty");
  });
});

describe("assembleUserTurn with several events", () => {
  it("renders each event in order with a factual preamble; single events get neither", () => {
    const single = assembleUserTurn(makeState(), [meetingEvent()], new Date(T2));
    expect(single).not.toContain("arrived together");
    expect(single.match(/<event>/g)).toHaveLength(1);

    const multi = assembleUserTurn(
      makeState(),
      [userMsg, { ...meetingEvent(), at: T2 } as WakeEvent],
      new Date(T2),
    );
    expect(multi).toContain("2 events arrived together");
    expect(multi.match(/<event>/g)).toHaveLength(2);
    expect(multi.indexOf("τι έγινε;")).toBeLessThan(multi.indexOf("Editorial brief"));
  });
});

describe("buildDecisionEntry over several events", () => {
  it("labels by the primary event and dates by the last", () => {
    const entry = buildDecisionEntry([userMsg, { ...meetingEvent(), at: T2 } as WakeEvent], {
      decision: "send",
      rationale: "γιατί",
      messages: ["μήνυμα"],
      scheduledWakes: [],
    });
    expect(entry.event).toBe("user_message");
    expect(entry.at).toBe(T2);
    expect(entry.decision).toBe("send");
  });
});

describe("runWake over several events", () => {
  it("consumes all events in one invocation, current_time = last event", async () => {
    const fake = new FakeAnthropic([
      {
        content: [toolUse("t1", "finish_wake", { rationale: "Τίποτα νέο." })],
        stop_reason: "tool_use",
      },
      // The post-nudge turn: the silence is owned this time.
      {
        content: [toolUse("t2", "finish_wake", { rationale: "Επιμένω — τίποτα νέο." })],
        stop_reason: "tool_use",
      },
    ]);

    const { outcome, trace } = await runWake(
      makeState(),
      // Deliberately out of order: runWake sorts by time.
      [{ ...meetingEvent(), at: T2 } as WakeEvent, userMsg],
      makeDeps(fake),
    );

    expect(trace.userTurn).toContain("2 events arrived together");
    expect(trace.userTurn).toContain(`<current_time>${T2}</current_time>`);
    expect(trace.userTurn.indexOf("τι έγινε;")).toBeLessThan(
      trace.userTurn.indexOf("Editorial brief"),
    );
    // A user_message is present and nothing was sent — the repair pass
    // nudges once before accepting the silence.
    expect(outcome.repairs?.length ?? 0).toBeGreaterThan(0);
  });
});
