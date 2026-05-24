import { applyUtteranceDeletions, restoreUtteranceDeletions } from "@/lib/utils/utterance-deletion";

type TestUtterance = {
  id: string;
  startTimestamp: number;
  endTimestamp: number;
};

type TestSegment = {
  id: string;
  startTimestamp: number;
  endTimestamp: number;
  utterances: TestUtterance[];
  label: string;
};

function makeTranscript(): TestSegment[] {
  return [
    {
      id: "segment-a",
      startTimestamp: 10,
      endTimestamp: 40,
      label: "A",
      utterances: [
        { id: "u-1", startTimestamp: 10, endTimestamp: 15 },
        { id: "u-2", startTimestamp: 20, endTimestamp: 25 },
        { id: "u-3", startTimestamp: 30, endTimestamp: 40 },
      ],
    },
    {
      id: "segment-b",
      startTimestamp: 45,
      endTimestamp: 80,
      label: "B",
      utterances: [
        { id: "u-4", startTimestamp: 45, endTimestamp: 50 },
        { id: "u-5", startTimestamp: 60, endTimestamp: 80 },
      ],
    },
  ];
}

describe("applyUtteranceDeletions", () => {
  it("removes utterances and recalculates segment boundaries", () => {
    const deletions = new Map<string, Set<string>>([
      ["segment-a", new Set(["u-1", "u-3"])],
      ["segment-b", new Set(["u-4"])],
    ]);

    const updated = applyUtteranceDeletions(makeTranscript(), deletions);

    expect(updated[0].utterances.map((u) => u.id)).toEqual(["u-2"]);
    expect(updated[0].startTimestamp).toBe(20);
    expect(updated[0].endTimestamp).toBe(25);

    expect(updated[1].utterances.map((u) => u.id)).toEqual(["u-5"]);
    expect(updated[1].startTimestamp).toBe(60);
    expect(updated[1].endTimestamp).toBe(80);
  });

  it("keeps an empty segment when all utterances are deleted", () => {
    const deletions = new Map<string, Set<string>>([
      ["segment-b", new Set(["u-4", "u-5"])],
    ]);

    const updated = applyUtteranceDeletions(makeTranscript(), deletions);
    const segmentB = updated.find((segment) => segment.id === "segment-b");

    expect(segmentB?.utterances).toEqual([]);
    expect(segmentB?.startTimestamp).toBe(45);
    expect(segmentB?.endTimestamp).toBe(80);
  });

  it("does not change transcript when there are no deletions", () => {
    const transcript = makeTranscript();
    const updated = applyUtteranceDeletions(transcript, new Map());
    expect(updated).toEqual(transcript);
  });
});

describe("restoreUtteranceDeletions", () => {
  const segment = {
    id: "s-1",
    startTimestamp: 10,
    endTimestamp: 40,
    label: "segment",
    utterances: [
      { id: "u-1", startTimestamp: 10, endTimestamp: 15 },
      { id: "u-2", startTimestamp: 20, endTimestamp: 25 },
      { id: "u-3", startTimestamp: 30, endTimestamp: 40 },
    ],
  };

  it("puts removed utterances back in time order and recalculates the bounds", () => {
    const removed = new Map([["s-1", [segment.utterances[0], segment.utterances[2]]]]);
    const deleted = applyUtteranceDeletions([segment], new Map([["s-1", new Set(["u-1", "u-3"])]]));

    const [restored] = restoreUtteranceDeletions(deleted, removed);

    expect(restored.utterances.map((u) => u.id)).toEqual(["u-1", "u-2", "u-3"]);
    expect(restored.startTimestamp).toBe(10);
    expect(restored.endTimestamp).toBe(40);
  });

  it("keeps changes made to the other utterances after the deletion", () => {
    const deleted = applyUtteranceDeletions([segment], new Map([["s-1", new Set(["u-1"])]]));
    const edited = deleted.map((s) => ({
      ...s,
      utterances: s.utterances.map((u) => (u.id === "u-2" ? { ...u, endTimestamp: 26 } : u)),
    }));

    const [restored] = restoreUtteranceDeletions(edited, new Map([["s-1", [segment.utterances[0]]]]));

    expect(restored.utterances.find((u) => u.id === "u-2")?.endTimestamp).toBe(26);
    expect(restored.utterances.map((u) => u.id)).toEqual(["u-1", "u-2", "u-3"]);
  });

  it("orders utterances with the same start time by id, like the transcript query", () => {
    const tied = {
      ...segment,
      utterances: [
        { id: "u-a", startTimestamp: 10, endTimestamp: 12 },
        { id: "u-b", startTimestamp: 10, endTimestamp: 14 },
      ],
    };
    const deleted = applyUtteranceDeletions([tied], new Map([["s-1", new Set(["u-a"])]]));

    const [restored] = restoreUtteranceDeletions(deleted, new Map([["s-1", [tied.utterances[0]]]]));

    expect(restored.utterances.map((u) => u.id)).toEqual(["u-a", "u-b"]);
  });

  it("does not add an utterance twice", () => {
    const [restored] = restoreUtteranceDeletions([segment], new Map([["s-1", [segment.utterances[0]]]]));
    expect(restored.utterances).toHaveLength(3);
  });
});
