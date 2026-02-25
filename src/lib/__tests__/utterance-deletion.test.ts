import { applyUtteranceDeletions } from "@/lib/transcript/utterance-deletion";

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

const transcript: TestSegment[] = [
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

describe("applyUtteranceDeletions", () => {
  it("removes utterances and recalculates segment boundaries", () => {
    const deletions = new Map<string, Set<string>>([
      ["segment-a", new Set(["u-1", "u-3"])],
      ["segment-b", new Set(["u-4"])],
    ]);

    const updated = applyUtteranceDeletions(transcript, deletions);

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

    const updated = applyUtteranceDeletions(transcript, deletions);
    const segmentB = updated.find((segment) => segment.id === "segment-b");

    expect(segmentB?.utterances).toEqual([]);
    expect(segmentB?.startTimestamp).toBe(45);
    expect(segmentB?.endTimestamp).toBe(80);
  });

  it("does not change transcript when there are no deletions", () => {
    const updated = applyUtteranceDeletions(transcript, new Map());
    expect(updated).toEqual(transcript);
  });
});
