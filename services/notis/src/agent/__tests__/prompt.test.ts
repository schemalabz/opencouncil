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
    expect(system[1].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
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

  it("computes per-subject distances to the reader's coordinate-bearing places", () => {
    const state = makeState({
      user: {
        name: "Μαρία",
        cities: [
          {
            cityId: "athens",
            cityName: "Αθήνα",
            topics: [],
            // One place with coordinates, one legacy free-text place.
            locations: [{ text: "Σπίτι", lng: 23.712, lat: 37.97 }, "Κυψέλη"],
          },
          {
            cityId: "zografou",
            cityName: "Ζωγράφου",
            topics: [],
            // Another city's pin: never measured against an Athens meeting.
            locations: [{ text: "Πανεπιστημιούπολη", lng: 23.766, lat: 37.977 }],
          },
        ],
      },
    });
    const event = meetingEvent();
    const brief = (event as Extract<typeof event, { type: "meeting_summarized" }>).brief;
    brief.subjects[0].location = { text: "Πλατεία Κυψέλης", lng: 23.7405, lat: 37.9948 };

    const turn = assembleUserTurn(state, event, FIXED_NOW);
    expect(turn).toContain("distance from their places:");
    expect(turn).toMatch(/χλμ από «Σπίτι»/);
    // The coordless legacy place renders in the profile but gets no distance.
    expect(turn).not.toContain("από «Κυψέλη»");
    // Distances stay within the meeting's city.
    expect(turn).not.toContain("από «Πανεπιστημιούπολη»");
    expect(turn).toContain("places [Σπίτι; Κυψέλη]");
  });

  it("renders no distance line when the reader has no coordinates", () => {
    const event = meetingEvent();
    const brief = (event as Extract<typeof event, { type: "meeting_summarized" }>).brief;
    brief.subjects[0].location = { text: "Πλατεία Κυψέλης", lng: 23.7405, lat: 37.9948 };
    const turn = assembleUserTurn(makeState(), event, FIXED_NOW);
    expect(turn).not.toContain("distance from their places:");
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

  it("journal entries carry the user's past words so the conversation is remembered", () => {
    const state = makeState({
      journal: [
        {
          at: "2026-03-01T10:00:00.000Z",
          event: "user_message",
          decision: "send",
          rationale: "answered directly",
          messages: ["Η απάντηση."],
          received: "Πότε φτιάχνεται ο δρόμος μας;",
        },
      ],
    });
    const turn = assembleUserTurn(state, meetingEvent(), FIXED_NOW);
    expect(turn).toContain("they wrote: «Πότε φτιάχνεται ο δρόμος μας;»");
    expect(turn).toContain("sent: «Η απάντηση.»");
  });
});
