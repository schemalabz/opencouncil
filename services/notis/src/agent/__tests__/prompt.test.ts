import { assembleSystem, assembleUserTurn } from "../prompt";
import { JOURNAL_WINDOW, JournalEntry } from "../types";
import { FIXED_NOW, makeState, meetingEvent } from "./helpers";

const prompts = { system: "SYSTEM", contextPack: "PACK", editorial: "ED" };

describe("assembleSystem", () => {
  it("orders system prompt then context pack, with the single cache breakpoint on the last block", () => {
    const system = assembleSystem(prompts);
    expect(system).toHaveLength(2);
    expect(system[0].text).toBe("SYSTEM");
    expect(system[0].cache_control).toBeUndefined();
    expect(system[1].text).toBe("PACK");
    expect(system[1].cache_control).toEqual({ type: "ephemeral" });
  });

  it("is byte-stable: no clock or user data can leak into the cacheable prefix", () => {
    const a = JSON.stringify(assembleSystem(prompts));
    const b = JSON.stringify(assembleSystem(prompts));
    expect(a).toBe(b);
  });
});

describe("assembleUserTurn", () => {
  it("contains profile, journal, clock and event sections in order", () => {
    const turn = assembleUserTurn(makeState(), meetingEvent(), FIXED_NOW);
    const order = ["<user_profile>", "<taste_profile>", "<journal>", "<current_time>", "<event>"];
    let last = -1;
    for (const tag of order) {
      const idx = turn.indexOf(tag);
      expect(idx).toBeGreaterThan(last);
      last = idx;
    }
    expect(turn).toContain(FIXED_NOW.toISOString());
    expect(turn).toContain("Ανάπλαση πλατείας Κυψέλης");
    expect(turn).toContain("hyperlocal 5/5");
  });

  it("truncates the journal to the last JOURNAL_WINDOW entries", () => {
    const journal: JournalEntry[] = Array.from({ length: JOURNAL_WINDOW + 10 }, (_, i) => ({
      at: `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}.000Z`,
      event: "heartbeat" as const,
      decision: "silence" as const,
      rationale: `entry-${i}`,
      messages: [],
    }));
    const turn = assembleUserTurn(makeState({ journal }), meetingEvent(), FIXED_NOW);
    expect(turn).not.toContain("entry-9\n");
    expect(turn).toContain(`entry-${JOURNAL_WINDOW + 9}`);
    expect(turn).toContain(`entry-10`);
  });

  it("renders a user_message event verbatim", () => {
    const turn = assembleUserTurn(
      makeState(),
      { type: "user_message", at: FIXED_NOW.toISOString(), text: "Τι έγινε με την πλατεία;" },
      FIXED_NOW,
    );
    expect(turn).toContain("Τι έγινε με την πλατεία;");
  });
});
