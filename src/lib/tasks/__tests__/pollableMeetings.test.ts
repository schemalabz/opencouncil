import { partitionMeetingsForPolling } from "../pollableMeetings";

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
