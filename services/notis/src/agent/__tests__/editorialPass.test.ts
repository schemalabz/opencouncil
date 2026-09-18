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
  it("asks the model nothing about a meeting with no subjects", async () => {
    // The schema pins subjectId to an enum of the subject ids, and the API
    // refuses an empty enum outright: 400 «Enum must be a non-empty array».
    // A λογοδοσία session arrives exactly like this — an agenda PDF with no
    // numbered items — and the poller retried the rejected request on every
    // tick until the row aged out of the event feed.
    const fake = new FakeAnthropic([]);
    const deps = makeDeps(fake, {
      mcp: {
        call: async (tool) =>
          tool === "get_meeting"
            ? { id: "m1", name: "Ειδική Συνεδρίαση Λογοδοσίας", subjects: [], url: "https://x/m1" }
            : null,
      },
    });

    const { brief, costUsd } = await editorialPass("chalandri", "m1", deps);

    expect(fake.requests).toHaveLength(0);
    expect(brief.subjects).toEqual([]);
    expect(brief.meetingUrl).toBe("https://x/m1");
    expect(brief.headline).not.toBe("");
    expect(costUsd).toBe(0);
  });

  it("does not pin subjectId to the meeting's ids, which made an empty agenda invalid", async () => {
    // The 400 that started this: an enum of the subject ids is empty for a
    // meeting with no subjects, and «Enum must be a non-empty array» is a
    // request the API refuses before it reads anything else. The response is
    // matched by id afterwards, so the enum bought nothing.
    const fake = new FakeAnthropic([
      { content: [text(JSON.stringify(fakeModelBrief()))], stop_reason: "end_turn" },
    ]);
    const deps = makeDeps(fake, {
      mcp: { call: async (tool) => (tool === "get_meeting" ? meeting : null) },
    });

    await editorialPass("athens", "m1", deps);

    const schema = JSON.stringify(
      (fake.requests[0] as { output_config?: unknown }).output_config ?? fake.requests[0],
    );
    expect(schema).toContain('"subjectId"');
    expect(schema).not.toContain('"enum"');
  });

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
