import { partitionMeetingsForPolling, interleaveByCity } from "../pollableMeetings";

describe("partitionMeetingsForPolling", () => {
    it("marks a meeting with unlinked eligible subjects as pollable, not complete", () => {
        const result = partitionMeetingsForPolling(
            [{ id: "m1", name: "Συνεδρίαση 1" }],
            { m1: { linked: 1, eligible: 3 } },
        );
        expect(result.pollable).toHaveLength(1);
        expect(result.pollable[0].meetingId).toBe("m1");
        expect(result.pollable[0].alreadyComplete).toBe(false);
        expect(result.skipped).toHaveLength(0);
        expect(result.alreadyCompleteCount).toBe(0);
    });

    it("flags fully-linked meetings as pollable but alreadyComplete", () => {
        const result = partitionMeetingsForPolling(
            [{ id: "m1", name: "Συνεδρίαση 1" }],
            { m1: { linked: 3, eligible: 3 } },
        );
        expect(result.pollable).toHaveLength(1);
        expect(result.pollable[0].alreadyComplete).toBe(true);
        expect(result.alreadyCompleteCount).toBe(1);
    });

    it("skips meetings with no eligible subjects", () => {
        const result = partitionMeetingsForPolling(
            [{ id: "m1", name: "Συνεδρίαση 1" }],
            { m1: { linked: 0, eligible: 0 } },
        );
        expect(result.pollable).toHaveLength(0);
        expect(result.skipped).toHaveLength(1);
        expect(result.skipped[0].skipReason).toBe("noEligibleSubjects");
    });

    it("skips Λογοδοσία meetings even when they have eligible subjects", () => {
        const result = partitionMeetingsForPolling(
            [{ id: "m1", name: "Λογοδοσία Δημάρχου" }],
            { m1: { linked: 0, eligible: 2 } },
        );
        expect(result.pollable).toHaveLength(0);
        expect(result.skipped[0].skipReason).toBe("logodosia");
    });

    it("treats a meeting missing from decisionCounts as having no eligible subjects", () => {
        const result = partitionMeetingsForPolling(
            [{ id: "m1", name: "Συνεδρίαση 1" }],
            {},
        );
        expect(result.skipped).toHaveLength(1);
        expect(result.skipped[0].skipReason).toBe("noEligibleSubjects");
    });
});

describe("interleaveByCity", () => {
    const m = (cityId: string, id: string) => ({ cityId, id });

    it("round-robins across cities, preserving per-city order", () => {
        const result = interleaveByCity([
            m("a", "a1"), m("a", "a2"), m("a", "a3"),
            m("b", "b1"), m("b", "b2"),
            m("c", "c1"),
        ]);
        expect(result.map(x => x.id)).toEqual(["a1", "b1", "c1", "a2", "b2", "a3"]);
    });

    it("keeps a single-city list unchanged", () => {
        const result = interleaveByCity([m("a", "a1"), m("a", "a2")]);
        expect(result.map(x => x.id)).toEqual(["a1", "a2"]);
    });

    it("handles an empty list", () => {
        expect(interleaveByCity([])).toEqual([]);
    });

    it("starts city order from the first appearance in the input", () => {
        // Input is newest-first: city b has the newest meeting, so b leads.
        const result = interleaveByCity([m("b", "b1"), m("a", "a1"), m("b", "b2")]);
        expect(result.map(x => x.id)).toEqual(["b1", "a1", "b2"]);
    });
});
