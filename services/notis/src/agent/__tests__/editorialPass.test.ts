import { editorialPass } from "../editorialPass";
import { FakeAnthropic, makeDeps, text } from "./helpers";

const meeting = {
  id: "m1",
  name: "Συνεδρίαση",
  dateTime: "2026-03-09T18:00:00Z",
  subjects: [
    { id: "s-small", name: "Έγκριση πρακτικών", discussionSeconds: 10, topic: null },
    {
      id: "s-big",
      name: "Ανάπλαση πλατείας",
      discussionSeconds: 1800,
      topic: { name: "Πολεοδομία" },
    },
  ],
};

function fakeModelBrief() {
  return {
    headline: "Η ανάπλαση κυριάρχησε.",
    subjects: [
      {
        subjectId: "s-big",
        scores: { hyperlocal: 9, citywide: 2, contention: -1, novelty: 3.7, money: 4 },
        note: "Μεγάλο έργο.",
        locationHints: ["Κυψέλη"],
      },
      {
        subjectId: "s-small",
        scores: { hyperlocal: 0, citywide: 0, contention: 0, novelty: 0, money: 0 },
        note: "Τυπικό.",
        locationHints: [],
      },
    ],
  };
}

describe("editorialPass", () => {
  it("fetches the meeting, sorts subjects by discussion time, and clamps scores to 0-5", async () => {
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const fake = new FakeAnthropic([
      { content: [text(JSON.stringify(fakeModelBrief()))], stop_reason: "end_turn" },
    ]);
    const deps = makeDeps(fake, {
      mcp: {
        call: async (tool, args) => {
          calls.push({ tool, args });
          if (tool === "get_meeting") return meeting;
          if (tool === "get_subject") return { id: args.subjectId, description: "λεπτομέρειες" };
          return null;
        },
      },
    });

    const { brief } = await editorialPass("athens", "m1", deps);

    expect(calls[0]).toEqual({ tool: "get_meeting", args: { cityId: "athens", meetingId: "m1" } });
    // Detail fetch only for the discussed subject (s-small has 10s and comes after s-big).
    expect(calls.filter((c) => c.tool === "get_subject").map((c) => c.args.subjectId)).toEqual([
      "s-big",
      "s-small",
    ]);

    // Sorted by discussionSeconds desc.
    expect(brief.subjects.map((s) => s.subjectId)).toEqual(["s-big", "s-small"]);
    // Clamped: 9→5, -1→0, 3.7→4.
    expect(brief.subjects[0].scores).toEqual({
      hyperlocal: 5,
      citywide: 2,
      contention: 0,
      novelty: 4,
      money: 4,
    });
    expect(brief.headline).toBe("Η ανάπλαση κυριάρχησε.");
    expect(brief.generatedAt).toBe("2026-03-10T10:00:00.000Z");

    // The model input carries subjects sorted desc by discussion time.
    const userContent = String(
      (fake.requests[0].messages as Array<{ content: string }>)[0].content,
    );
    expect(userContent.indexOf("s-big")).toBeLessThan(userContent.indexOf("s-small"));
    // Structured output requested.
    expect(fake.requests[0].output_config).toBeDefined();
  });
});
